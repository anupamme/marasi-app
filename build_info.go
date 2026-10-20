package main

import (
	"log"

	"aead.dev/minisign"
)

// Set at build time with -ldflags "-X main.buildChannel=... -X 'main.version=...'",
// using the same version format as the marasi CLI: the tag for releases,
// "DD.MM.YYYY (nightly <commit>)" for nightlies.
//
// signingPublicKey is set the same way, with -X main.signingPublicKey=<key>,
// to the base64 public key line of the Marasi signing key's minisign.pub
// (docs/adr/2026-10-17-updates-are-signed-with-an-embedded-key.md). A development build carries no key.
var (
	buildChannel     = "dev"
	version          = "dev"
	signingPublicKey = ""
)

type BuildInfo struct {
	Channel string
	Version string
}

// GetBuildInfo reports the running build, the same one the updater checks
// from.
func (a *App) GetBuildInfo() BuildInfo {
	return a.build
}

// embeddedSigningPublicKey returns the Marasi signing key built into the app.
// ok is false for a build made without one, such as a development build.
func embeddedSigningPublicKey() (key minisign.PublicKey, ok bool, err error) {
	if signingPublicKey == "" {
		return key, false, nil
	}
	if err := key.UnmarshalText([]byte(signingPublicKey)); err != nil {
		return key, false, err
	}
	return key, true, nil
}

// loadSigningKey is the key App.signingKey starts with: the embedded key, or
// nil when the build has none or it is malformed, so the build cannot
// install updates.
func loadSigningKey() *minisign.PublicKey {
	key, ok, err := embeddedSigningPublicKey()
	if err != nil {
		log.Printf("the Marasi signing key built into this app is malformed, so it cannot install updates: %v", err)
	}
	if !ok {
		return nil
	}
	return &key
}
