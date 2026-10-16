package main

import (
	"testing"

	"github.com/google/uuid"
)

func countTraffic(t *testing.T, app *App, query string, after string) TrafficCountResult {
	t.Helper()
	result, err := app.CountTraffic(query, after)
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

func TestCountTrafficReturnsInvalidQueryAsData(t *testing.T) {
	app := newScratchpadApp(t)

	result, err := app.CountTraffic(`status_code >=`, "")

	if err != nil {
		t.Fatalf("wanted the query error as data, got error %v", err)
	}
	if result.QueryError == nil || result.QueryError.Message == "" {
		t.Fatalf("wanted a query error, got %+v", result)
	}
}

func TestCountTrafficRejectsMalformedAfter(t *testing.T) {
	app := newScratchpadApp(t)

	if _, err := app.CountTraffic("", "not-a-uuid"); err == nil {
		t.Fatal("wanted an error for a malformed after id")
	}
}
