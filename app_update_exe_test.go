package main

import (
	"bytes"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"aead.dev/minisign"
)

// newWindowsInstallApp returns an App running release 16.10.2026 as
// marasi-app.exe from a temp install directory, installing with the Windows
// installer, that has found a signed 17.10.2026 publishing marasi-app.exe.
func newWindowsInstallApp(t *testing.T) *App {
	t.Helper()
	releases := newFakeReleaseServer(t)
	keys := newSigningKeys(t)
	checksums := checksumsFor(map[string][]byte{"marasi-app.exe": updateBinary})
	releases.publishRelease("17.10.2026", "Notes.")
	releases.addAsset("17.10.2026", "marasi-app.exe", updateBinary)
	releases.addAsset("17.10.2026", "checksums.txt", checksums)
	releases.addAsset("17.10.2026", "checksums.txt.minisig", minisign.Sign(keys.private, checksums))

	app, _ := newUpdateApp(t, "release", "16.10.2026", releases)
	app.installLocation = filepath.Join(t.TempDir(), "marasi-app.exe")
	if err := os.WriteFile(app.installLocation, runningBinary, 0o755); err != nil {
		t.Fatalf("writing the running build: %v", err)
	}
	app.installer = exeInstaller{}
	app.signingKey = &keys.public
	if check := app.CheckForUpdate(); check.Outcome != UpdateOutcomeAvailable {
		t.Fatalf("wanted an update to install, got %q (%s)", check.Outcome, check.Reason)
	}
	return app
}

// installDirectory lists the names in the directory holding location.
func installDirectory(t *testing.T, location string) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Dir(location))
	if err != nil {
		t.Fatalf("listing the install directory: %v", err)
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	return names
}

func assertFileHolds(t *testing.T, path string, want []byte) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", filepath.Base(path), err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("wanted %s to hold %q, got %q", filepath.Base(path), want, got)
	}
}

func TestInstallingOnWindowsMovesTheRunningExeAsideAndTheNewOneIntoPlace(t *testing.T) {
	app := newWindowsInstallApp(t)

	result, err := app.InstallUpdate()

	if err != nil || result.Outcome != InstallOutcomeInstalled {
		t.Fatalf("wanted the update installed, got %+v (%v)", result, err)
	}
	assertFileHolds(t, app.installLocation, updateBinary)
	assertFileHolds(t, app.installLocation+".old", runningBinary)
	if got := installDirectory(t, app.installLocation); len(got) != 2 {
		t.Fatalf("wanted only marasi-app.exe and marasi-app.exe.old, got %v", got)
	}
}

func TestAFailedMoveIntoPlacePutsTheRunningExeBack(t *testing.T) {
	location := filepath.Join(t.TempDir(), "marasi-app.exe")
	if err := os.WriteFile(location, runningBinary, 0o755); err != nil {
		t.Fatalf("writing the running build: %v", err)
	}
	missing := filepath.Join(filepath.Dir(location), ".marasi-app-update-gone")

	err := exeInstaller{}.swap(missing, location)

	if err == nil {
		t.Fatalf("wanted moving a missing build into place to fail")
	}
	assertFileHolds(t, location, runningBinary)
	if got := installDirectory(t, location); len(got) != 1 {
		t.Fatalf("wanted only marasi-app.exe left, got %v", got)
	}
}

func TestInstallingAgainReplacesALeftoverThatWasNotYetRemoved(t *testing.T) {
	app := newWindowsInstallApp(t)
	if err := os.WriteFile(app.installLocation+".old", []byte("15.10.2026"), 0o755); err != nil {
		t.Fatalf("writing a leftover: %v", err)
	}

	result, err := app.InstallUpdate()

	if err != nil || result.Outcome != InstallOutcomeInstalled {
		t.Fatalf("wanted the update installed, got %+v (%v)", result, err)
	}
	assertFileHolds(t, app.installLocation, updateBinary)
	assertFileHolds(t, app.installLocation+".old", runningBinary)
}

func TestTheNextLaunchRemovesThePreviousVersionLeftover(t *testing.T) {
	app := newWindowsInstallApp(t)
	if result, err := app.InstallUpdate(); err != nil || result.Outcome != InstallOutcomeInstalled {
		t.Fatalf("wanted the update installed, got %+v (%v)", result, err)
	}
	next, _ := newUpdateApp(t, "release", "17.10.2026", newFakeReleaseServer(t))
	next.installer = exeInstaller{}
	next.installLocation = app.installLocation

	next.removeUpdateLeftovers()

	assertFileHolds(t, next.installLocation, updateBinary)
	if got := installDirectory(t, next.installLocation); len(got) != 1 {
		t.Fatalf("wanted only marasi-app.exe left, got %v", got)
	}
}

func TestALaunchWithNoLeftoverChangesNothing(t *testing.T) {
	app := newWindowsInstallApp(t)

	app.removeUpdateLeftovers()

	assertFileHolds(t, app.installLocation, runningBinary)
	if got := installDirectory(t, app.installLocation); len(got) != 1 {
		t.Fatalf("wanted only marasi-app.exe, got %v", got)
	}
}
