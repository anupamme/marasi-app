package main

// defaultInstaller is nil until Windows installs updates (ticket 08), so the
// panel offers only the release page.
func defaultInstaller() platformInstaller {
	return nil
}
