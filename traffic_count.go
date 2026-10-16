package main

import (
	"fmt"

	"github.com/tfkr-ae/marasi/domain"
)

// TrafficCountResult is how many pairs a query matches, up to marasi's cap.
type TrafficCountResult struct {
	Count         int  // at most domain.MaxTrafficCount
	Capped        bool // more than domain.MaxTrafficCount pairs matched
	IndexComplete bool
	QueryError    *TrafficQueryError // nil when the query is valid
}

// TrafficCountOptions narrows or widens what CountTraffic counts.
type TrafficCountOptions struct {
	// AsOf is "" to count up to the newest pair, else a page's AsOf: only
	// pairs up to it count, the matches in that set of results.
	AsOf string
	// IgnoreExclusion counts the pairs the content-type exclusion hides too.
	IgnoreExclusion bool
}

// CountTraffic counts the pairs the researcher's query matches, minus the
// project's content-type exclusion. after is "" to count every match, else a
// pair id: only pairs captured after it count, such as the new matches since
// a page's as_of. options can bound the count by as_of or ignore the
// exclusion.
func (a *App) CountTraffic(query string, after string, options TrafficCountOptions) (TrafficCountResult, error) {
	q := domain.TrafficCountQuery{Text: query}
	var err error
	if q.After, err = parseOptionalPairID("after", after); err != nil {
		return TrafficCountResult{}, fmt.Errorf("counting traffic: %w", err)
	}
	if q.AsOf, err = parseOptionalPairID("as_of", options.AsOf); err != nil {
		return TrafficCountResult{}, fmt.Errorf("counting traffic: %w", err)
	}
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return TrafficCountResult{}, fmt.Errorf("counting traffic: %w", err)
	}
	if !options.IgnoreExclusion {
		q.Exclusion, err = a.GetContentTypeExclusion()
		if err != nil {
			return TrafficCountResult{}, fmt.Errorf("counting traffic: %w", err)
		}
	}
	count, err := traffic.CountTraffic(q)
	if queryErr, ok := asQueryError(err); ok {
		return TrafficCountResult{QueryError: queryErr}, nil
	}
	if err != nil {
		return TrafficCountResult{}, fmt.Errorf("counting traffic: %w", err)
	}
	return TrafficCountResult{Count: count.Count, Capped: count.Capped, IndexComplete: searchIndexComplete(count.Complete)}, nil
}
