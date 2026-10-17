//go:build !unix && !windows

package main

import "os/exec"

// startDetached starts the executable at path without waiting for it.
func startDetached(path string) error {
	cmd := exec.Command(path)
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
