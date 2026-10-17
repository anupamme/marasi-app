package main

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// readSystemProxy returns the system proxy lookup update requests use. The
// proxy environment variables win when any is set, as they do for other
// tools; otherwise the OS proxy settings apply (macOS network settings,
// Windows Internet settings). Proxy auto-config scripts are not read.
func readSystemProxy() func(*http.Request) (*url.URL, error) {
	for _, name := range []string{"HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"} {
		if os.Getenv(name) != "" {
			return http.ProxyFromEnvironment
		}
	}
	return readOSProxySettings().proxyFor
}

// osProxySettings are the manually configured proxies of the OS proxy
// settings, as host:port, and the hosts that bypass them.
type osProxySettings struct {
	http   string
	https  string
	bypass []string
}

// proxyFor picks the OS proxy for request. Like http.ProxyFromEnvironment
// it never proxies this machine.
func (s osProxySettings) proxyFor(request *http.Request) (*url.URL, error) {
	proxy := s.http
	if request.URL.Scheme == "https" {
		proxy = s.https
	}
	host := request.URL.Hostname()
	if proxy == "" || host == "localhost" || s.bypasses(host) {
		return nil, nil
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		return nil, nil
	}
	return &url.URL{Scheme: "http", Host: proxy}, nil
}

// bypasses reports whether host matches the bypass list: exact names,
// "*.example.com" or ".example.com" suffixes, and Windows' "<local>" for
// names without a dot.
func (s osProxySettings) bypasses(host string) bool {
	host = strings.ToLower(host)
	for _, entry := range s.bypass {
		entry = strings.ToLower(strings.TrimSpace(entry))
		switch {
		case entry == "":
		case entry == "<local>":
			if !strings.Contains(host, ".") {
				return true
			}
		case strings.HasPrefix(entry, "*."), strings.HasPrefix(entry, "."):
			suffix := entry[strings.Index(entry, "."):]
			if strings.HasSuffix(host, suffix) || host == suffix[1:] {
				return true
			}
		case host == entry:
			return true
		}
	}
	return false
}

// parseScutilProxy reads the output of macOS's `scutil --proxy`.
func parseScutilProxy(output string) osProxySettings {
	values := map[string]string{}
	var settings osProxySettings
	inExceptions := false
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		key, value, ok := strings.Cut(line, " : ")
		switch {
		case !ok:
			if line == "}" {
				inExceptions = false
			}
		case inExceptions:
			settings.bypass = append(settings.bypass, value)
		case key == "ExceptionsList":
			inExceptions = true
		default:
			values[key] = value
		}
	}
	address := func(prefix string) string {
		if values[prefix+"Enable"] != "1" || values[prefix+"Proxy"] == "" {
			return ""
		}
		port := values[prefix+"Port"]
		if port == "" {
			port = "80"
		}
		return net.JoinHostPort(values[prefix+"Proxy"], port)
	}
	settings.http = address("HTTP")
	settings.https = address("HTTPS")
	return settings
}

// parseWindowsProxy reads the Windows Internet settings ProxyServer and
// ProxyOverride values. ProxyServer is either one host:port for every
// scheme or a list such as "http=proxy:80;https=proxy:443".
func parseWindowsProxy(server, override string) osProxySettings {
	var settings osProxySettings
	for _, part := range strings.Split(server, ";") {
		part = strings.TrimSpace(part)
		scheme, address, ok := strings.Cut(part, "=")
		if !ok {
			if part != "" {
				settings.http, settings.https = part, part
			}
			continue
		}
		address = strings.TrimPrefix(strings.TrimPrefix(address, "http://"), "https://")
		switch strings.ToLower(scheme) {
		case "http":
			settings.http = address
		case "https":
			settings.https = address
		}
	}
	if override != "" {
		settings.bypass = strings.Split(override, ";")
	}
	return settings
}
