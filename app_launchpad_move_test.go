package main

import (
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// filledLaunchpad creates a launchpad called name holding one new pair per
// host, in that entry order, and returns its id and the pairs.
func filledLaunchpad(t *testing.T, app *App, name string, hosts ...string) (uuid.UUID, []uuid.UUID) {
	t.Helper()
	launchpad := app.CreateLaunchpadEntry(name, "")
	pairs := make([]uuid.UUID, len(hosts))
	for i, host := range hosts {
		pairs[i] = jsonPair(t, app, host)
		app.LinkRequestToLaunchpad(pairs[i], launchpad)
	}
	return launchpad, pairs
}

// pendingLaunch returns an app with a launchpad and a launch from it that
// stays pending until the test ends, and the launch's id, which is its
// pair's id.
func pendingLaunch(t *testing.T) (*App, uuid.UUID, uuid.UUID) {
	t.Helper()
	app, _, launchpad, origin := newLaunchApp(t)
	id, err := app.Launch(rawGet(origin, "/slow?sleep=30"), launchpad.String(), false)
	if err != nil {
		t.Fatalf("launching: %v", err)
	}
	t.Cleanup(func() { app.CancelLaunch(id) })
	return app, launchpad, id
}

// wantLaunchPending fails unless err is the launch_pending refusal naming
// exactly ids.
func wantLaunchPending(t *testing.T, err error, ids ...uuid.UUID) {
	t.Helper()
	names := make([]string, len(ids))
	for i, id := range ids {
		names[i] = id.String()
	}
	if want := "launch_pending (" + strings.Join(names, ", ") + ")"; err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("wanted %q, got %v", want, err)
	}
}

func TestMoveLaunchpadEntriesRefusesToMoveAPendingLaunchElsewhere(t *testing.T) {
	app, launchpad, launch := pendingLaunch(t)
	target := app.CreateLaunchpadEntry("Admin", "")

	_, err := app.MoveLaunchpadEntries(launchpad, target, []uuid.UUID{launch}, "")

	wantLaunchPending(t, err, launch)
	if got := launchpadPairIDs(app, target); len(got) != 0 {
		t.Fatalf("wanted nothing moved, got %v in the target", got)
	}
}

func TestMoveLaunchpadEntriesReordersALaunchpad(t *testing.T) {
	app := newScratchpadApp(t)
	launchpad, p := filledLaunchpad(t, app, "Login", "a.acme.test", "b.acme.test", "c.acme.test")

	moved, err := app.MoveLaunchpadEntries(launchpad, launchpad, []uuid.UUID{p[2]}, p[0].String())

	if err != nil || !slices.Equal(moved, []uuid.UUID{p[2]}) {
		t.Fatalf("wanted c moved, got %v, %v", moved, err)
	}
	if got := launchpadPairIDs(app, launchpad); !slices.Equal(got, []uuid.UUID{p[2], p[0], p[1]}) {
		t.Fatalf("wanted c, a, b, got %v", got)
	}
}

func TestMoveLaunchpadEntriesReportsAnInvalidPlacement(t *testing.T) {
	app := newScratchpadApp(t)
	launchpad, p := filledLaunchpad(t, app, "Login", "a.acme.test", "b.acme.test")

	_, err := app.MoveLaunchpadEntries(launchpad, launchpad, []uuid.UUID{p[0]}, p[0].String())

	if err == nil || !strings.Contains(err.Error(), "invalid_placement") {
		t.Fatalf("wanted invalid_placement, got %v", err)
	}
	if got := launchpadPairIDs(app, launchpad); !slices.Equal(got, p) {
		t.Fatalf("wanted the order unchanged, got %v", got)
	}
}

func TestMoveLaunchpadEntriesReportsAPairAlreadyInTheTarget(t *testing.T) {
	app := newScratchpadApp(t)
	source, p := filledLaunchpad(t, app, "Login", "a.acme.test", "b.acme.test")
	target, _ := filledLaunchpad(t, app, "Admin")
	app.LinkRequestToLaunchpad(p[1], target)

	_, err := app.MoveLaunchpadEntries(source, target, p, "")

	if err == nil || !strings.Contains(err.Error(), "already_linked") {
		t.Fatalf("wanted already_linked, got %v", err)
	}
	if got := launchpadPairIDs(app, source); !slices.Equal(got, p) {
		t.Fatalf("wanted nothing moved, got %v left in the source", got)
	}
}

func TestMoveLaunchpadEntriesReportsAPairNotInTheSource(t *testing.T) {
	app := newScratchpadApp(t)
	source, p := filledLaunchpad(t, app, "Login", "a.acme.test")
	target, _ := filledLaunchpad(t, app, "Admin")
	stray := jsonPair(t, app, "b.acme.test")

	_, err := app.MoveLaunchpadEntries(source, target, []uuid.UUID{p[0], stray}, "")

	if err == nil || !strings.Contains(err.Error(), "not_linked") {
		t.Fatalf("wanted not_linked, got %v", err)
	}
	if got := launchpadPairIDs(app, target); len(got) != 0 {
		t.Fatalf("wanted nothing moved, got %v in the target", got)
	}
}

func TestMoveLaunchpadEntriesMovesToTheEndOfAnotherLaunchpad(t *testing.T) {
	app := newScratchpadApp(t)
	source, p := filledLaunchpad(t, app, "Login", "a.acme.test", "b.acme.test", "c.acme.test")
	target, q := filledLaunchpad(t, app, "Admin", "d.acme.test")

	moved, err := app.MoveLaunchpadEntries(source, target, []uuid.UUID{p[2], p[0]}, "")

	if err != nil || !slices.Equal(moved, []uuid.UUID{p[0], p[2]}) {
		t.Fatalf("wanted a and c moved in entry order, got %v, %v", moved, err)
	}
	if got := launchpadPairIDs(app, target); !slices.Equal(got, []uuid.UUID{q[0], p[0], p[2]}) {
		t.Fatalf("wanted d, a, c in the target, got %v", got)
	}
	if got := launchpadPairIDs(app, source); !slices.Equal(got, []uuid.UUID{p[1]}) {
		t.Fatalf("wanted only b left in the source, got %v", got)
	}
}
