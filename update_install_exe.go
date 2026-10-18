package main

import (
	"errors"
	"fmt"
	"os"
)

// exeInstaller installs the Windows build, marasi-app.exe. Windows will not
// replace or delete an executable that is running, but it will rename one,
// so swap moves the running .exe aside to <name>.old and the new one into
// its place, and the next launch removes the .old copy. It is not tied to
// Windows by a build tag, so tests on any platform can install into a temp
// directory with it.
type exeInstaller struct {
	// binaryInstaller locates, checks and stages the .exe as it does the
	// Linux binary: the build is one file beside which Marasi can write.
	binaryInstaller
}

// exeAsset is the release asset Windows installs.
const exeAsset = "marasi-app.exe"

func (e exeInstaller) asset() string { return exeAsset }

// asideName is where swap moves the running build at location.
func asideName(location string) string { return location + ".old" }

// swap moves the running build at location aside, then staged into place.
// When the second move fails it moves the running build back, so the
// install is unchanged.
func (e exeInstaller) swap(staged, location string) error {
	aside := asideName(location)
	// A leftover the last launch could not remove would block the move
	// aside; it is an older build than the running one, so it can go.
	if err := os.Remove(aside); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("removing the leftover previous version: %w", err)
	}
	if err := os.Rename(location, aside); err != nil {
		return fmt.Errorf("moving the running build aside: %w", err)
	}
	if err := os.Rename(staged, location); err != nil {
		if restoreErr := os.Rename(aside, location); restoreErr != nil {
			return fmt.Errorf("moving the new build into place: %w (and putting the running build back: %v)", err, restoreErr)
		}
		return fmt.Errorf("moving the new build into place: %w", err)
	}
	return nil
}

// removeLeftovers deletes the previous version that an install moved aside
// beside location. Nothing to remove is not an error.
func (e exeInstaller) removeLeftovers(location string) error {
	if err := os.Remove(asideName(location)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
