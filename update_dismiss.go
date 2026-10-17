package main

import (
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
// nothing. On error the update stays available.
func (a *App) DismissUpdate() (UpdateState, error) {
	a.updates.mu.Lock()
	update := a.updates.update
	a.updates.mu.Unlock()
	if update == nil {
		return a.GetUpdateState(), nil
	}
	if err := a.Config.setDismissedUpdate(update.identity()); err != nil {
		return a.GetUpdateState(), fmt.Errorf("dismissing the update: %w", err)
	}
	a.setKnownUpdate(nil)
	return a.GetUpdateState(), nil
}

// identity tells builds apart for Dismiss: a release by its tag, a nightly by
// its commit, since every nightly is tagged "nightly".
func (u Update) identity() string {
	if u.Channel == channelNightly {
		if _, rest, ok := strings.Cut(u.Version, "(nightly "); ok {
			return strings.TrimSuffix(strings.TrimSpace(rest), ")")
		}
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
