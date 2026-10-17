package main

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"
)

func TestUpdateCheckGoesThroughTheSystemProxy(t *testing.T) {
	releases := newFakeReleaseServer(t)
	releases.publishRelease("18.10.2026", "")
	corporate := newForwardProxy(t)
	app, _ := newUpdateApp(t, "release", "17.10.2026", releases)
	app.systemProxy = alwaysProxy(corporate.url)

	if check := app.CheckForUpdate(); check.Outcome != UpdateOutcomeAvailable {
		t.Fatalf("wanted an update found through the system proxy, got %+v", check)
	}
	if n := corporate.forwarded.Load(); n != 1 {
		t.Fatalf("wanted the check forwarded once by the system proxy, got %d", n)
	}
}

func TestUpdateCheckBypassesASystemProxyThatIsMarasi(t *testing.T) {
	cases := []struct {
		name string
		host func(listener string) string
	}{
		{"as the listener's address", func(listener string) string { return listener }},
		{"as localhost", func(listener string) string {
			_, port, _ := net.SplitHostPort(listener)
			return net.JoinHostPort("localhost", port)
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			releases := newFakeReleaseServer(t)
			releases.publishRelease("18.10.2026", "")
			app, _, _, _ := newLaunchApp(t)
			app.build = BuildInfo{Channel: "release", Version: "17.10.2026"}
			app.releaseSource = releases.URL()
			listener := listenerAddress(t, app)
			app.systemProxy = alwaysProxy(&url.URL{Scheme: "http", Host: c.host(listener)})

			if check := app.CheckForUpdate(); check.Outcome != UpdateOutcomeAvailable {
				t.Fatalf("wanted an update found, got %+v", check)
			}

			// A request researchers send through the listener after the check
			// shows the ledger has caught up; it must be the only one there.
			sendThroughListener(t, listener, releases.URL()+"/after-the-check")
			waitForTrafficCount(t, app, 1)
			if got := countTraffic(t, app, "", "", TrafficCountOptions{IgnoreExclusion: true}).Count; got != 1 {
				t.Fatalf("wanted only the researcher's request in the ledger, got %d pairs", got)
			}
		})
	}
}

func alwaysProxy(proxy *url.URL) func(*http.Request) (*url.URL, error) {
	return func(*http.Request) (*url.URL, error) { return proxy, nil }
}

type forwardProxy struct {
	url       *url.URL
	forwarded atomic.Int64
}

// newForwardProxy starts a plain HTTP forward proxy standing in for a
// corporate proxy, counting the requests it forwards.
func newForwardProxy(t *testing.T) *forwardProxy {
	t.Helper()
	proxy := &forwardProxy{}
	transport := &http.Transport{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxy.forwarded.Add(1)
		outgoing := r.Clone(r.Context())
		outgoing.RequestURI = ""
		response, err := transport.RoundTrip(outgoing)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer response.Body.Close()
		for name, values := range response.Header {
			w.Header()[name] = values
		}
		w.WriteHeader(response.StatusCode)
		_, _ = io.Copy(w, response.Body)
	}))
	t.Cleanup(server.Close)
	t.Cleanup(transport.CloseIdleConnections)
	proxy.url, _ = url.Parse(server.URL)
	return proxy
}

func sendThroughListener(t *testing.T, listener, target string) {
	t.Helper()
	transport := &http.Transport{Proxy: http.ProxyURL(&url.URL{Scheme: "http", Host: listener}), DisableKeepAlives: true}
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
	response, err := client.Get(target)
	if err != nil {
		t.Fatalf("sending a request through the listener: %v", err)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	response.Body.Close()
}

func waitForTrafficCount(t *testing.T, app *App, want int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for countTraffic(t, app, "", "", TrafficCountOptions{IgnoreExclusion: true}).Count < want {
		if time.Now().After(deadline) {
			t.Fatalf("wanted %d pairs in the ledger", want)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
