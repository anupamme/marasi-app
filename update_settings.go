package main

import (
	"fmt"
	"log"
	"strconv"

	"go.yaml.in/yaml/v3"
)

// Update settings are app-wide keys in marasi_appconfig.yaml, never project
// settings. They have no entry in configDefaults: an absent key means the
// default, so the file only holds what the researcher chose.

// updateChecksKey turns automatic checks on or off. Absent means on.
const updateChecksKey = "update_checks"

// UpdateSettings are the researcher's update settings.
type UpdateSettings struct {
	// AutomaticChecks: check at startup and every 6 hours. Off, the app makes
	// no update request the researcher did not ask for.
	AutomaticChecks bool
}

// GetUpdateSettings reports the update settings.
func (a *App) GetUpdateSettings() UpdateSettings {
	cfg := a.Config
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	return cfg.updateSettings
}

// SetAutomaticUpdateChecks turns automatic checks on or off and saves the
// choice. Off takes effect from the next due check; "Check for updates…"
// works either way. On error the setting is unchanged.
func (a *App) SetAutomaticUpdateChecks(on bool) (UpdateSettings, error) {
	cfg := a.Config
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	if err := writeConfigKeys(cfg.path(), map[string]any{updateChecksKey: on}); err != nil {
		return cfg.updateSettings, fmt.Errorf("saving automatic checks: %w", err)
	}
	cfg.updateSettings.AutomaticChecks = on
	return cfg.updateSettings, nil
}

// automaticChecksOn reports whether automatic checks are on.
func (a *App) automaticChecksOn() bool {
	return a.GetUpdateSettings().AutomaticChecks
}

// parseUpdateSettings reads the update settings from the config document.
// An absent or unusable key is its default.
func parseUpdateSettings(doc *yaml.Node) UpdateSettings {
	settings := UpdateSettings{AutomaticChecks: true}
	if node := documentValue(doc, updateChecksKey); node != nil {
		on, err := strconv.ParseBool(node.Value)
		if node.Kind != yaml.ScalarNode || err != nil {
			log.Printf("[!] %s is not true or false, keeping automatic checks on", updateChecksKey)
		} else {
			settings.AutomaticChecks = on
		}
	}
	return settings
}
