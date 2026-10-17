//go:build !darwin && !windows

package main

// readOSProxySettings has no OS proxy settings to read here; the proxy
// environment variables are the system proxy.
func readOSProxySettings() osProxySettings { return osProxySettings{} }
