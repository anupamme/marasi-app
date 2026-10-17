package main

import (
	"fmt"
	"slices"
	"testing"
)

func TestCountContentTypesCountsEveryTypeIncludingExcludedAndInFlightPairs(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "cdn.acme.test", path: "/c", statusCode: 200, contentType: "image/png"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/d"})
	// Excluded types are still counted: the Types menu lists them as Hidden.
	excludeContentTypes(t, app, "image/*")

	counts, err := app.CountContentTypes()

	if err != nil {
		t.Fatalf("counting content types: %v", err)
	}
	got := make([]string, 0, len(counts.Counts))
	for _, c := range counts.Counts {
		got = append(got, fmt.Sprintf("%s=%d", c.ContentType, c.Count))
	}
	want := []string{"application/json=2", "=1", "image/png=1"}
	if !slices.Equal(got, want) {
		t.Fatalf("wanted %v, got %v", want, got)
	}
	if _, ok := counts.Complete["sitemap"]; !ok {
		t.Fatalf("wanted the sitemap job's completeness, got %v", counts.Complete)
	}
}

func TestCountContentTypesReturnsGoErrorWithoutAProject(t *testing.T) {
	app := newProjectApp(t)

	_, err := app.CountContentTypes()

	if err == nil {
		t.Fatalf("wanted an error when no project is open")
	}
}
