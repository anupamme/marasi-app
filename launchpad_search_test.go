package main

import (
	"testing"

	"github.com/google/uuid"
)

const anyPartHasNeedle = `request_head:"needle-7f" OR request_body:"needle-7f" OR response_head:"needle-7f" OR response_body:"needle-7f"`

func searchLaunchpadEntries(t *testing.T, app *App, query string) LaunchpadSearchResult {
	t.Helper()
	result, err := app.SearchLaunchpadEntries(query)
	if err != nil {
		t.Fatalf("searching launchpads for %q: %v", query, err)
	}
	return result
}

func TestSearchLaunchpadEntriesMapsMatchesToEveryLaunchpadHoldingThem(t *testing.T) {
	app := newScratchpadApp(t)
	first := app.CreateLaunchpadEntry("first", "")
	second := app.CreateLaunchpadEntry("second", "")
	// Linked from the Ledger: no launchpad_id in its metadata, only membership.
	original := capturePair(t, app, capturedPair{host: "a.test", path: "/orig", statusCode: 200, contentType: "text/plain", body: "has needle-7f"})
	quiet := capturePair(t, app, capturedPair{host: "a.test", path: "/quiet", statusCode: 200, contentType: "text/plain", body: "nothing"})
	shared := capturePair(t, app, capturedPair{host: "b.test", path: "/shared", statusCode: 200, contentType: "text/plain", body: "needle-7f again"})
	capturePair(t, app, capturedPair{host: "c.test", path: "/unlinked", statusCode: 200, contentType: "text/plain", body: "needle-7f outside"})
	app.LinkRequestToLaunchpad(original, first)
	app.LinkRequestToLaunchpad(quiet, first)
	app.LinkRequestToLaunchpad(shared, first)
	app.LinkRequestToLaunchpad(shared, second)

	result := searchLaunchpadEntries(t, app, anyPartHasNeedle)

	if result.QueryError != nil {
		t.Fatalf("unexpected query error %+v", *result.QueryError)
	}
	if len(result.EntriesByLaunchpad) != 2 {
		t.Fatalf("wanted matches in 2 launchpads, got %v", result.EntriesByLaunchpad)
	}
	assertIDs(t, []uuid.UUID{original, shared}, result.EntriesByLaunchpad[first.String()])
	assertIDs(t, []uuid.UUID{shared}, result.EntriesByLaunchpad[second.String()])
}

func TestSearchLaunchpadEntriesFindsRequestLineText(t *testing.T) {
	app := newScratchpadApp(t)
	launchpad := app.CreateLaunchpadEntry("lp", "")
	pair := capturePair(t, app, capturedPair{host: "a.test", path: "/needle-7f/x", statusCode: 200, contentType: "text/plain", body: "ok"})
	app.LinkRequestToLaunchpad(pair, launchpad)

	result := searchLaunchpadEntries(t, app, anyPartHasNeedle)

	assertIDs(t, []uuid.UUID{pair}, result.EntriesByLaunchpad[launchpad.String()])
}

func TestSearchLaunchpadEntriesReturnsNoLaunchpadsWithoutMatches(t *testing.T) {
	app := newScratchpadApp(t)
	launchpad := app.CreateLaunchpadEntry("lp", "")
	pair := capturePair(t, app, capturedPair{host: "a.test", path: "/x", statusCode: 200, contentType: "text/plain", body: "ok"})
	app.LinkRequestToLaunchpad(pair, launchpad)

	result := searchLaunchpadEntries(t, app, anyPartHasNeedle)

	if len(result.EntriesByLaunchpad) != 0 || result.QueryError != nil {
		t.Fatalf("wanted no matches and no error, got %+v", result)
	}
}

func TestSearchLaunchpadEntriesReportsAnInvalidQueryAsData(t *testing.T) {
	app := newScratchpadApp(t)
	app.CreateLaunchpadEntry("lp", "")

	result := searchLaunchpadEntries(t, app, `response_body:"ab"`)

	if result.QueryError == nil || result.QueryError.Message == "" {
		t.Fatalf("wanted a query error, got %+v", result)
	}
}

// anyPartHas mirrors the frontend's entrySearchQuery: the text as one
// escaped literal per searched part.
func anyPartHas(text string) string {
	literal := aipString(text)
	return "request_head:" + literal + " OR request_body:" + literal + " OR response_head:" + literal + " OR response_body:" + literal
}

func TestSearchLaunchpadEntriesMatchesHostileTextLiterally(t *testing.T) {
	app := newScratchpadApp(t)
	launchpad := app.CreateLaunchpadEntry("lp", "")
	hostile := []string{`x" OR "1`, `a\b\"c`, `NEAR(foo bar)`, `launchpad = "x"`, `))) AND (((`, `foo* ^bar`}
	want := map[string]uuid.UUID{}
	for i, text := range hostile {
		pair := capturePair(t, app, capturedPair{host: "a.test", path: "/" + string(rune('a'+i)), statusCode: 200, contentType: "text/plain", body: "<" + text + ">"})
		app.LinkRequestToLaunchpad(pair, launchpad)
		want[text] = pair
	}
	decoy := capturePair(t, app, capturedPair{host: "a.test", path: "/decoy", statusCode: 200, contentType: "text/plain", body: "x OR 1 a b c foo bar"})
	app.LinkRequestToLaunchpad(decoy, launchpad)

	for _, text := range hostile {
		result := searchLaunchpadEntries(t, app, anyPartHas(text))
		if result.QueryError != nil {
			t.Fatalf("searching %q: unexpected query error %+v", text, *result.QueryError)
		}
		assertIDs(t, []uuid.UUID{want[text]}, result.EntriesByLaunchpad[launchpad.String()])
	}
}
