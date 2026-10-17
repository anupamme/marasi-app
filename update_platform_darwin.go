package main

// defaultInstaller is nil until macOS installs updates (ticket 07), so the
// panel offers only the release page.
func defaultInstaller() platformInstaller {
	return nil
}
