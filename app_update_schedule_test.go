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
}

func withFakeUpdateTicker(app *App) *fakeUpdateTicker {
	ticker := &fakeUpdateTicker{ticks: make(chan time.Time)}
	app.updateTicker = func(interval time.Duration) (<-chan time.Time, func()) {
		ticker.interval = interval
		return ticker.ticks, func() {}
	}
	return ticker
}

// tick makes the next automatic check due.
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

// waitForRequests waits until the release server has answered n requests.
func waitForRequests(t *testing.T, releases *fakeReleaseServer, n int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for releases.requestCount() < n {
		if time.Now().After(deadline) {
			t.Fatalf("wanted %d requests to GitHub, got %v", n, releases.requested())
		}
		time.Sleep(time.Millisecond)
	}
}

func TestAutomaticChecksRunAtStartupAndEverySixHours(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("16.10.2026", "")
	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	ticker := withFakeUpdateTicker(app)

	startAutomaticChecks(t, app)
	waitForRequests(t, releases, 1)
	ticker.tick(t)
	waitForRequests(t, releases, 2)

	if ticker.interval != 6*time.Hour {
		t.Fatalf("wanted checks every 6 hours, got every %v", ticker.interval)
	}
}

func TestAutomaticCheckShowsTheUpdateItFinds(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("17.10.2026", "")
	app, events := newUpdateApp(t, "release", "16.10.2026", releases)
	withFakeUpdateTicker(app)

	startAutomaticChecks(t, app)
	waitForRequests(t, releases, 1)
	app.stopUpdateChecks()

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
	withFakeUpdateTicker(app)
	logged := captureLog(t)

	startAutomaticChecks(t, app)
	waitForRequests(t, releases, 1)
	app.stopUpdateChecks()

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
	waitForRequests(t, releases, 1)

	if _, err := app.SetAutomaticUpdateChecks(false); err != nil {
		t.Fatal(err)
	}
	ticker.tick(t)
	ticker.tick(t)

	if n := releases.requestCount(); n != 1 {
		t.Fatalf("wanted only the startup check, got %v", releases.requested())
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

	runAutomaticCheck(t, app, releases)

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
	runAutomaticCheck(t, restarted, releases)

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
	runAutomaticCheck(t, app, releases)

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
	runAutomaticCheck(t, restarted, releases)
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
	runAutomaticCheck(t, app, releases)

	if state := app.GetUpdateState(); state.Status != UpdateStatusAvailable || state.Update == nil {
		t.Fatalf("wanted the update still shown, got %+v", state)
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
func runAutomaticCheck(t *testing.T, app *App, releases *fakeReleaseServer) {
	t.Helper()
	withFakeUpdateTicker(app)
	before := releases.requestCount()
	startAutomaticChecks(t, app)
	waitForRequests(t, releases, before+1)
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
