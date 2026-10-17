package main

import (
	"fmt"
	"log"

	"go.yaml.in/yaml/v3"
)

// Switching Channel (spec "Channels", ADR 0006). The Channel is an app-wide
// key in the marasi-app config, never a project setting. When it is absent
// the app follows the channel of the build that is running. Switching to
// nightly checks at once; switching to release never downgrades: the running
// nightly stays until a release dated after it is published.

// updateChannelKey is the config key holding the saved Channel.
const updateChannelKey = "update_channel"

// ChannelChange is the result of SetUpdateChannel.
type ChannelChange struct {
	// Settings are the update settings after the change.
	Settings UpdateSettings
	// Check is the check a switch to nightly runs; nil otherwise.
	Check *UpdateCheck
}

// parseUpdateChannel reads the saved Channel; anything but a known channel
// counts as none saved.
func parseUpdateChannel(node *yaml.Node) string {
	if node == nil {
		return ""
	}
	switch node.Value {
	case channelRelease, channelNightly:
		return node.Value
	default:
		log.Printf("[!] %s %q is not a channel, following the build channel", updateChannelKey, node.Value)
		return ""
	}
}

// updateChannel is the channel the app follows: the saved Channel, or the
// channel of the running build when none is saved. "" means the app never
// checks, as for a development build whatever is saved.
func (a *App) updateChannel() string {
	switch a.build.Channel {
	case channelRelease, channelNightly:
	default:
		return ""
	}
	if a.Config != nil {
		a.Config.mu.Lock()
		saved := a.Config.updateChannel
		a.Config.mu.Unlock()
		if saved != "" {
			return saved
		}
	}
	return a.build.Channel
}

// SetUpdateChannel saves the Channel the app follows. Switching to nightly
// checks for the nightly right away. An update found on the other channel
// is forgotten, unless it is being installed or waits for a restart.
func (a *App) SetUpdateChannel(channel string) (ChannelChange, error) {
	current := a.updateChannel()
	if current == "" {
		return ChannelChange{Settings: a.GetUpdateSettings()}, errUpdatesUnavailable
	}
	switch channel {
	case channelRelease, channelNightly:
	default:
		return ChannelChange{Settings: a.GetUpdateSettings()}, fmt.Errorf("%q is not a channel; choose release or nightly", channel)
	}
	if err := a.Config.setUpdateChannel(channel); err != nil {
		return ChannelChange{Settings: a.GetUpdateSettings()}, fmt.Errorf("saving the channel: %w", err)
	}

	change := ChannelChange{Settings: a.GetUpdateSettings()}
	if channel != current {
		a.setKnownUpdate(nil)
	}
	if channel == channelNightly {
		check := a.checkForUpdate(a.updateContext(), checkManual)
		change.Check = &check
	}
	return change, nil
}

// setUpdateChannel saves the Channel the app follows.
func (cfg *Config) setUpdateChannel(channel string) error {
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	if err := writeConfigKeys(cfg.path(), map[string]any{updateChannelKey: channel}); err != nil {
		return err
	}
	cfg.updateChannel = channel
	return nil
}
