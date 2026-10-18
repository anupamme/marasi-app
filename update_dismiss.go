package main

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"go.yaml.in/yaml/v3"
)

// Dismiss: a researcher can hide an available update until a newer build is
// published. The dismissal is the dismissed build's identity, kept in the app
// config so a restart does not bring the update back. Automatic checks skip
// the dismissed build; a manual check clears the dismissal and shows it.

// dismissedUpdateKey holds the dismissed build's identity. It has no default:
// absent means nothing is dismissed.
const dismissedUpdateKey = "dismissed_update"

// DismissUpdate hides the available update until a newer build is published,
// and returns the update state without it. With no update available it does
// nothing. An update downloading or installed cannot be dismissed. On error
// the update stays as it was. A development build dismisses nothing.
func (a *App) DismissUpdate() (UpdateState, error) {
	if a.updateChannel() == "" {
		return a.GetUpdateState(), errUpdatesUnavailable
	}
	update, err := a.updates.dismissable()
	if err != nil || update == nil {
		return a.GetUpdateState(), err
	}
	if err := a.Config.setDismissedUpdate(update.identity()); err != nil {
		return a.GetUpdateState(), fmt.Errorf("dismissing the update: %w", err)
	}
	a.setKnownUpdate(nil)
	return a.GetUpdateState(), nil
}

// dismissable returns the update Dismiss would hide: nil when none is
// known, an error when it is downloading or installed.
func (u *updater) dismissable() (*Update, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	switch u.status {
	case UpdateStatusDownloading:
		return nil, errors.New("the update is downloading; cancel the download first")
	case UpdateStatusRestartPending:
		return nil, errors.New("the update is installed and runs at the next launch")
	}
	return u.update, nil
}

// identity tells builds apart for Dismiss: a release by its tag, a nightly by
// its commit, since every nightly is tagged "nightly".
func (u Update) identity() string {
	if Channel(u.Channel) == channelNightly && u.Commit != "" {
		return u.Commit
	}
	return u.Version
}

// isDismissed reports whether update is the dismissed build.
func (a *App) isDismissed(update *Update) bool {
	cfg := a.Config
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	return cfg.dismissedUpdate != "" && cfg.dismissedUpdate == update.identity()
}

// clearDismissal forgets the dismissed build, as a manual check does. A
// failure to save is logged; the check goes on.
func (a *App) clearDismissal() {
	if err := a.Config.setDismissedUpdate(""); err != nil {
		log.Printf("[!] clearing the dismissed update: %v", err)
	}
}

// setDismissedUpdate saves the dismissed build's identity, "" for none.
func (cfg *Config) setDismissedUpdate(identity string) error {
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	if cfg.dismissedUpdate == identity {
		return nil
	}
	if err := writeConfigKeys(cfg.path(), map[string]any{dismissedUpdateKey: identity}); err != nil {
		return err
	}
	cfg.dismissedUpdate = identity
	return nil
}

// parseDismissedUpdate reads the dismissed build's identity; anything but a
// string means nothing is dismissed.
func parseDismissedUpdate(node *yaml.Node) string {
	if node == nil || node.Kind != yaml.ScalarNode {
		return ""
	}
	return strings.TrimSpace(node.Value)
}
