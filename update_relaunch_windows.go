package main

import (
	"os/exec"
	"syscall"
)

// Process creation flags from the Windows API.
const (
	createNewProcessGroup = 0x00000200
	detachedProcess       = 0x00000008
)

// startDetached starts the executable at path without waiting for it, in its
// own process group and without the console Marasi may have been started
// from, so the new build outlives the app that started it and a Ctrl+C in
// that console does not reach it.
func startDetached(path string) error {
	cmd := exec.Command(path)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNewProcessGroup | detachedProcess}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
