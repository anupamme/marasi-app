package main

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Updates (GLOSSARY "Updates"): the app checks its Channel for a build newer
// than the running one. The frontend reaches this module only through the
// bound App methods below and the events they emit.
//
// The update_*.go files group as:
//   - checking: update.go (state, checks, events), update_source.go,
//     update_nightly.go, update_version.go, and update_client.go with
//     update_system_proxy*.go for the HTTP client;
//   - settings: update_settings.go, update_channel.go, update_dismiss.go,
//     update_schedule.go (automatic checks);
//   - installing: update_install.go (the shared pipeline), update_verify.go,
//     update_reinstall.go, and the per-platform update_install_*.go,
//     update_platform_*.go and update_relaunch_*.go.

// defaultReleaseSource is the GitHub releases API of the Marasi App
// repository. App.releaseSource holds it so tests can serve releases from a
// fake server.
const defaultReleaseSource = "https://api.github.com/repos/tfkr-ae/marasi-app"

// updateCheckTimeout bounds one check, so an unreachable host fails the
// check instead of hanging it.
const updateCheckTimeout = 30 * time.Second

// Events sent to the frontend.
const (
	// updateAvailableEvent carries the Update a check found.
	updateAvailableEvent = "update-available"
)

// errUpdatesUnavailable refuses what a development build never does: check,
// install, or save an update setting.
var errUpdatesUnavailable = errors.New("development builds don't check for or install updates")

// UpdateOutcome is how a check for an update ended.
type UpdateOutcome string

const (
	// UpdateOutcomeNone: the running build is the newest on its channel.
	UpdateOutcomeNone UpdateOutcome = "none"
	// UpdateOutcomeAvailable: a newer build exists; UpdateCheck.Update has it.
	UpdateOutcomeAvailable UpdateOutcome = "available"
	// UpdateOutcomeFailed: the check could not finish; UpdateCheck.Reason says why.
	UpdateOutcomeFailed UpdateOutcome = "failed"
	// UpdateOutcomeUnavailable: this build never checks (a development build).
	UpdateOutcomeUnavailable UpdateOutcome = "unavailable"
)

// UpdateStatus is where the app stands with updates, so a reloaded frontend
// can show the right thing.
type UpdateStatus string

const (
	// UpdateStatusUnavailable: this build never checks (a development build).
	UpdateStatusUnavailable UpdateStatus = "unavailable"
	// UpdateStatusIdle: no update is known.
	UpdateStatusIdle UpdateStatus = "idle"
	// UpdateStatusAvailable: an update was found and not yet installed.
	UpdateStatusAvailable UpdateStatus = "available"
	// UpdateStatusDownloading: the update is being downloaded and installed;
	// UpdateState.Progress says how far.
	UpdateStatusDownloading UpdateStatus = "downloading"
	// UpdateStatusRestartPending: the update is installed on disk and runs
	// after a restart.
	UpdateStatusRestartPending UpdateStatus = "restart-pending"
	// UpdateStatusFailed: installing the update failed and left the install
	// as it was; UpdateState.Failure says why. Install can be retried.
	UpdateStatusFailed UpdateStatus = "failed"
)

// Update is a build on the app's channel newer than the running one.
type Update struct {
	// Channel the update was found on: "release" or "nightly".
	Channel string
	// Version is the build's version string, a release tag for a release.
	Version string
	// Notes are the release notes as published, in Markdown.
	Notes string
	// ReleasePage is the build's page on GitHub, where it can be installed by
	// hand.
	ReleasePage string
	// Commit is the full commit a nightly was built from; "" for a release.
	Commit string
	// CompareURL is the GitHub comparison of the running nightly's commit
	// with Commit ("changes since your build"); "" for a release.
	CompareURL string

	// release is the GitHub release the update came from, kept for the
	// install pipeline (its assets). Never sent to the frontend.
	release githubRelease
}

// UpdateCheck is the result of one check for an update.
type UpdateCheck struct {
	Outcome UpdateOutcome
	// Channel that was checked; empty for a development build.
	Channel string
	// Running is the build the app is running.
	Running BuildInfo
	// Update is set when Outcome is available.
	Update *Update
	// Reason is set when Outcome is failed, in words a researcher can act on.
	Reason string
}

// UpdateState is the current update state, for a frontend that reloads.
type UpdateState struct {
	Status  UpdateStatus
	Channel string
	Running BuildInfo
	// Update is the known update, set from Status available on.
	Update *Update
	// CanInstall is whether the panel can offer Install. When it cannot,
	// CannotInstallReason says why and the panel offers only the release
	// page.
	CanInstall          bool
	CannotInstallReason string
	// Progress is set while Status is downloading.
	Progress *UpdateProgress
	// Failure is set when Status is failed.
	Failure *UpdateFailure
}

// updater is the update state App holds. Its zero value is ready to use.
type updater struct {
	mu     sync.Mutex
	status UpdateStatus
	update *Update
	// cancelDownload aborts the running install; nil when none runs.
	cancelDownload func()
	progress       *UpdateProgress
	failure        *UpdateFailure
}

// CheckForUpdate checks the app's channel for an update, as the "Check for
// updates…" menu action does. It emits updateAvailableEvent when it finds
// one. A development build never checks.
func (a *App) CheckForUpdate() UpdateCheck {
	return a.checkForUpdate(a.updateContext(), checkManual)
}

// checkKind is who asked for a check.
type checkKind int

