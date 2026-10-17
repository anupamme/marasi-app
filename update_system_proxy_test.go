package main

import (
	"net/http"
	"testing"
)

const scutilWithProxies = `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : intranet.acme.test
  }
  FTPPassive : 1
  HTTPEnable : 1
  HTTPPort : 3128
  HTTPProxy : proxy.acme.test
  HTTPSEnable : 1
  HTTPSPort : 3129
  HTTPSProxy : secure.acme.test
  ProxyAutoConfigEnable : 0
  SOCKSEnable : 0
}`

const scutilWithoutProxies = `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : 169.254/16
  }
  HTTPEnable : 0
  HTTPSEnable : 0
}`

func TestOSProxySettingsPickTheProxyForEachRequest(t *testing.T) {
	cases := []struct {
		name     string
		settings osProxySettings
		target   string
		want     string
	}{
		{"macOS HTTPS proxy", parseScutilProxy(scutilWithProxies), "https://api.github.com/releases", "secure.acme.test:3129"},
		{"macOS HTTP proxy", parseScutilProxy(scutilWithProxies), "http://example.test/", "proxy.acme.test:3128"},
		{"macOS bypassed suffix", parseScutilProxy(scutilWithProxies), "https://printer.local/", ""},
		{"macOS bypassed host", parseScutilProxy(scutilWithProxies), "https://intranet.acme.test/", ""},
		{"macOS proxies off", parseScutilProxy(scutilWithoutProxies), "https://api.github.com/", ""},
		{"Windows one proxy for all", parseWindowsProxy("proxy.acme.test:8080", ""), "https://api.github.com/", "proxy.acme.test:8080"},
		{"Windows per-scheme proxies", parseWindowsProxy("http=plain.acme.test:80;https=secure.acme.test:443", ""), "https://api.github.com/", "secure.acme.test:443"},
		{"Windows <local> bypass", parseWindowsProxy("proxy.acme.test:8080", "*.acme.test;<local>"), "https://intranet/", ""},
		{"Windows suffix bypass", parseWindowsProxy("proxy.acme.test:8080", "*.acme.test;<local>"), "https://wiki.acme.test/", ""},
		{"this machine is never proxied", parseWindowsProxy("proxy.acme.test:8080", ""), "http://127.0.0.1:8080/", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			request, err := http.NewRequest(http.MethodGet, c.target, nil)
			if err != nil {
				t.Fatalf("building request: %v", err)
			}
			proxy, err := c.settings.proxyFor(request)
			if err != nil {
				t.Fatalf("picking proxy: %v", err)
			}
			got := ""
			if proxy != nil {
				got = proxy.Host
			}
			if got != c.want {
				t.Fatalf("wanted proxy %q for %s, got %q", c.want, c.target, got)
			}
		})
	}
}
