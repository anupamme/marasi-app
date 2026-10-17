package main

import (
	"net/http"
	"strings"
	"testing"
)

func TestReleaseCheckWithNothingNewerReportsTheLatestRelease(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "17.10.2026", releases)

	check := app.CheckForUpdate()

	if check.Outcome != UpdateOutcomeNone || check.Channel != "release" || check.Update != nil {
		t.Fatalf("wanted no update on the release channel, got %+v", check)
	}
	if events.has(updateAvailableEvent) {
		t.Fatalf("wanted no %s event, got %v", updateAvailableEvent, events.names)
	}
	if got := releases.requested(); len(got) != 1 || got[0] != "GET /releases/latest" {
		t.Fatalf("wanted one request for the latest release, got %v", got)
	}
}

func TestReleaseCheckIgnoresPrereleases(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	releases.publish(fakeRelease{Tag: "nightly", Name: "18.10.2026 (nightly abc1234)", Prerelease: true})
	app, _ := newUpdateApp(t, "release", "17.10.2026", releases)

	if check := app.CheckForUpdate(); check.Outcome != UpdateOutcomeNone {
		t.Fatalf("wanted the nightly ignored on the release channel, got %+v", check)
	}
}

func TestFailedReleaseCheckSaysWhy(t *testing.T) {
	cases := []struct {
		name   string
		setup  func(*fakeReleaseServer)
		reason string
	}{
		{"GitHub errors", func(r *fakeReleaseServer) { r.fail(http.StatusBadGateway) }, "GitHub answered 502"},
		{"GitHub is unreachable", func(r *fakeReleaseServer) { r.server.Close() }, "could not reach GitHub"},
		{"no release is published", func(*fakeReleaseServer) {}, "no release is published"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			releases := newFakeReleaseServer(t)
			c.setup(releases)
			app, events := newUpdateApp(t, "release", "17.10.2026", releases)

			check := app.CheckForUpdate()

			if check.Outcome != UpdateOutcomeFailed || !strings.Contains(check.Reason, c.reason) {
				t.Fatalf("wanted a failed check saying %q, got %q (%s)", c.reason, check.Outcome, check.Reason)
			}
			if events.has(updateAvailableEvent) {
				t.Fatalf("wanted no %s event, got %v", updateAvailableEvent, events.names)
			}
		})
	}
}

func TestDevelopmentBuildNeverChecks(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "dev", "dev", releases)

	check := app.CheckForUpdate()
	state := app.GetUpdateState()

	if check.Outcome != UpdateOutcomeUnavailable {
		t.Fatalf("wanted updates unavailable, got %+v", check)
	}
	if state.Status != UpdateStatusUnavailable {
		t.Fatalf("wanted the update state unavailable, got %+v", state)
	}
	if n := releases.requestCount(); n != 0 {
		t.Fatalf("wanted no request to GitHub, got %v", releases.requested())
	}
	if len(events.names) != 0 {
		t.Fatalf("wanted no events, got %v", events.names)
	}
}

func TestUpdateStateShowsTheUpdateAFrontendMissed(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "Notes.")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)

	if state := app.GetUpdateState(); state.Status != UpdateStatusIdle || state.Update != nil {
		t.Fatalf("wanted idle before any check, got %+v", state)
	}
	app.CheckForUpdate()
	state := app.GetUpdateState()

	if state.Status != UpdateStatusAvailable || state.Update == nil || state.Update.Version != "17.10.2026" {
		t.Fatalf("wanted release 17.10.2026 available, got %+v", state)
	}
	if state.Running.Version != "16.10.2026" || state.Channel != "release" {
		t.Fatalf("wanted the running release build, got %+v", state)
	}
}

func TestFailedCheckKeepsTheKnownUpdate(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	app.CheckForUpdate()

	releases.fail(http.StatusServiceUnavailable)
	app.CheckForUpdate()

	if state := app.GetUpdateState(); state.Status != UpdateStatusAvailable || state.Update == nil {
		t.Fatalf("wanted the update still available after a failed check, got %+v", state)
	}
}

func TestReleaseCheckFindsANewerReleaseWithItsNotes(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "Ledger redesign.")
	app, events := newUpdateApp(t, "release", "01.10.2026", releases)

	check := app.CheckForUpdate()

	if check.Outcome != UpdateOutcomeAvailable {
		t.Fatalf("wanted an available update, got %q (%s)", check.Outcome, check.Reason)
	}
	update := check.Update
	if update == nil || update.Version != "17.10.2026" || update.Notes != "Ledger redesign." || update.Channel != "release" {
		t.Fatalf("wanted release 17.10.2026 with its notes, got %+v", update)
	}
	if update.ReleasePage != "https://github.com/tfkr-ae/marasi-app/releases/tag/17.10.2026" {
		t.Fatalf("wanted the release page, got %q", update.ReleasePage)
	}
	if check.Running.Version != "01.10.2026" {
		t.Fatalf("wanted the running version, got %+v", check.Running)
	}
	data, ok := events.first(updateAvailableEvent)
	if !ok || len(data) != 1 {
		t.Fatalf("wanted one %s event, got %v", updateAvailableEvent, events.names)
	}
	if emitted, _ := data[0].(Update); emitted.Version != "17.10.2026" {
		t.Fatalf("wanted the event to carry the update, got %+v", data[0])
	}
}

func TestReleaseCheckOffersOnlyANewerRelease(t *testing.T) {
	cases := []struct {
		name    string
		running string
		latest  string
		update  bool
	}{
		{"a later day", "16.10.2026", "17.10.2026", true},
		{"a later month on an earlier day", "30.09.2026", "01.10.2026", true},
		{"a later year", "31.12.2025", "01.01.2026", true},
		{"the same release", "17.10.2026", "17.10.2026", false},
		{"an older release", "17.10.2026", "16.10.2026", false},
		{"an older year on a later day", "01.01.2026", "31.12.2025", false},
		{"a same-day re-release", "17.10.2026", "17.10.2026-1", true},
		{"the plain tag after a re-release", "17.10.2026-1", "17.10.2026", false},
		{"a later re-release", "17.10.2026-1", "17.10.2026-2", true},
		{"re-releases in natural order", "17.10.2026-9", "17.10.2026-10", true},
		{"an earlier re-release", "17.10.2026-10", "17.10.2026-9", false},
		{"the same re-release", "17.10.2026-2", "17.10.2026-2", false},
		{"a later day after a re-release", "17.10.2026-3", "18.10.2026", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			releases := newFakeReleaseServer(t)
			releases.publishRelease(c.latest, "")
			app, events := newUpdateApp(t, "release", c.running, releases)

			check := app.CheckForUpdate()

			if check.Outcome == UpdateOutcomeFailed {
				t.Fatalf("check failed: %s", check.Reason)
			}
			if got := check.Outcome == UpdateOutcomeAvailable; got != c.update {
				t.Fatalf("running %s with %s published: wanted update %v, got %q", c.running, c.latest, c.update, check.Outcome)
			}
			if events.has(updateAvailableEvent) != c.update {
				t.Fatalf("wanted %s emitted %v, got %v", updateAvailableEvent, c.update, events.names)
			}
		})
	}
}
