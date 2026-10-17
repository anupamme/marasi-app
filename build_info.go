package main

import "aead.dev/minisign"

// Set at build time with -ldflags "-X main.buildChannel=... -X 'main.version=...'",
// using the same version format as the marasi CLI: the tag for releases,
// "DD.MM.YYYY (nightly <commit>)" for nightlies.
//
// signingPublicKey is set the same way, with -X main.signingPublicKey=<key>,
// to the base64 public key line of the Marasi signing key's minisign.pub
// (ADR 0005). A development build carries no key.
var (
	buildChannel     = "dev"
	version          = "dev"
	signingPublicKey = ""
)

type BuildInfo struct {
	Channel string
	Version string
}

func (a *App) GetBuildInfo() BuildInfo {
	return BuildInfo{Channel: buildChannel, Version: version}
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
