package main

import (
	"errors"
	"fmt"

	"github.com/tfkr-ae/marasi/domain"
)

// trafficQueryPageSize is the number of pairs one QueryTraffic page holds.
const trafficQueryPageSize = 500

// TrafficQueryResult is one page of query results, newest first.
type TrafficQueryResult struct {
	Items         []*domain.RequestResponseSummary
	NextCursor    *string // opaque; nil when no older page exists
	IndexComplete bool
	QueryError    *TrafficQueryError // nil when the query is valid
}

// TrafficQueryError reports an invalid query in the researcher's own text.
type TrafficQueryError struct {
	Message  string
	Position int // 1-based offset into the researcher's query text; 0 when the fault is in the exclusion
}

// QueryTraffic runs the researcher's query, minus the project's content-type
// exclusion, against the project's traffic. cursor is "" for the first page,
// else a NextCursor from an earlier page of the same query.
func (a *App) QueryTraffic(query string, cursor string) (TrafficQueryResult, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return TrafficQueryResult{}, fmt.Errorf("querying traffic: %w", err)
	}
	exclusion, err := a.GetContentTypeExclusion()
	if err != nil {
		return TrafficQueryResult{}, fmt.Errorf("querying traffic: %w", err)
	}
	page, err := traffic.ListTraffic(domain.TrafficQuery{
		Text:      query,
		Exclusion: exclusion,
		Cursor:    cursor,
		Limit:     trafficQueryPageSize,
	})
	if queryErr, ok := asQueryError(err); ok {
		return TrafficQueryResult{QueryError: queryErr}, nil
	}
	if err != nil {
		return TrafficQueryResult{}, fmt.Errorf("querying traffic: %w", err)
	}
	return TrafficQueryResult{Items: page.Items, NextCursor: page.NextCursor, IndexComplete: searchIndexComplete(page.Complete)}, nil
}

// searchIndexComplete reports whether every search index job has finished.
func searchIndexComplete(complete map[domain.JobName]bool) bool {
	for _, job := range domain.SearchIndexJobs {
		if !complete[job] {
			return false
		}
	}
	return true
}

// asQueryError reports whether err is marasi's invalid-query error. Wails turns
// Go errors into plain strings, so the binding returns it as data instead.
func asQueryError(err error) (*TrafficQueryError, bool) {
	var queryErr *domain.QueryError
	if !errors.As(err, &queryErr) {
		return nil, false
	}
	return &TrafficQueryError{Message: queryErr.Message, Position: queryErr.Position}, true
}

// QueryMatchCount is how many pairs a query matches, minus the project's
// content-type exclusion. Count stops at domain.MaxTrafficCount, with Capped
// set past it.
type QueryMatchCount struct {
	Count      int
	Capped     bool
	QueryError *TrafficQueryError // nil when the query is valid
}

// CountQueryMatches counts the pairs `query` matches, as QueryTraffic would
// list them. The Ledger's menus show it beside each saved query or term.
func (a *App) CountQueryMatches(query string) (QueryMatchCount, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return QueryMatchCount{}, fmt.Errorf("counting traffic: %w", err)
	}
	exclusion, err := a.GetContentTypeExclusion()
	if err != nil {
		return QueryMatchCount{}, fmt.Errorf("counting traffic: %w", err)
	}
	count, err := traffic.CountTraffic(domain.TrafficCountQuery{Text: query, Exclusion: exclusion})
	if queryErr, ok := asQueryError(err); ok {
		return QueryMatchCount{QueryError: queryErr}, nil
	}
	if err != nil {
		return QueryMatchCount{}, fmt.Errorf("counting traffic: %w", err)
	}
	return QueryMatchCount{Count: count.Count, Capped: count.Capped}, nil
}
