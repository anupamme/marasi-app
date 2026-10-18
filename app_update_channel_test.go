package main

import (
	"strings"
	"testing"
)

func TestSwitchingAReleaseBuildToNightlyChecksTheNightlyRightAway(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	publishNightly(releases, "18.10.2026 (nightly def5678)", "def5678aaaabbbbccccdddd")
	app, events := newUpdateApp(t, "release", "17.10.2026", releases)

	change, err := app.SetUpdateChannel("nightly")

	if err != nil {
		t.Fatalf("switching to nightly: %v", err)
	}
	if change.Settings.Channel != "nightly" || change.Check == nil {
		t.Fatalf("wanted the switch to nightly to check, got %+v", change)
	}
	check := change.Check
	if check.Outcome != UpdateOutcomeAvailable || check.Channel != "nightly" {
		t.Fatalf("wanted the nightly offered, got %q (%s)", check.Outcome, check.Reason)
	}
	if check.Update.Version != "18.10.2026 (nightly def5678)" {
		t.Fatalf("wanted the nightly's version, got %q", check.Update.Version)
	}
	want := "https://github.com/tfkr-ae/marasi-app/compare/17.10.2026...def5678aaaabbbbccccdddd"
	if check.Update.CompareURL != want {
		t.Fatalf("wanted the compare link %q, got %q", want, check.Update.CompareURL)
	}
	if !events.has(updateAvailableEvent) {
		t.Fatalf("wanted %s emitted, got %v", updateAvailableEvent, events.names)
	}
	if state := app.GetUpdateState(); state.Channel != "nightly" || state.Status != UpdateStatusAvailable {
		t.Fatalf("wanted the nightly channel with the update available, got %q %q", state.Channel, state.Status)
	}
}

func TestWithNoChannelSavedTheAppFollowsItsBuildChannel(t *testing.T) {
	releases := newFakeReleaseServer(t)
	app, _ := newUpdateApp(t, "nightly", "17.10.2026 (nightly abc1234)", releases)

	if got := app.GetUpdateState().Channel; got != "nightly" {
		t.Fatalf("wanted the build channel nightly, got %q", got)
	}
	if got := app.GetUpdateSettings().Channel; got != "nightly" {
		t.Fatalf("wanted the settings to show the build channel nightly, got %q", got)
	}
	if content := readAppConfig(t, app.Config.ConfigDir); strings.Contains(content, "update_channel") {
		t.Fatalf("wanted no channel written until one is chosen, got:\n%s", content)
	}
}

func TestTheChosenChannelIsSavedAppWideAndSurvivesARestart(t *testing.T) {
	releases := newFakeReleaseServer(t)
	publishNightly(releases, "17.10.2026 (nightly abc1234)", "abc1234ffff")
	app, _ := newUpdateApp(t, "release", "17.10.2026", releases)

	if _, err := app.SetUpdateChannel("nightly"); err != nil {
		t.Fatalf("switching to nightly: %v", err)
	}

	if content := readAppConfig(t, app.Config.ConfigDir); !strings.Contains(content, "update_channel: nightly") {
		t.Fatalf("wanted the channel in the app config, got:\n%s", content)
	}
	restarted := loadConfigApp(t, app.Config.ConfigDir)
	restarted.build = app.build
	if got := restarted.GetUpdateState().Channel; got != "nightly" {
		t.Fatalf("wanted nightly after a restart, got %q", got)
	}
	settings, err := restarted.SetAutomaticUpdateChecks(false)
	if err != nil {
		t.Fatalf("turning automatic checks off: %v", err)
	}
	if settings.Channel != "nightly" || settings.AutomaticChecks {
		t.Fatalf("wanted nightly with automatic checks off, got %+v", settings)
	}
}

func TestSwitchingChannelForgetsTheUpdateFoundOnTheOtherChannel(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("18.10.2026", "Notes.")
	app, _ := newUpdateApp(t, "release", "17.10.2026", releases)
	if check := app.CheckForUpdate(); check.Outcome != UpdateOutcomeAvailable {
		t.Fatalf("wanted the release offered first, got %q (%s)", check.Outcome, check.Reason)
	}

	change, err := app.SetUpdateChannel("nightly")

	if err != nil {
		t.Fatalf("switching to nightly: %v", err)
	}
	if change.Check.Outcome != UpdateOutcomeFailed {
		t.Fatalf("wanted the check to fail with no nightly published, got %q", change.Check.Outcome)
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusIdle || state.Update != nil {
		t.Fatalf("wanted the release update forgotten, got %q %+v", state.Status, state.Update)
	}
}

func TestSwitchingToAnUnknownChannelIsRefused(t *testing.T) {
	app, _ := newUpdateApp(t, "release", "17.10.2026", newFakeReleaseServer(t))

	if _, err := app.SetUpdateChannel("beta"); err == nil {
		t.Fatalf("wanted beta refused")
	}
	if got := app.GetUpdateState().Channel; got != "release" {
		t.Fatalf("wanted the channel unchanged, got %q", got)
	}
}

func TestADevelopmentBuildHasNoChannelToSwitch(t *testing.T) {
	releases := newFakeReleaseServer(t)
	app, _ := newUpdateApp(t, "dev", "dev", releases)

	if _, err := app.SetUpdateChannel("nightly"); err == nil {
		t.Fatalf("wanted a development build to refuse a channel")
	}
	if got := releases.requestCount(); got != 0 {
		t.Fatalf("wanted no request, got %v", releases.requested())
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusUnavailable {
		t.Fatalf("wanted updates unavailable, got %q", state.Status)
	}
}

func TestSwitchingANightlyToReleaseKeepsTheNightlyUntilALaterRelease(t *testing.T) {
	cases := []struct {
		name    string
		latest  string
		offered bool
	}{
		{"an older release", "16.10.2026", false},
		{"a release the same day", "17.10.2026", false},
		{"a same-day re-release", "17.10.2026-1", false},
		{"a release the next day", "18.10.2026", true},
		{"a release a later month on an earlier day", "01.11.2026", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			releases := newFakeReleaseServer(t)
			releases.publishRelease(c.latest, "Notes.")
			app, _ := newUpdateApp(t, "nightly", "17.10.2026 (nightly abc1234)", releases)

			change, err := app.SetUpdateChannel("release")
			if err != nil {
				t.Fatalf("switching to release: %v", err)
			}
			if change.Settings.Channel != "release" || change.Check != nil {
				t.Fatalf("wanted the switch to release saved without a check, got %+v", change)
			}
			if got := releases.requestCount(); got != 0 {
				t.Fatalf("wanted no request when switching to release, got %v", releases.requested())
			}

			check := app.CheckForUpdate()

			if check.Outcome == UpdateOutcomeFailed {
				t.Fatalf("check failed: %s", check.Reason)
			}
			if check.Channel != "release" {
				t.Fatalf("wanted the release channel checked, got %q", check.Channel)
			}
			if got := check.Outcome == UpdateOutcomeAvailable; got != c.offered {
				t.Fatalf("running nightly 17.10.2026 with release %s latest: wanted offered %v, got %q", c.latest, c.offered, check.Outcome)
			}
			if c.offered && check.Update.Version != c.latest {
				t.Fatalf("wanted release %s offered, got %q", c.latest, check.Update.Version)
			}
		})
	}
}
