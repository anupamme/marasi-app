package main

import "golang.org/x/sys/windows/registry"

// readOSProxySettings reads the current user's Windows Internet settings.
func readOSProxySettings() osProxySettings {
	key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err != nil {
		return osProxySettings{}
	}
	defer key.Close()
	if enabled, _, err := key.GetIntegerValue("ProxyEnable"); err != nil || enabled == 0 {
		return osProxySettings{}
	}
	server, _, err := key.GetStringValue("ProxyServer")
	if err != nil {
		return osProxySettings{}
	}
	override, _, _ := key.GetStringValue("ProxyOverride")
	return parseWindowsProxy(server, override)
}
