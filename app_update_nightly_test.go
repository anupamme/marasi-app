package main

import (
	"strings"
	"testing"
)

// publishNightly publishes the nightly as the nightly workflow does: tagged
// "nightly", titled with its version string, with the full commit in its
// notes.
func publishNightly(releases *fakeReleaseServer, version, commit string) {
	releases.publish(fakeRelease{
		Tag:        "nightly",
		Name:       version,
		Notes:      "Ref: main\nCommit: " + commit + "\n",
		Prerelease: true,
	})
}

func TestNightlyCheckOffersASameDayNightlyFromAnotherCommit(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	publishNightly(releases, "17.10.2026 (nightly def5678)", "def5678aaaabbbbccccddddeeeeffff0000111122")
	app, events := newUpdateApp(t, "nightly", "17.10.2026 (nightly abc1234)", releases)

	check := app.CheckForUpdate()

	if check.Outcome != UpdateOutcomeAvailable || check.Channel != "nightly" {
		t.Fatalf("wanted a nightly update, got %q (%s)", check.Outcome, check.Reason)
	}
	update := check.Update
	if update.Channel != "nightly" || update.Version != "17.10.2026 (nightly def5678)" {
		t.Fatalf("wanted the nightly's version, got %+v", update)
	}
	if update.Commit != "def5678aaaabbbbccccddddeeeeffff0000111122" {
		t.Fatalf("wanted the nightly's commit, got %q", update.Commit)
	}
	want := "https://github.com/tfkr-ae/marasi-app/compare/abc1234...def5678aaaabbbbccccddddeeeeffff0000111122"
	if update.CompareURL != want {
		t.Fatalf("wanted the compare link %q, got %q", want, update.CompareURL)
	}
	if !events.has(updateAvailableEvent) {
		t.Fatalf("wanted %s emitted, got %v", updateAvailableEvent, events.names)
	}
	if got := releases.requested(); len(got) != 1 || got[0] != "GET /releases/tags/nightly" {
		t.Fatalf("wanted one request for the nightly, got %v", got)
	}
}

func TestNightlyCheckOffersOnlyAnotherCommitDatedOnOrAfterTheRunningBuild(t *testing.T) {
	cases := []struct {
		name      string
		running   string
		published string
		commit    string
		update    bool
	}{
		{"the same commit", "17.10.2026 (nightly abc1234)", "17.10.2026 (nightly abc1234)", "abc1234ffff0000", false},
		{"the same commit published a day later", "17.10.2026 (nightly abc1234)", "18.10.2026 (nightly abc1234)", "abc1234ffff0000", false},
		{"the same commit in capitals", "17.10.2026 (nightly abc1234)", "18.10.2026 (nightly ABC1234)", "ABC1234FFFF0000", false},
		{"another commit the same day", "17.10.2026 (nightly abc1234)", "17.10.2026 (nightly def5678)", "def5678ffff0000", true},
		{"another commit a later day", "17.10.2026 (nightly abc1234)", "18.10.2026 (nightly def5678)", "def5678ffff0000", true},
		{"another commit a later month on an earlier day", "30.09.2026 (nightly abc1234)", "01.10.2026 (nightly def5678)", "def5678ffff0000", true},
		{"another commit an earlier day", "17.10.2026 (nightly abc1234)", "16.10.2026 (nightly def5678)", "def5678ffff0000", false},
		{"another commit an earlier year on a later day", "01.01.2026 (nightly abc1234)", "31.12.2025 (nightly def5678)", "def5678ffff0000", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			releases := newFakeReleaseServer(t)
			publishNightly(releases, c.published, c.commit)
			app, events := newUpdateApp(t, "nightly", c.running, releases)

			check := app.CheckForUpdate()

			if check.Outcome == UpdateOutcomeFailed {
				t.Fatalf("check failed: %s", check.Reason)
			}
			if got := check.Outcome == UpdateOutcomeAvailable; got != c.update {
				t.Fatalf("running %s with %s published: wanted update %v, got %q", c.running, c.published, c.update, check.Outcome)
			}
			if events.has(updateAvailableEvent) != c.update {
				t.Fatalf("wanted %s emitted %v, got %v", updateAvailableEvent, c.update, events.names)
			}
			if state := app.GetUpdateState(); (state.Status == UpdateStatusAvailable) != c.update {
				t.Fatalf("wanted the update state available %v, got %+v", c.update, state)
			}
		})
	}
}

func TestManualNightlyCheckWithNoNightlyPublishedFailsAndCanBeRetried(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "nightly", "17.10.2026 (nightly abc1234)", releases)

	check := app.CheckForUpdate()

	if check.Outcome != UpdateOutcomeFailed || !strings.Contains(check.Reason, "try again") {
		t.Fatalf("wanted a failed check that says to try again, got %q (%s)", check.Outcome, check.Reason)
	}
	if events.has(updateAvailableEvent) {
		t.Fatalf("wanted no %s event, got %v", updateAvailableEvent, events.names)
	}

	publishNightly(releases, "17.10.2026 (nightly def5678)", "def5678ffff0000")
	if retry := app.CheckForUpdate(); retry.Outcome != UpdateOutcomeAvailable {
		t.Fatalf("wanted the retry to find the new nightly, got %q (%s)", retry.Outcome, retry.Reason)
	}
}

func TestNightlyCheckFailsWhenThePublishedNightlyCannotBeRead(t *testing.T) {
	cases := []struct {
		name    string
		release fakeRelease
		reason  string
	}{
		{"no version in its title", fakeRelease{Tag: "nightly", Name: "Nightly", Notes: "Commit: def5678ffff0000"}, "not a nightly version"},
		{"no commit in its notes", fakeRelease{Tag: "nightly", Name: "17.10.2026 (nightly def5678)", Notes: "Ref: main"}, "which commit"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			releases := newFakeReleaseServer(t)
			c.release.Prerelease = true
			releases.publish(c.release)
			app, _ := newUpdateApp(t, "nightly", "17.10.2026 (nightly abc1234)", releases)

			check := app.CheckForUpdate()

			if check.Outcome != UpdateOutcomeFailed || !strings.Contains(check.Reason, c.reason) {
				t.Fatalf("wanted a failed check saying %q, got %q (%s)", c.reason, check.Outcome, check.Reason)
			}
		})
	}
}

func TestWithNoChannelSavedTheAppFollowsTheChannelOfItsBuild(t *testing.T) {
	cases := []struct {
		build, version, request string
	}{
		{"nightly", "17.10.2026 (nightly abc1234)", "GET /releases/tags/nightly"},
		{"release", "17.10.2026", "GET /releases/latest"},
	}
	for _, c := range cases {
		t.Run(c.build, func(t *testing.T) {
			releases := newFakeReleaseServer(t)
			releases.publishRelease("17.10.2026", "")
			publishNightly(releases, "17.10.2026 (nightly abc1234)", "abc1234ffff0000")
			app, _ := newUpdateApp(t, c.build, c.version, releases)

			check := app.CheckForUpdate()

			if check.Channel != c.build || app.GetUpdateState().Channel != c.build {
				t.Fatalf("wanted the %s channel, got check %+v", c.build, check)
			}
			if got := releases.requested(); len(got) != 1 || got[0] != c.request {
				t.Fatalf("wanted %q, got %v", c.request, got)
			}
		})
	}
}
