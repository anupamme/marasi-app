package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// binaryInstaller installs a build that is a single executable file: the
// Linux binary. Its install location is the running executable, with
// symlinks resolved so a link in a PATH directory is left pointing at the
// new build. It is not tied to Linux by a build tag, so tests on any
// platform can install into a temp directory with it.
type binaryInstaller struct {
	// assetName is the release asset to install, "marasi-app" on Linux.
	assetName string
}

func (b binaryInstaller) asset() string { return b.assetName }

func (b binaryInstaller) locate(executable string) (string, error) {
	return filepath.EvalSymlinks(executable)
}

// checkReplaceable tries to create a file beside location, which is what
// staging and the rename into place need.
func (b binaryInstaller) checkReplaceable(location string) error {
	dir := filepath.Dir(location)
	probe, err := os.CreateTemp(dir, ".marasi-app-write-check-*")
	if err != nil {
		return failed(UpdateFailurePermissions, "Marasi cannot write to %s, where it is installed", dir)
	}
	probe.Close()
	_ = os.Remove(probe.Name())
	return nil
}

// stage copies the download beside location as an executable file and
// flushes it to disk, so the rename in swap is the only step that changes
// the install.
func (b binaryInstaller) stage(download, location string) (string, error) {
	src, err := os.Open(download)
	if err != nil {
		return "", err
	}
	defer src.Close()
	staged, err := os.CreateTemp(filepath.Dir(location), ".marasi-app-update-*")
	if err != nil {
		return "", err
	}
	ok := false
	defer func() {
		if !ok {
			staged.Close()
			_ = os.Remove(staged.Name())
		}
	}()
	if _, err := io.Copy(staged, src); err != nil {
		return "", err
	}
	if err := staged.Chmod(executableMode(location)); err != nil {
		return "", err
	}
	if err := staged.Sync(); err != nil {
		return "", err
	}
	if err := staged.Close(); err != nil {
		return "", err
	}
	ok = true
	return staged.Name(), nil
}

// swap renames staged over location, which replaces it in one step.
func (b binaryInstaller) swap(staged, location string) error {
	if err := os.Rename(staged, location); err != nil {
		return fmt.Errorf("moving the new build into place: %w", err)
	}
	return nil
}

func (b binaryInstaller) relaunch(location string) error {
	return startDetached(location)
}

// executableMode keeps the running build's permissions, executable by
// everyone who could read it.
func executableMode(location string) os.FileMode {
	mode := os.FileMode(0o755)
	if info, err := os.Stat(location); err == nil {
		mode = info.Mode().Perm()
	}
	return mode | (mode&0o444)>>2 | 0o100
}
