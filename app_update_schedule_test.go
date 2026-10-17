package main

import (
	"bytes"
	"context"
	"log"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeUpdateTicker replaces the 6-hour ticker, so a test decides when the
// next automatic check is due.
type fakeUpdateTicker struct {
	ticks    chan time.Time
	interval time.Duration
	// started closes when the automatic checks start ticking, which they do
	// once the startup check has finished.
	started chan struct{}
}

func withFakeUpdateTicker(app *App) *fakeUpdateTicker {
	ticker := &fakeUpdateTicker{ticks: make(chan time.Time), started: make(chan struct{})}
	app.updateTicker = func(interval time.Duration) (<-chan time.Time, func()) {
		ticker.interval = interval
		close(ticker.started)
		return ticker.ticks, func() {}
	}
	return ticker
}

// waitForStartupCheck waits until the startup check has finished.
func (f *fakeUpdateTicker) waitForStartupCheck(t *testing.T) {
	t.Helper()
	select {
	case <-f.started:
	case <-time.After(5 * time.Second):
		t.Fatal("wanted the startup check finished")
	}
}

// tick makes the next automatic check due. Ticking twice returns once the
// first tick's check has finished.
func (f *fakeUpdateTicker) tick(t *testing.T) {
	t.Helper()
	select {
	case f.ticks <- time.Now():
	case <-time.After(5 * time.Second):
		t.Fatal("wanted the automatic checks waiting for the next tick")
	}
}

// startAutomaticChecks starts the app's automatic checks as startup does and
// stops them when the test ends.
func startAutomaticChecks(t *testing.T, app *App) {
	t.Helper()
	app.startUpdateChecks(context.Background())
	t.Cleanup(app.stopUpdateChecks)
}

func TestAutomaticChecksRunAtStartupAndEverySixHours(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("16.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	ticker := withFakeUpdateTicker(app)

	startAutomaticChecks(t, app)
	ticker.waitForStartupCheck(t)
	if n := releases.requestCount(); n != 1 {
		t.Fatalf("wanted a check at startup, got %v", releases.requested())
	}
	ticker.tick(t)
	ticker.tick(t)

	if n := releases.requestCount(); n != 2 {
		t.Fatalf("wanted a check when the next 6 hours were up, got %v", releases.requested())
	}
	if ticker.interval != 6*time.Hour {
		t.Fatalf("wanted checks every 6 hours, got every %v", ticker.interval)
	}
}

func TestAutomaticCheckShowsTheUpdateItFinds(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)

	runAutomaticCheck(t, app)

	if !events.has(updateAvailableEvent) {
		t.Fatalf("wanted %s emitted, got %v", updateAvailableEvent, events.names)
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusAvailable {
		t.Fatalf("wanted the update available, got %+v", state)
	}
}

func TestFailedAutomaticCheckIsLoggedNeverShown(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.fail(http.StatusBadGateway)
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)
	logged := captureLog(t)

	runAutomaticCheck(t, app)

	if len(events.names) != 0 {
		t.Fatalf("wanted nothing shown, got events %v", events.names)
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusIdle {
		t.Fatalf("wanted the update state idle, got %+v", state)
	}
	if !strings.Contains(logged.String(), "GitHub answered 502") {
		t.Fatalf("wanted the failure logged, got %q", logged.String())
	}
}

func TestAutomaticChecksAreOnByDefault(t *testing.T) {
	app, _ := newUpdateApp(t, "release", "16.10.2026", newFakeReleaseServer(t))

	if settings := app.GetUpdateSettings(); !settings.AutomaticChecks {
		t.Fatalf("wanted automatic checks on, got %+v", settings)
	}
}

func TestTurningAutomaticChecksOffStopsAllAutomaticRequests(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)
	ticker := withFakeUpdateTicker(app)

	settings, err := app.SetAutomaticUpdateChecks(false)
	if err != nil || settings.AutomaticChecks {
		t.Fatalf("wanted automatic checks off, got %+v (%v)", settings, err)
	}
	startAutomaticChecks(t, app)
	ticker.tick(t)
	ticker.tick(t) // returns once the first tick was handled

	if n := releases.requestCount(); n != 0 {
		t.Fatalf("wanted no request to GitHub, got %v", releases.requested())
	}
	if len(events.names) != 0 {
		t.Fatalf("wanted no events, got %v", events.names)
	}
}

func TestTurningAutomaticChecksOffWhileRunningStopsTheNextCheck(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("16.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	ticker := withFakeUpdateTicker(app)
	startAutomaticChecks(t, app)
	ticker.waitForStartupCheck(t)

	if _, err := app.SetAutomaticUpdateChecks(false); err != nil {
		t.Fatal(err)
	}
	ticker.tick(t)
	ticker.tick(t)

	if n := releases.requestCount(); n != 1 {
		t.Fatalf("wanted only the startup check, got %v", releases.requested())
	}
}

func TestTurningAutomaticChecksBackOnChecksRightAway(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)
	if _, err := app.SetAutomaticUpdateChecks(false); err != nil {
		t.Fatal(err)
	}
	ticker := withFakeUpdateTicker(app)
	startAutomaticChecks(t, app)
	ticker.waitForStartupCheck(t)
	if n := releases.requestCount(); n != 0 {
		t.Fatalf("wanted no startup check with automatic checks off, got %v", releases.requested())
	}

	if settings, err := app.SetAutomaticUpdateChecks(true); err != nil || !settings.AutomaticChecks {
		t.Fatalf("wanted automatic checks on, got %+v (%v)", settings, err)
	}

	waitFor(t, "the check turning automatic checks on runs", func() bool { return events.has(updateAvailableEvent) })
	if n := releases.requestCount(); n != 1 {
		t.Fatalf("wanted one check, got %v", releases.requested())
	}
}

func TestTurningAutomaticChecksOnWhenAlreadyOnDoesNotCheck(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("16.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	ticker := withFakeUpdateTicker(app)
	startAutomaticChecks(t, app)
	ticker.waitForStartupCheck(t)

	if _, err := app.SetAutomaticUpdateChecks(true); err != nil {
		t.Fatal(err)
	}
	ticker.tick(t)
	ticker.tick(t) // returns once anything queued before it was handled

	if n := releases.requestCount(); n != 2 {
		t.Fatalf("wanted the startup check and one due check, got %v", releases.requested())
	}
}

func TestAutomaticChecksSettingIsKeptAcrossRestarts(t *testing.T) {
	app, _ := newUpdateApp(t, "release", "16.10.2026", newFakeReleaseServer(t))
	if _, err := app.SetAutomaticUpdateChecks(false); err != nil {
		t.Fatal(err)
	}

	restarted, _ := restartedUpdateApp(t, app)

	if settings := restarted.GetUpdateSettings(); settings.AutomaticChecks {
		t.Fatalf("wanted automatic checks still off after a restart, got %+v", settings)
	}
}

func TestCheckForUpdatesWorksWithAutomaticChecksOff(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	if _, err := app.SetAutomaticUpdateChecks(false); err != nil {
		t.Fatal(err)
	}

	if check := app.CheckForUpdate(); check.Outcome != UpdateOutcomeAvailable {
		t.Fatalf("wanted the manual check to find the update, got %q (%s)", check.Outcome, check.Reason)
	}
}

func TestDismissHidesTheUpdate(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	app.CheckForUpdate()

	state, err := app.DismissUpdate()

	if err != nil || state.Status != UpdateStatusIdle || state.Update != nil {
		t.Fatalf("wanted no update shown after Dismiss, got %+v (%v)", state, err)
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusIdle || state.Update != nil {
		t.Fatalf("wanted the update state idle, got %+v", state)
	}
}

func TestDismissedUpdateStaysHiddenFromAutomaticChecks(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)
	app.CheckForUpdate()
	if _, err := app.DismissUpdate(); err != nil {
		t.Fatal(err)
	}
	events.names, events.data = nil, nil

	runAutomaticCheck(t, app)

	if events.has(updateAvailableEvent) {
		t.Fatalf("wanted the dismissed update kept hidden, got %v", events.names)
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusIdle {
		t.Fatalf("wanted the update state idle, got %+v", state)
	}
}

func TestDismissedUpdateStaysHiddenAfterARestart(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	app.CheckForUpdate()
	if _, err := app.DismissUpdate(); err != nil {
		t.Fatal(err)
	}

	restarted, events := restartedUpdateApp(t, app)
	runAutomaticCheck(t, restarted)

	if events.has(updateAvailableEvent) {
		t.Fatalf("wanted the dismissed update kept hidden after a restart, got %v", events.names)
	}
	if state := restarted.GetUpdateState(); state.Status != UpdateStatusIdle {
		t.Fatalf("wanted the update state idle, got %+v", state)
	}
}

func TestNewerBuildThanTheDismissedOneShowsTheIndicatorAgain(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)
	app.CheckForUpdate()
	if _, err := app.DismissUpdate(); err != nil {
		t.Fatal(err)
	}
	events.names, events.data = nil, nil

	releases.publishRelease("18.10.2026", "")
	runAutomaticCheck(t, app)

	if !events.has(updateAvailableEvent) {
		t.Fatalf("wanted the newer update shown, got %v", events.names)
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusAvailable || state.Update.Version != "18.10.2026" {
		t.Fatalf("wanted release 18.10.2026 available, got %+v", state)
	}
}

func TestManualCheckShowsTheDismissedUpdateAgain(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)
	app.CheckForUpdate()
	if _, err := app.DismissUpdate(); err != nil {
		t.Fatal(err)
	}
	events.names, events.data = nil, nil

	check := app.CheckForUpdate()

	if check.Outcome != UpdateOutcomeAvailable || !events.has(updateAvailableEvent) {
		t.Fatalf("wanted the dismissed update shown again, got %q and events %v", check.Outcome, events.names)
	}
	// The manual check cleared the dismissal, so the next launch shows it too.
	restarted, restartedEvents := restartedUpdateApp(t, app)
	runAutomaticCheck(t, restarted)
	if !restartedEvents.has(updateAvailableEvent) {
		t.Fatalf("wanted the update shown after a restart, got %v", restartedEvents.names)
	}
}

func TestIndicatorStaysUntilTheUpdateIsInstalledOrDismissed(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	app.CheckForUpdate()

	releases.unpublish("17.10.2026")
	releases.publishRelease("16.10.2026", "")
	runAutomaticCheck(t, app)

	if state := app.GetUpdateState(); state.Status != UpdateStatusAvailable || state.Update == nil {
		t.Fatalf("wanted the update still shown, got %+v", state)
	}
}

func TestAutomaticCheckWithNoNightlyPublishedIsNoUpdate(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	publishNightly(releases, "18.10.2026 (nightly def5678)", "def5678ffff0000")
	app, events := newUpdateApp(t, "nightly", "17.10.2026 (nightly abc1234)", releases)
	app.CheckForUpdate()
	events.names, events.data = nil, nil
	logged := captureLog(t)

	releases.unpublish("nightly")
	runAutomaticCheck(t, app)

	if len(events.names) != 0 {
		t.Fatalf("wanted nothing shown, got events %v", events.names)
	}
	if logged.String() != "" {
		t.Fatalf("wanted a missing nightly treated as no update, got logged %q", logged.String())
	}
	if state := app.GetUpdateState(); state.Status != UpdateStatusAvailable || state.Update.Commit != "def5678ffff0000" {
		t.Fatalf("wanted the known nightly still shown, got %+v", state)
	}
}

func TestDismissedNightlyIsTheCommitNotTheTag(t *testing.T) {
	releases := newFakeReleaseServer(t)
	publishNightly(releases, "18.10.2026 (nightly def5678)", "def5678ffff0000")
	app, events := newUpdateApp(t, "nightly", "17.10.2026 (nightly abc1234)", releases)
	app.CheckForUpdate()
	if _, err := app.DismissUpdate(); err != nil {
		t.Fatal(err)
	}

	// The same commit published again stays dismissed.
	releases.unpublish("nightly")
	publishNightly(releases, "19.10.2026 (nightly def5678)", "def5678ffff0000")
	events.names, events.data = nil, nil
	runAutomaticCheck(t, app)
	if events.has(updateAvailableEvent) {
		t.Fatalf("wanted the dismissed commit kept hidden, got %v", events.names)
	}

	// A nightly from a new commit shows again.
	releases.unpublish("nightly")
	publishNightly(releases, "19.10.2026 (nightly 0123abc)", "0123abcffff0000")
	runAutomaticCheck(t, app)
	if !events.has(updateAvailableEvent) {
		t.Fatalf("wanted the nightly from a new commit shown, got %v", events.names)
	}
}

func TestAnInstalledUpdateCannotBeDismissed(t *testing.T) {
	app, _ := newInstalledApp(t)

	state, err := app.DismissUpdate()

	if err == nil || state.Status != UpdateStatusRestartPending {
		t.Fatalf("wanted Dismiss refused with a restart pending, got %+v (%v)", state, err)
	}
	restarted, _ := restartedUpdateApp(t, app)
	if restarted.Config.dismissedUpdate != "" {
		t.Fatalf("wanted nothing dismissed in config, got %q", restarted.Config.dismissedUpdate)
	}
}

func TestDismissWithNoUpdateDoesNothing(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)

	if state, err := app.DismissUpdate(); err != nil || state.Status != UpdateStatusIdle {
		t.Fatalf("wanted nothing to dismiss, got %+v (%v)", state, err)
	}
	if check := app.CheckForUpdate(); check.Outcome != UpdateOutcomeAvailable {
		t.Fatalf("wanted the update found, got %q", check.Outcome)
	}
}

// runAutomaticCheck runs the startup check of app's automatic checks and
// waits for it to finish.
func runAutomaticCheck(t *testing.T, app *App) {
	t.Helper()
	ticker := withFakeUpdateTicker(app)
	startAutomaticChecks(t, app)
	ticker.waitForStartupCheck(t)
	app.stopUpdateChecks()
}

// restartedUpdateApp is app as the next launch sees it: the same build and
// release source, with the config loaded again from disk.
func restartedUpdateApp(t *testing.T, app *App) (*App, *recordedEvents) {
	t.Helper()
	cfg, err := LoadConfig(app.Config.ConfigDir)
	if err != nil {
		t.Fatal(err)
	}
	events := &recordedEvents{}
	return &App{Config: cfg, emitEvent: events.emit, build: app.build, releaseSource: app.releaseSource}, events
}

// captureLog collects what the standard logger writes during the test.
func captureLog(t *testing.T) *syncBuffer {
	t.Helper()
	buf := &syncBuffer{}
	previous := log.Writer()
	log.SetOutput(buf)
	t.Cleanup(func() { log.SetOutput(previous) })
	return buf
}

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}
