package main

import (
	"testing"

	"aead.dev/minisign"
)

// A key pair made once with `minisign -G`, used only by these tests.
const testSigningPublicKey = "RWR2MnQ7OgeiRIR+LXFXyxjovzMjwhQ4prFrQdxLVGm00oJVrca0VGaC"

func TestDevelopmentBuildCarriesNoSigningKey(t *testing.T) {
	setSigningPublicKey(t, "")

	_, ok, err := embeddedSigningPublicKey()
	if err != nil {
		t.Fatalf("embeddedSigningPublicKey() error = %v", err)
	}
	if ok {
		t.Fatal("a development build reported a signing key")
	}
}

func TestBuildWithSigningKeyParsesIt(t *testing.T) {
	setSigningPublicKey(t, testSigningPublicKey)

	key, ok, err := embeddedSigningPublicKey()
	if err != nil {
		t.Fatalf("embeddedSigningPublicKey() error = %v", err)
	}
	if !ok {
		t.Fatal("a build with a signing key reported none")
	}
	var want minisign.PublicKey
	if err := want.UnmarshalText([]byte(testSigningPublicKey)); err != nil {
		t.Fatal(err)
	}
	if !key.Equal(want) {
		t.Fatalf("key = %v, want %v", key, want)
	}
}

func TestBuildWithMalformedSigningKeyFails(t *testing.T) {
	setSigningPublicKey(t, "not-a-minisign-key")

	if _, _, err := embeddedSigningPublicKey(); err == nil {
		t.Fatal("a malformed signing key parsed without error")
	}
}

func setSigningPublicKey(t *testing.T, key string) {
	t.Helper()
	old := signingPublicKey
	signingPublicKey = key
	t.Cleanup(func() { signingPublicKey = old })
}
