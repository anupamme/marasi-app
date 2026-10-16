package main

import (
	"testing"

	"github.com/google/uuid"
)

func countTraffic(t *testing.T, app *App, query string, after string, options ...TrafficCountOptions) TrafficCountResult {
	t.Helper()
	var opts TrafficCountOptions
	if len(options) > 0 {
		opts = options[0]
	}
	result, err := app.CountTraffic(query, after, opts)
	if err != nil {
		t.Fatalf("counting %q: %v", query, err)
	}
	if result.QueryError != nil {
		t.Fatalf("counting %q: unexpected query error %+v", query, *result.QueryError)
	}
	return result
}

func TestCountTrafficCountsMatchesMinusStoredExclusion(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "text/html"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/c", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "www.acme.test", path: "/d", statusCode: 200, contentType: "application/json"})
	excludeContentTypes(t, app, "text/html")

	result := countTraffic(t, app, `host = "api.acme.test"`, "")

	if result.Count != 2 || result.Capped {
		t.Fatalf("wanted 2 uncapped matches, got %+v", result)
	}
}

func TestCountTrafficCountsOnlyPairsAfterTheGivenPair(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	asOf := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/c", statusCode: 200, contentType: "application/json"})

	result := countTraffic(t, app, `host = "api.acme.test"`, asOf.String())

	if result.Count != 1 {
		t.Fatalf("wanted 1 match after %s, got %+v", asOf, result)
	}
}

func TestCountTrafficCountsHasNoteMark(t *testing.T) {
	app := newScratchpadApp(t)
	noted := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "application/json"})
	if err := app.Proxy.TrafficRepo.UpdateNote(noted, "check this"); err != nil {
		t.Fatalf("writing note: %v", err)
	}

	result := countTraffic(t, app, "note:*", "")

	if result.Count != 1 {
		t.Fatalf("wanted 1 pair with a note, got %+v", result)
	}
}

func TestCountTrafficCountsLinkMarks(t *testing.T) {
	app := newScratchpadApp(t)
	inFinding := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	inTestCase := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "application/json"})
	inLaunchpad := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/c", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/d", statusCode: 200, contentType: "application/json"})
	if _, err := app.CreateDraftFinding([]uuid.UUID{inFinding}, nil); err != nil {
		t.Fatalf("creating finding: %v", err)
	}
	if _, err := app.CreateDraftTestCase([]uuid.UUID{inTestCase}); err != nil {
		t.Fatalf("creating test case: %v", err)
	}
	app.LinkRequestToLaunchpad(inLaunchpad, app.CreateLaunchpadEntry("Request 3", ""))

	for _, term := range []string{"finding:*", "test_case:*", "launchpad:*"} {
		if got := countTraffic(t, app, term, "").Count; got != 1 {
			t.Errorf("%s: wanted 1 pair, got %d", term, got)
		}
	}
}

// marasi records interception as metadata "intercepted": true on the pair.
func TestCountTrafficCountsInterceptedMark(t *testing.T) {
	app := newScratchpadApp(t)
	intercepted := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "application/json"})
	if err := app.Proxy.TrafficRepo.UpdateMetadata(map[string]any{"intercepted": true}, intercepted); err != nil {
		t.Fatalf("marking pair intercepted: %v", err)
	}

	if got := countTraffic(t, app, "metadata.intercepted = true", "").Count; got != 1 {
		t.Fatalf("wanted 1 intercepted pair, got %d", got)
	}
}

func TestCountTrafficReturnsInvalidQueryAsData(t *testing.T) {
	app := newScratchpadApp(t)

	result, err := app.CountTraffic(`status_code >=`, "", TrafficCountOptions{})

	if err != nil {
		t.Fatalf("wanted the query error as data, got error %v", err)
	}
	if result.QueryError == nil || result.QueryError.Message == "" {
		t.Fatalf("wanted a query error, got %+v", result)
	}
}

func TestCountTrafficRejectsMalformedAfter(t *testing.T) {
	app := newScratchpadApp(t)

	if _, err := app.CountTraffic("", "not-a-uuid", TrafficCountOptions{}); err == nil {
		t.Fatal("wanted an error for a malformed after id")
	}
}

func TestCountTrafficCanIgnoreTheExclusion(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "image/png"})
	capturePair(t, app, capturedPair{host: "www.acme.test", path: "/c", statusCode: 200, contentType: "application/json"})
	excludeContentTypes(t, app, "image/png")

	shown := countTraffic(t, app, "", "")
	all := countTraffic(t, app, "", "", TrafficCountOptions{IgnoreExclusion: true})

	if shown.Count != 2 || all.Count != 3 {
		t.Fatalf("wanted 2 shown and 3 in all, got %d and %d", shown.Count, all.Count)
	}
	if shown.Capped || !shown.IndexComplete {
		t.Fatalf("wanted an exact count over a complete index, got %+v", shown)
	}
}

func TestCountTrafficCountsOnlyPairsUpToAsOf(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 500, contentType: "text/html"})
	page := pageTraffic(t, app, TrafficPageRequest{Query: "status_code >= 500"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 502, contentType: "text/html"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/c", statusCode: 200, contentType: "text/html"})

	fresh := countTraffic(t, app, "status_code >= 500", page.AsOf)
	snapshot := countTraffic(t, app, "status_code >= 500", "", TrafficCountOptions{AsOf: page.AsOf})

	if fresh.Count != 1 || snapshot.Count != 1 {
		t.Fatalf("wanted 1 new match and 1 in the snapshot, got %d and %d", fresh.Count, snapshot.Count)
	}
}

func TestCountTrafficRejectsMalformedAsOf(t *testing.T) {
	app := newScratchpadApp(t)

	if _, err := app.CountTraffic("", "", TrafficCountOptions{AsOf: "not-a-uuid"}); err == nil {
		t.Fatal("wanted an error for a malformed as_of")
	}
}
