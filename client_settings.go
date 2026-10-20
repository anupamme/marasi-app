package main

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/tfkr-ae/marasi/domain"
)

// appClient is the client name under which the app keeps its per-project
// settings in the project file (docs/adr/2026-10-16-app-defaults-with-project-overrides.md).
const appClient = "marasi-app"

func (a *App) configRepo() (domain.ConfigRepository, error) {
	repo, err := a.Proxy.GetConfigRepo()
	if err != nil {
		return nil, fmt.Errorf("no project is open: %w", err)
	}
	return repo, nil
}

// GetClientSetting returns the app's project setting key, or nil when the
// project has none.
func (a *App) GetClientSetting(key string) (*domain.ClientSetting, error) {
	repo, err := a.configRepo()
	if err != nil {
		return nil, err
	}
	setting, err := repo.GetClientSetting(appClient, key)
	if errors.Is(err, domain.ErrClientSettingNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading setting %s: %w", key, err)
	}
	return &setting, nil
}

// SetClientSetting stores value, any JSON, as the app's project setting key.
func (a *App) SetClientSetting(key string, value json.RawMessage) (domain.ClientSetting, error) {
	repo, err := a.configRepo()
	if err != nil {
		return domain.ClientSetting{}, err
	}
	setting, err := repo.SetClientSetting(appClient, key, value)
	if err != nil {
		return domain.ClientSetting{}, fmt.Errorf("storing setting %s: %w", key, err)
	}
	return setting, nil
}

// DeleteClientSetting removes the app's project setting key. A missing key
// is not an error.
func (a *App) DeleteClientSetting(key string) error {
	repo, err := a.configRepo()
	if err != nil {
		return err
	}
	if err := repo.DeleteClientSetting(appClient, key); err != nil {
		return fmt.Errorf("deleting setting %s: %w", key, err)
	}
	return nil
}

// ListClientSettings returns the app's project settings whose keys start
// with prefix, sorted by key. An empty prefix lists them all.
func (a *App) ListClientSettings(prefix string) ([]domain.ClientSetting, error) {
	repo, err := a.configRepo()
	if err != nil {
		return nil, err
	}
	settings, err := repo.ListClientSettings(appClient, prefix)
	if err != nil {
		return nil, fmt.Errorf("listing settings %s: %w", prefix, err)
	}
	return settings, nil
}
