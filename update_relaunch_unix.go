//go:build unix

package main

import (
	"os/exec"
	"syscall"
)

// startDetached starts the executable at path in its own session, so it
// outlives the app that started it and any terminal that app ran from.
func startDetached(path string) error {
	cmd := exec.Command(path)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
