package main

import (
	"context"
	"os/exec"
	"time"
)

// readOSProxySettings reads the macOS network proxy settings.
func readOSProxySettings() osProxySettings {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "/usr/sbin/scutil", "--proxy").Output()
	if err != nil {
		return osProxySettings{}
	}
	return parseScutilProxy(string(output))
}
