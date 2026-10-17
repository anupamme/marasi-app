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
// Files:
//   - update.go: the state held by App, the bound methods and events
//   - update_source.go: reading releases from the GitHub releases API
//   - update_version.go: which build counts as newer
//   - update_client.go: the HTTP client update requests use

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
// can show the right thing. Later statuses (downloading, installed and
// pending restart) are added by the install pipeline.
type UpdateStatus string

const (
	// UpdateStatusUnavailable: this build never checks (a development build).
	UpdateStatusUnavailable UpdateStatus = "unavailable"
	// UpdateStatusIdle: no update is known.
	UpdateStatusIdle UpdateStatus = "idle"
	// UpdateStatusAvailable: an update was found and not yet installed.
	UpdateStatusAvailable UpdateStatus = "available"
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
	// Update is the known update, set when Status is available.
	Update *Update
}

// updater is the update state App holds. Its zero value is ready to use.
type updater struct {
	mu     sync.Mutex
	status UpdateStatus
	update *Update
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
	state := UpdateState{Channel: channel, Running: a.build, Status: UpdateStatusUnavailable}
	if channel == "" {
		return state
	}
	a.updates.mu.Lock()
	defer a.updates.mu.Unlock()
	state.Status = a.updates.status
	if state.Status == "" {
		state.Status = UpdateStatusIdle
	}
	state.Update = a.updates.update
	return state
}

func (a *App) checkForUpdate(ctx context.Context, kind checkKind) UpdateCheck {
	channel := a.updateChannel()
	check := UpdateCheck{Channel: channel, Running: a.build}
	if channel == "" {
		check.Outcome = UpdateOutcomeUnavailable
		return check
	}
	if kind == checkManual {
		a.clearDismissal()
	}
	ctx, cancel := context.WithTimeout(ctx, updateCheckTimeout)
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
		a.setKnownUpdate(update)
		a.emitEvent(updateAvailableEvent, *update)
	}
	return check
}

// findUpdate returns the update on channel, or nil when the running build is
// the newest.
func (a *App) findUpdate(ctx context.Context, channel string) (*Update, error) {
	switch channel {
	case channelRelease:
		return a.findReleaseUpdate(ctx)
	case channelNightly:
		return a.findNightlyUpdate(ctx)
	default:
		return nil, fmt.Errorf("checking the %s channel is not supported", channel)
	}
}

// findReleaseUpdate compares the latest release with the running release.
func (a *App) findReleaseUpdate(ctx context.Context) (*Update, error) {
	running, ok := parseReleaseVersion(a.build.Version)
	if !ok {
		return nil, fmt.Errorf("the running version %q is not a release version", a.build.Version)
	}
	release, err := a.releases().latestRelease(ctx)
	if errors.Is(err, errReleaseNotFound) {
		return nil, errors.New("no release is published on GitHub")
	}
	if err != nil {
		return nil, err
	}
	latest, ok := parseReleaseVersion(release.Tag)
	if !ok {
		return nil, fmt.Errorf("the latest release %q is not a release version", release.Tag)
	}
	if !latest.newerThan(running) {
		return nil, nil
	}
	return &Update{
		Channel:     channelRelease,
		Version:     release.Tag,
		Notes:       release.Notes,
		ReleasePage: release.Page,
		release:     release,
	}, nil
}

// setKnownUpdate records the update the latest check found, or none.
func (a *App) setKnownUpdate(update *Update) {
	a.updates.mu.Lock()
	defer a.updates.mu.Unlock()
	a.updates.update = update
	if update == nil {
		a.updates.status = UpdateStatusIdle
	} else {
		a.updates.status = UpdateStatusAvailable
	}
}

// Channels a build can follow. A development build has none.
const (
	channelRelease = "release"
	channelNightly = "nightly"
)

// updateChannel is the channel the app follows: for now the channel of the
// build that is running. "" means the app never checks.
func (a *App) updateChannel() string {
	switch a.build.Channel {
	case channelRelease, channelNightly:
		return a.build.Channel
	default:
		return ""
	}
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
