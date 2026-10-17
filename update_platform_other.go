//go:build !linux && !darwin && !windows

package main

// defaultInstaller is nil: Marasi App ships no build for this platform to
// update to, so the panel offers only the release page.
func defaultInstaller() platformInstaller {
	return nil
}
