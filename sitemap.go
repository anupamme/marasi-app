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

// SitemapLevelsRequest asks for one page of the children of each of
// several nodes at once, under one query, scope and exclusion. The fields
// mean what SitemapChildrenRequest's do.
type SitemapLevelsRequest struct {
	// Nodes are node names; "" is the origins. Marasi takes up to
	// domain.MaxSitemapLevels.
	Nodes []string
	// Cursors continue a node's page, by node name; a node without one
	// starts at its first page.
	Cursors   map[string]string
	Limit     int
	Query     string
	AsOf      string
	Matching  bool
	Exclusion []string
}

// SitemapLevelResult is one node's page in a SitemapLevelsResult.
type SitemapLevelResult struct {
	Node       string
	Children   []SitemapNodeCount
	NextCursor *string
	// Missing is true when the node no longer exists.
	Missing bool
}

// SitemapLevelsResult answers a SitemapLevelsRequest, one level per node
// in the request's order.
type SitemapLevelsResult struct {
	Levels []SitemapLevelResult
	// Complete is false while Marasi's sitemap job is still placing older
	// pairs, so the counts may be low.
	Complete   bool
	QueryError *TrafficQueryError // nil when the query is valid
}

// ListSitemapLevels reads several sitemap levels in one call, resolving
// the query once for all of them: the dock's reload after a query, as_of,
// exclusion or scope change.
func (a *App) ListSitemapLevels(req SitemapLevelsRequest) (SitemapLevelsResult, error) {
	result, err := a.listSitemapLevels(req)
	if queryErr, ok := asQueryError(err); ok {
		return SitemapLevelsResult{QueryError: queryErr}, nil
	}
	if err != nil {
		return SitemapLevelsResult{}, fmt.Errorf("listing sitemap levels: %w", err)
	}
	return result, nil
}

// ListSitemapChildren reads one page of a sitemap node's children, minus
// the project's content-type exclusion. See SitemapChildrenRequest for the
// modes.
func (a *App) ListSitemapChildren(req SitemapChildrenRequest) (SitemapChildrenResult, error) {
	cursors := map[string]string{}
	if req.Cursor != "" {
		cursors[req.Node] = req.Cursor
	}
	result, err := a.listSitemapLevels(SitemapLevelsRequest{
		Nodes: []string{req.Node}, Cursors: cursors, Limit: req.Limit,
		Query: req.Query, AsOf: req.AsOf, Matching: req.Matching, Exclusion: req.Exclusion,
	})
	if queryErr, ok := asQueryError(err); ok {
		return SitemapChildrenResult{QueryError: queryErr}, nil
	}
	if err != nil {
		return SitemapChildrenResult{}, fmt.Errorf("listing sitemap children: %w", err)
	}
	level := result.Levels[0]
	if level.Missing {
		return SitemapChildrenResult{Children: []SitemapNodeCount{}, Complete: true, Missing: true}, nil
	}
	return SitemapChildrenResult{Children: level.Children, NextCursor: level.NextCursor, Complete: result.Complete}, nil
}

func (a *App) listSitemapLevels(req SitemapLevelsRequest) (SitemapLevelsResult, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return SitemapLevelsResult{}, err
	}
	exclusion := req.Exclusion
	if exclusion == nil {
		if exclusion, err = a.GetContentTypeExclusion(); err != nil {
			return SitemapLevelsResult{}, err
		}
	} else if exclusion, err = normalizeExclusion(exclusion); err != nil {
		return SitemapLevelsResult{}, err
	}
	q := domain.SitemapLevelsQuery{
		Nodes: req.Nodes, Scope: domain.SitemapScopeAll, Exclusion: exclusion, Cursors: req.Cursors, Limit: req.Limit,
	}
	if q.Limit <= 0 {
		q.Limit = sitemapPageSize
	}
	if req.Query != "" {
		if q.Selection, err = sitemapSelection(req.Query, req.AsOf, exclusion); err != nil {
			return SitemapLevelsResult{}, err
		}
	}
	if req.Matching {
		if q.Selection == nil {
			return SitemapLevelsResult{}, errors.New("matching mode needs a query")
		}
		q.Scope = domain.SitemapScopeMatching
	}
	levels, err := traffic.ListSitemapLevels(a.sitemapContext(), q)
	if err != nil {
		return SitemapLevelsResult{}, err
	}
	result := SitemapLevelsResult{
		Levels:   make([]SitemapLevelResult, 0, len(levels.Levels)),
		Complete: levels.Complete[domain.JobSitemap],
	}
	for _, level := range levels.Levels {
		out := SitemapLevelResult{Node: level.Node, NextCursor: level.NextCursor, Missing: level.Missing}
		out.Children = make([]SitemapNodeCount, 0, len(level.Children))
		for _, child := range level.Children {
			count := SitemapNodeCount{
				Name: child.Name, Segment: child.Segment, Pairs: child.Pairs, Errors: child.Errors,
				HasChildren: child.HasChildren, Matching: child.Matching,
			}
			// Matching mode counts only the matches, so they are the counts.
			if req.Matching && child.Matching != nil {
				count.Pairs = *child.Matching
				if child.MatchingErrors != nil {
					count.Errors = *child.MatchingErrors
				}
				count.Matching = nil
			}
			out.Children = append(out.Children, count)
		}
		result.Levels = append(result.Levels, out)
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

// sitemapContext is the app's context once Wails has started it, so reads
// stop when the app shuts down.
func (a *App) sitemapContext() context.Context {
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}
