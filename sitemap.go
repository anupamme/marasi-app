package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/tfkr-ae/marasi/domain"
)

// sitemapPageSize is the number of children a ListSitemapChildren page
// holds when the request names no limit.
const sitemapPageSize = domain.MaxSitemapPage

// maxMatchingPages bounds the query-mode pages read to fill the matching
// counts of one All traffic page.
const maxMatchingPages = 4

// SitemapChildrenRequest asks for one page of a sitemap node's children.
type SitemapChildrenRequest struct {
	// Node is a node's name, such as https://api.acme.test/v2; "" lists
	// the origins.
	Node string
	// Cursor is "" for the first page, else a NextCursor from an earlier
	// page of the same node, query and mode.
	Cursor string
	// Limit is the page's size; 0 is sitemapPageSize. Marasi caps it.
	Limit int
	// Query is the researcher's running query, "" when none runs.
	Query string
	// AsOf is the query results' AsOf. Matching counts only reach pairs up
	// to it, so they follow the results, not live traffic.
	AsOf string
	// Matching counts only the pairs the query matches (Marasi's query
	// mode). Without it the counts are All traffic, and a Query adds each
	// child's matching count.
	Matching bool
	// Exclusion is the content-type exclusion to leave out, as the ledger
	// shows it; it can be ahead of the stored one while a save is in
	// flight. nil uses the project's stored exclusion.
	Exclusion []string
}

// SitemapNodeCount is one child of a sitemap node.
type SitemapNodeCount struct {
	Name        string // canonical node name; the value for `sitemap = "…"`
	Segment     string // the origin at the top level, else one path segment
	Pairs       int64  // pairs in the subtree, minus the content-type exclusion
	Errors      int64  // 5xx responses in the subtree
	HasChildren bool
	// Matching is how many of the subtree's pairs the query matches, in All
	// traffic with a query. nil without a query, or when it is unknown.
	Matching *int64
}

// SitemapChildrenResult is one page of a sitemap node's children, busiest
// first.
type SitemapChildrenResult struct {
	Children   []SitemapNodeCount
	NextCursor *string // nil when nothing follows
	// Complete is false while Marasi's sitemap job is still placing older
	// pairs, so the counts may be low.
	Complete bool
	// Missing is true when the node no longer exists, for example after its
	// pairs were deleted.
	Missing    bool
	QueryError *TrafficQueryError // nil when the query is valid
}

// ListSitemapChildren reads one page of a sitemap node's children, minus
// the project's content-type exclusion. See SitemapChildrenRequest for the
// modes.
func (a *App) ListSitemapChildren(req SitemapChildrenRequest) (SitemapChildrenResult, error) {
	result, err := a.listSitemapChildren(req)
	if queryErr, ok := asQueryError(err); ok {
		return SitemapChildrenResult{QueryError: queryErr}, nil
	}
	if errors.Is(err, domain.ErrSitemapNodeNotFound) {
		return SitemapChildrenResult{Children: []SitemapNodeCount{}, Complete: true, Missing: true}, nil
	}
	if err != nil {
		return SitemapChildrenResult{}, fmt.Errorf("listing sitemap children: %w", err)
	}
	return result, nil
}

func (a *App) listSitemapChildren(req SitemapChildrenRequest) (SitemapChildrenResult, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return SitemapChildrenResult{}, err
	}
	exclusion := req.Exclusion
	if exclusion == nil {
		if exclusion, err = a.GetContentTypeExclusion(); err != nil {
			return SitemapChildrenResult{}, err
		}
	} else if exclusion, err = normalizeExclusion(exclusion); err != nil {
		return SitemapChildrenResult{}, err
	}
	var selection *domain.SelectionQuery
	if req.Query != "" {
		if selection, err = sitemapSelection(req.Query, req.AsOf, exclusion); err != nil {
			return SitemapChildrenResult{}, err
		}
	}
	if req.Matching && selection == nil {
		return SitemapChildrenResult{}, errors.New("matching mode needs a query")
	}
	limit := req.Limit
	if limit <= 0 {
		limit = sitemapPageSize
	}
	q := domain.SitemapQuery{Node: req.Node, Cursor: req.Cursor, Limit: limit}
	if req.Matching {
		q.Query = selection
	} else {
		q.Exclusion = exclusion
	}
	ctx := a.sitemapContext()
	page, err := traffic.ListSitemapChildren(ctx, q)
	if err != nil {
		return SitemapChildrenResult{}, err
	}
	result := SitemapChildrenResult{
		Children:   make([]SitemapNodeCount, 0, len(page.Children)),
		NextCursor: page.NextCursor,
		Complete:   page.Complete[domain.JobSitemap],
	}
	for _, child := range page.Children {
		result.Children = append(result.Children, SitemapNodeCount{
			Name: child.Name, Segment: child.Segment, Pairs: child.Pairs, Errors: child.Errors, HasChildren: child.HasChildren,
		})
	}
	if !req.Matching && selection != nil && len(result.Children) > 0 {
		if err := addMatchingCounts(ctx, traffic, req.Node, selection, result.Children); err != nil {
			return SitemapChildrenResult{}, err
		}
	}
	return result, nil
}

// sitemapSelection is the query mode's selection: the query's matches up
// to asOf, minus the exclusion.
func sitemapSelection(query, asOf string, exclusion []string) (*domain.SelectionQuery, error) {
	bound, err := parseOptionalPairID("as_of", asOf)
	if err != nil {
		return nil, err
	}
	if bound == nil {
		return nil, errors.New("a query needs the results' as_of")
	}
	normalized, err := domain.NormalizeExclusion(exclusion)
	if err != nil {
		return nil, err
	}
	return &domain.SelectionQuery{Text: query, Exclusion: normalized, AsOf: *bound}, nil
}

// addMatchingCounts fills in each child's matching count from query-mode
// pages of the same node. Query mode lists the busiest children first, so
// once its pages run out every child not listed has no match. Children
// still unlisted after maxMatchingPages keep a nil count.
func addMatchingCounts(ctx context.Context, traffic domain.TrafficRepository, node string, selection *domain.SelectionQuery, children []SitemapNodeCount) error {
	want := make(map[string]int, len(children))
	for i, child := range children {
		want[child.Name] = i
	}
	cursor := ""
	for range maxMatchingPages {
		page, err := traffic.ListSitemapChildren(ctx, domain.SitemapQuery{
			Node: node, Query: selection, Cursor: cursor, Limit: domain.MaxSitemapPage,
		})
		if errors.Is(err, domain.ErrSitemapNodeNotFound) {
			break
		}
		if err != nil {
			return err
		}
		for _, child := range page.Children {
			if i, ok := want[child.Name]; ok {
				pairs := child.Pairs
				children[i].Matching = &pairs
				delete(want, child.Name)
			}
		}
		if len(want) == 0 {
			return nil
		}
		if page.NextCursor == nil {
			for _, i := range want {
				zero := int64(0)
				children[i].Matching = &zero
			}
			return nil
		}
		cursor = *page.NextCursor
	}
	return nil
}

// sitemapContext is the app's context once Wails has started it, so reads
// stop when the app shuts down.
func (a *App) sitemapContext() context.Context {
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}
