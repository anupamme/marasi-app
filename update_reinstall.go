package main

import (
	"fmt"
	"log"
)

// Reinstalling the latest release (spec "Channels", ADR 0006): the one way
// back to the latest release on purpose, whatever the version ordering says.
// It warns first, because Marasi only migrates project files forward, then
// runs the same download, verification, replacement and restart prompt as an
// update.

// reinstallAction titles the warning and names its confirming button.
const reinstallAction = "Reinstall latest release"

// ReinstallLatestRelease installs the latest release after warning that
// projects opened in a newer build may not open in it. Progress and the
// outcome are emitted as for InstallUpdate. Declining the warning returns
// InstallOutcomeCancelled with nothing downloaded. It returns an error when
// the latest release cannot be found or an install is already running or
// waiting for a restart.
func (a *App) ReinstallLatestRelease() (UpdateInstall, error) {
	if a.updateChannel() == "" {
		return UpdateInstall{}, errUpdatesUnavailable
	}
	if err := a.installBusy(); err != nil {
		return UpdateInstall{}, err
	}
	ctx, cancel := withUpdateCheckTimeout(a.updateContext())
	release, _, err := a.latestRelease(ctx)
	cancel()
	if err != nil {
		return UpdateInstall{}, err
	}
	update := releaseUpdate(release)

	message := fmt.Sprintf("Marasi will install release %s in place of %s. "+
		"Projects opened in a newer build of Marasi may not open in it, because Marasi only migrates project files forward. Continue?",
		update.Version, a.build.Version)
	if !a.confirm(reinstallAction, message) {
		return UpdateInstall{Outcome: InstallOutcomeCancelled, Update: update}, nil
	}

	update, installCtx, err := a.startInstall(update)
	if err != nil {
		return UpdateInstall{}, err
	}
	err = a.install(installCtx, update)
	result := a.finishInstall(installCtx, update, err)
	if result.Outcome == InstallOutcomeInstalled {
		// The release now installed follows the release channel, so a
		// nightly is not offered again after the restart (ADR 0006).
		if err := a.Config.setUpdateChannel(channelRelease); err != nil {
			log.Printf("[!] saving the release channel after reinstalling: %v", err)
		}
	}
	return result, nil
}
