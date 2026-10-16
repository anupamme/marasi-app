package main

import (
	"fmt"
	"strings"
	"testing"
)

func listSitemap(t *testing.T, app *App, req SitemapChildrenRequest) SitemapChildrenResult {
	t.Helper()
	result, err := app.ListSitemapChildren(req)
	if err != nil {
		t.Fatalf("listing sitemap children of %q: %v", req.Node, err)
	}
	if result.QueryError != nil {
		t.Fatalf("listing sitemap children of %q: unexpected query error %+v", req.Node, *result.QueryError)
	}
	return result
}

// formatSitemap writes each child as "segment pairs/errors", with
// " matching=N" when the child has a matching count and a + when it has
// children.
func formatSitemap(children []SitemapNodeCount) string {
	parts := make([]string, len(children))
	for i, child := range children {
		parts[i] = fmt.Sprintf("%s %d/%d", child.Segment, child.Pairs, child.Errors)
		if child.Matching != nil {
			parts[i] += fmt.Sprintf(" matching=%d", *child.Matching)
		}
		if child.HasChildren {
			parts[i] += "+"
		}
	}
	return strings.Join(parts, ", ")
}

func TestListSitemapChildrenListsOriginsMinusStoredExclusion(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/users", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/orders", statusCode: 500, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/logo.png", statusCode: 200, contentType: "image/png"})
	capturePair(t, app, capturedPair{host: "www.acme.test", path: "/", statusCode: 200, contentType: "text/html"})
	excludeContentTypes(t, app, "image/png")

	result := listSitemap(t, app, SitemapChildrenRequest{})

	if got, want := formatSitemap(result.Children), "https://api.acme.test 2/1+, https://www.acme.test 1/0"; got != want {
		t.Fatalf("wanted origins %q, got %q", want, got)
	}
	if result.Children[0].Name != "https://api.acme.test" || !result.Complete || result.NextCursor != nil {
		t.Fatalf("wanted the origin's name, a complete sitemap and no next page, got %+v", result)
	}
}

func TestListSitemapChildrenPagesANodesChildren(t *testing.T) {
	app := newScratchpadApp(t)
	for _, path := range []string{"/v2/users", "/v2/users", "/v2/users", "/v2/orders", "/v2/orders", "/v2/carts"} {
		capturePair(t, app, capturedPair{host: "api.acme.test", path: path, statusCode: 200, contentType: "application/json"})
	}

	first := listSitemap(t, app, SitemapChildrenRequest{Node: "https://api.acme.test/v2", Limit: 2})
	if got, want := formatSitemap(first.Children), "users 3/0, orders 2/0"; got != want || first.NextCursor == nil {
		t.Fatalf("wanted first page %q with a next cursor, got %q (%v)", want, got, first.NextCursor)
	}
	second := listSitemap(t, app, SitemapChildrenRequest{Node: "https://api.acme.test/v2", Limit: 2, Cursor: *first.NextCursor})
	if got, want := formatSitemap(second.Children), "carts 1/0"; got != want || second.NextCursor != nil {
		t.Fatalf("wanted second page %q and no next cursor, got %q (%v)", want, got, second.NextCursor)
	}
}

func TestListSitemapChildrenCountsOnlyMatchesUpToAsOfInMatchingMode(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/users", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/orders", statusCode: 500, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "www.acme.test", path: "/", statusCode: 500, contentType: "text/html"})
	asOf := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/carts", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/users", statusCode: 500, contentType: "application/json"})

	result := listSitemap(t, app, SitemapChildrenRequest{
		Node: "https://api.acme.test/v2", Query: `status_code >= 500`, AsOf: asOf.String(), Matching: true,
	})

	if got, want := formatSitemap(result.Children), "orders 1/1"; got != want {
		t.Fatalf("wanted only matches up to as_of %q, got %q", want, got)
	}
}

func TestListSitemapChildrenMatchingModeAppliesStoredExclusion(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})
	asOf := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/b", statusCode: 200, contentType: "image/png"})
	excludeContentTypes(t, app, "image/png")

	result := listSitemap(t, app, SitemapChildrenRequest{Query: `host = "api.acme.test"`, AsOf: asOf.String(), Matching: true})

	if got, want := formatSitemap(result.Children), "https://api.acme.test 1/0+"; got != want {
		t.Fatalf("wanted %q, got %q", want, got)
	}
}

func TestListSitemapChildrenAddsMatchingCountsInAllTrafficWithAQuery(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/users", statusCode: 200, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/users", statusCode: 500, contentType: "application/json"})
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/orders", statusCode: 200, contentType: "application/json"})
	asOf := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/orders", statusCode: 200, contentType: "application/json"})
	// After as_of: counted in the totals, not in the matching counts.
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/v2/orders", statusCode: 500, contentType: "application/json"})

	result := listSitemap(t, app, SitemapChildrenRequest{Node: "https://api.acme.test/v2", Query: `status_code >= 500`, AsOf: asOf.String()})

	if got, want := formatSitemap(result.Children), "orders 3/1 matching=0, users 2/1 matching=1"; got != want {
		t.Fatalf("wanted %q, got %q", want, got)
	}
}

func TestListSitemapChildrenOfAMissingNodeIsEmpty(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})

	result := listSitemap(t, app, SitemapChildrenRequest{Node: "https://gone.acme.test"})

	if len(result.Children) != 0 || !result.Missing {
		t.Fatalf("wanted no children and Missing, got %+v", result)
	}
}

func TestListSitemapChildrenReportsAnInvalidQuery(t *testing.T) {
	app := newScratchpadApp(t)
	asOf := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})

	result, err := app.ListSitemapChildren(SitemapChildrenRequest{Query: `status_code >=`, AsOf: asOf.String(), Matching: true})

	if err != nil || result.QueryError == nil {
		t.Fatalf("wanted a query error as data, got %+v, %v", result, err)
	}
}