const (
	// checkManual: the researcher asked. It clears any dismissal and its
	// outcome is shown.
	checkManual checkKind = iota
	// checkAutomatic: the startup or 6-hourly check (update_schedule.go). It
	// skips a dismissed build and never hides a known update.
	checkAutomatic
)

// GetUpdateState reports the current update state.
func (a *App) GetUpdateState() UpdateState {
	channel := a.updateChannel()
	state := UpdateState{Channel: string(channel), Running: a.build, Status: UpdateStatusUnavailable}
	if channel == "" {
		return state
	}
	state.CanInstall, state.CannotInstallReason = a.installability()
	a.updates.fill(&state)
	return state
}

// fill copies the update state into state.
func (u *updater) fill(state *UpdateState) {
	u.mu.Lock()
	defer u.mu.Unlock()
	state.Status = u.status
	if state.Status == "" {
		state.Status = UpdateStatusIdle
	}
	state.Update = u.update
	state.Progress = u.progress
	state.Failure = u.failure
}

func (a *App) checkForUpdate(ctx context.Context, kind checkKind) UpdateCheck {
	channel := a.updateChannel()
	check := UpdateCheck{Channel: string(channel), Running: a.build}
	if channel == "" {
		check.Outcome = UpdateOutcomeUnavailable
		return check
	}
	if kind == checkManual {
		a.clearDismissal()
	}
	ctx, cancel := withUpdateCheckTimeout(ctx)
	defer cancel()

	update, err := a.findUpdate(ctx, channel)
	switch {
	case kind == checkAutomatic && errors.Is(err, errNoNightlyPublished):
		// Most likely mid-publish: nothing to report until the next check.
		check.Outcome = UpdateOutcomeNone
	case err != nil:
		check.Outcome = UpdateOutcomeFailed
		check.Reason = err.Error()
	case update == nil:
		check.Outcome = UpdateOutcomeNone
		if kind == checkManual {
			a.setKnownUpdate(nil)
		}
	default:
		check.Outcome = UpdateOutcomeAvailable
		check.Update = update
		if kind == checkAutomatic && a.isDismissed(update) {
			return check
		}
		if a.setKnownUpdate(update) {
			a.emitEvent(updateAvailableEvent, *update)
		}
	}
	return check
}

// withUpdateCheckTimeout bounds a request for release metadata.
func withUpdateCheckTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, updateCheckTimeout)
}

// findUpdate returns the update on channel, or nil when the running build is
// the newest.
func (a *App) findUpdate(ctx context.Context, channel Channel) (*Update, error) {
	switch channel {
	case channelRelease:
		return a.findReleaseUpdate(ctx)
	case channelNightly:
		return a.findNightlyUpdate(ctx)
	default:
		return nil, fmt.Errorf("checking the %s channel is not supported", channel)
	}
}

// findReleaseUpdate compares the latest release with the running build: a
// running release by its tag, a running nightly (switched to release) by
// its date alone, so the switch never downgrades (docs/adr/2026-10-17-switching-channel-never-downgrades.md).
func (a *App) findReleaseUpdate(ctx context.Context) (*Update, error) {
	var isUpdate func(releaseVersion) bool
	if running, ok := parseReleaseVersion(a.build.Version); ok {
		isUpdate = func(latest releaseVersion) bool { return latest.newerThan(running) }
	} else if running, ok := parseNightlyVersion(a.build.Version); ok {
		isUpdate = func(latest releaseVersion) bool { return latest.isUpdateForNightly(running) }
	} else {
		return nil, fmt.Errorf("the running version %q is neither a release nor a nightly version", a.build.Version)
	}
	release, latest, err := a.latestRelease(ctx)
	if err != nil {
		return nil, err
	}
	if !isUpdate(latest) {
		return nil, nil
	}
	return releaseUpdate(release), nil
}

// latestRelease fetches the latest release and parses its tag.
func (a *App) latestRelease(ctx context.Context) (githubRelease, releaseVersion, error) {
	release, err := a.releases().latestRelease(ctx)
	if errors.Is(err, errReleaseNotFound) {
		return githubRelease{}, releaseVersion{}, errors.New("no release is published on GitHub")
	}
	if err != nil {
		return githubRelease{}, releaseVersion{}, err
	}
	latest, ok := parseReleaseVersion(release.Tag)
	if !ok {
		return githubRelease{}, releaseVersion{}, fmt.Errorf("the latest release %q is not a release version", release.Tag)
	}
	return release, latest, nil
}

// releaseUpdate is release offered as an Update.
func releaseUpdate(release githubRelease) *Update {
	return &Update{
		Channel:     string(channelRelease),
		Version:     release.Tag,
		Notes:       release.Notes,
		ReleasePage: release.Page,
		release:     release,
	}
}

// setKnownUpdate records the update the latest check found, or none. While
// an install runs or waits for a restart, the update being installed stays
// and setKnownUpdate reports false.
func (a *App) setKnownUpdate(update *Update) bool {
	return a.updates.setKnown(update)
}

// setKnown is setKnownUpdate on the updater.
func (u *updater) setKnown(update *Update) bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.busy() != nil {
		return false
	}
	u.failure = nil
	u.update = update
	if update == nil {
		u.status = UpdateStatusIdle
	} else {
		u.status = UpdateStatusAvailable
	}
	return true
}

// releases is the release source update requests read from.
func (a *App) releases() releaseSource {
	base := a.releaseSource
	if base == "" {
		base = defaultReleaseSource
	}
	return releaseSource{base: base, client: a.updateHTTPClient()}
}

// updateContext is the context checks run under: the app's, once startup has
// given it one.
func (a *App) updateContext() context.Context {
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}
