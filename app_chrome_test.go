package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	goruntime "runtime"
	"slices"
	"strings"
	"testing"
	"time"

	marasi "github.com/tfkr-ae/marasi"
	"github.com/tfkr-ae/marasi/chrome"
	"github.com/tfkr-ae/marasi/service"
)

func TestAppChrome(t *testing.T) {
	t.Run("should list a path another instance added", func(t *testing.T) {
		app := newProjectApp(t)
		other := newSharedConfigChrome(t, app)
		added := chrome.PathConfig{OS: "darwin", Path: "/service/chrome"}
		if _, err := other.AddPath(context.Background(), added); err != nil {
			t.Fatalf("adding path from another instance: %v", err)
		}
		if paths, _ := app.GetChromePaths(); !slices.Contains(paths, added) {
			t.Fatalf("wanted: %v in paths\ngot: %v", added, paths)
		}
	})

	t.Run("should keep a path another instance added when adding one", func(t *testing.T) {
		app := newProjectApp(t)
		app.GetChromePaths()
		other := newSharedConfigChrome(t, app)
		fromService := chrome.PathConfig{OS: "darwin", Path: "/service/chrome"}
		if _, err := other.AddPath(context.Background(), fromService); err != nil {
			t.Fatalf("adding path from another instance: %v", err)
		}
		fromApp := chrome.PathConfig{OS: "darwin", Path: "/app/chrome"}
		paths, err := app.AddChromePath(fromApp.Path, fromApp.OS)
		if err != nil {
			t.Fatalf("adding path: %v", err)
		}
		if !slices.Contains(paths, fromService) || !slices.Contains(paths, fromApp) {
			t.Fatalf("wanted: %v and %v in paths\ngot: %v", fromService, fromApp, paths)
		}
		saved, err := other.Paths(context.Background())
		if err != nil {
			t.Fatalf("reading saved paths: %v", err)
		}
		if !slices.Contains(saved, fromService) || !slices.Contains(saved, fromApp) {
			t.Fatalf("wanted: %v and %v saved\ngot: %v", fromService, fromApp, saved)
		}
	})

	t.Run("should list a profile another instance added", func(t *testing.T) {
		app := newProjectApp(t)
		other := newSharedConfigChrome(t, app)
		if _, err := other.AddProfile(context.Background(), "service-profile"); err != nil {
			t.Fatalf("adding profile from another instance: %v", err)
		}
		if profiles, _ := app.GetChromeProfiles(); !slices.Contains(profiles, "service-profile") {
			t.Fatalf("wanted: service-profile in profiles\ngot: %v", profiles)
		}
	})

	t.Run("should report an invalid websocket_max_message_size from every Chrome setting", func(t *testing.T) {
		app := newProjectApp(t)
		writeInvalidMaxMessageSize(t, app)
		calls := map[string]func() error{
			"GetChromePaths":      func() error { _, err := app.GetChromePaths(); return err },
			"AddChromePath":       func() error { _, err := app.AddChromePath("/app/chrome", "darwin"); return err },
			"DeleteChromePath":    func() error { _, err := app.DeleteChromePath("/app/chrome", "darwin"); return err },
			"GetChromeProfiles":   func() error { _, err := app.GetChromeProfiles(); return err },
			"AddChromeProfile":    func() error { _, err := app.AddChromeProfile("p"); return err },
			"DeleteChromeProfile": func() error { _, err := app.DeleteChromeProfile("p"); return err },
		}
		for name, call := range calls {
			err := call()
			if err == nil || !strings.Contains(err.Error(), "invalid configuration") || !strings.Contains(err.Error(), "websocket_max_message_size") {
				t.Errorf("%s: wanted: invalid configuration error naming websocket_max_message_size\ngot: %v", name, err)
			}
		}
	})

	t.Run("should refuse to start Chrome while the proxy is stopped", func(t *testing.T) {
		app := newProjectApp(t)
		if err := app.StartBrowser(""); !errors.Is(err, service.ErrListenerInactive) {
			t.Fatalf("wanted: %v\ngot: %v", service.ErrListenerInactive, err)
		}
	})

	t.Run("should start Chrome through the proxy without a CDP endpoint", func(t *testing.T) {
		if goruntime.GOOS == "windows" {
			t.Skip("test executable is a shell script")
		}
		app := newScratchpadApp(t)
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}
		executable, argsPath := writeFakeChrome(t)
		if _, err := app.AddChromePath(executable, goruntime.GOOS); err != nil {
			t.Fatalf("adding fake Chrome: %v", err)
		}
		if err := app.StartBrowser(""); err != nil {
			t.Fatalf("starting Chrome: %v", err)
		}
		args := readFakeChromeArgs(t, argsPath)
		if !strings.Contains(args, "--proxy-server=http://"+listenerAddress(t, app)+"\n") {
			t.Fatalf("wanted: --proxy-server for the listener among arguments\ngot:\n%s", args)
		}
		if strings.Contains(args, "--remote-debugging-port") {
			t.Fatalf("wanted: no --remote-debugging-port among arguments\ngot:\n%s", args)
		}
	})
}

// writeFakeChrome writes a Chrome stand-in that records its arguments, one
// per line, to argsPath.
func writeFakeChrome(t *testing.T) (executable, argsPath string) {
	t.Helper()
	dir := t.TempDir()
	argsPath = filepath.Join(dir, "args")
	executable = filepath.Join(dir, "chrome")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"" + argsPath + ".tmp\" && mv \"" + argsPath + ".tmp\" \"" + argsPath + "\"\n"
	if err := os.WriteFile(executable, []byte(script), 0700); err != nil {
		t.Fatalf("writing fake Chrome: %v", err)
	}
	return executable, argsPath
}

// readFakeChromeArgs waits for the fake Chrome to record its arguments.
func readFakeChromeArgs(t *testing.T, argsPath string) string {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		args, err := os.ReadFile(argsPath)
		if err == nil {
			return string(args)
		}
		if !time.Now().Before(deadline) {
			t.Fatalf("reading fake Chrome arguments: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// writeInvalidMaxMessageSize appends a negative websocket_max_message_size
// to the machine config that the app's Chrome settings reread.
func writeInvalidMaxMessageSize(t *testing.T, app *App) {
	t.Helper()
	path := filepath.Join(app.Proxy.ConfigDir, "marasi_config.yaml")
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0600)
	if err != nil {
		t.Fatalf("opening config: %v", err)
	}
	defer file.Close()
	if _, err := file.WriteString("\nwebsocket_max_message_size: -1\n"); err != nil {
		t.Fatalf("writing config: %v", err)
	}
}

// newSharedConfigChrome stands in for a service instance using the app's config dir.
func newSharedConfigChrome(t *testing.T, app *App) *service.Chrome {
	t.Helper()
	proxy, err := marasi.New(
		marasi.WithLogger(slog.New(slog.NewTextHandler(io.Discard, nil))),
		marasi.WithConfigDir(app.Proxy.ConfigDir),
	)
	if err != nil {
		t.Fatalf("creating second proxy: %v", err)
	}
	return service.NewChrome(proxy, service.NewListenerLifecycle(proxy, io.Discard), io.Discard)
}
