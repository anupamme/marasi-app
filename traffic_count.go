package main

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/domain"
)

// TrafficCountResult is how many pairs a query matches, up to marasi's cap.
type TrafficCountResult struct {
	Count         int  // at most domain.MaxTrafficCount
	Capped        bool // more than domain.MaxTrafficCount pairs matched
	IndexComplete bool
	QueryError    *TrafficQueryError // nil when the query is valid
}

// CountTraffic counts the pairs the researcher's query matches, minus the
// project's content-type exclusion. after is "" to count every match, else a
// pair id: only pairs captured after it count, such as the new matches since
// a page's as_of.
func (a *App) CountTraffic(query string, after string) (TrafficCountResult, error) {
	q := domain.TrafficCountQuery{Text: query}
	if after != "" {
		id, err := uuid.Parse(after)
		if err != nil {
			return TrafficCountResult{}, fmt.Errorf("counting traffic: after: %w", err)
		}
		q.After = &id
	}
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return TrafficCountResult{}, fmt.Errorf("counting traffic: %w", err)
	}
	q.Exclusion, err = a.GetContentTypeExclusion()
	if err != nil {
		return TrafficCountResult{}, fmt.Errorf("counting traffic: %w", err)
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
