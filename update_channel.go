package main

import (
	"errors"
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
	// Channel the app now follows.
	Channel string
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
		return ChannelChange{}, errors.New("this build does not follow a channel")
	}
	switch channel {
	case channelRelease, channelNightly:
	default:
		return ChannelChange{Channel: current}, fmt.Errorf("%q is not a channel; choose release or nightly", channel)
	}
	cfg := a.Config
	cfg.mu.Lock()
	err := writeConfigKeys(cfg.path(), map[string]any{updateChannelKey: channel})
	if err == nil {
		cfg.updateChannel = channel
	}
	cfg.mu.Unlock()
	if err != nil {
		return ChannelChange{Channel: current}, fmt.Errorf("saving the channel: %w", err)
	}

	change := ChannelChange{Channel: channel}
	if channel != current {
		a.setKnownUpdate(nil)
	}
	if channel == channelNightly {
		check := a.checkForUpdate(a.updateContext(), checkManual)
		change.Check = &check
	}
	return change, nil
}
