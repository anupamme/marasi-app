package main

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/db"
	"github.com/tfkr-ae/marasi/domain"
)

// LaunchpadSearchResult lists, per launchpad id, the entries a traffic query
// matched, oldest first. Launchpads without matches are absent.
type LaunchpadSearchResult struct {
	EntriesByLaunchpad map[string][]uuid.UUID
	QueryError         *TrafficQueryError // nil when the query is valid
}

// SearchLaunchpadEntries runs a traffic query over every launchpad's entries.
// One query over all launchpad members (launchpad:*) validates it and, for
// the usual keystroke that matches nothing, answers without touching each
// launchpad. Otherwise each launchpad runs the query scoped to its own
// membership, so a pair maps to every launchpad that holds it, linked
// originals included (they carry no launchpad_id metadata).
func (a *App) SearchLaunchpadEntries(query string) (LaunchpadSearchResult, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return LaunchpadSearchResult{}, fmt.Errorf("searching launchpads: %w", err)
	}
	if a.Proxy.LaunchpadRepo == nil {
		return LaunchpadSearchResult{}, errors.New("searching launchpads: no project is open")
	}
	result := LaunchpadSearchResult{EntriesByLaunchpad: map[string][]uuid.UUID{}}
	// Validate the researcher's text on its own, so error positions refer to
	// what they typed and unbalanced parentheses can't pair up with the ones
	// added around it below.
	if queryErr, ok := asQueryError(db.ValidateTrafficQuery(query, nil, "")); ok {
		result.QueryError = queryErr
		return result, nil
	}
	page, err := traffic.ListTraffic(domain.TrafficQuery{Text: "launchpad:* AND (" + query + ")", Limit: 1})
	if queryErr, ok := asQueryError(err); ok {
		result.QueryError = queryErr
		return result, nil
	}
	if err != nil {
		return LaunchpadSearchResult{}, fmt.Errorf("searching launchpads: %w", err)
	}
	if len(page.Items) == 0 {
		return result, nil
	}
	launchpads, err := a.Proxy.LaunchpadRepo.GetLaunchpads()
	if err != nil {
		return LaunchpadSearchResult{}, fmt.Errorf("listing launchpads: %w", err)
	}
	for _, launchpad := range launchpads {
		entries, _, err := a.Proxy.LaunchpadRepo.GetLaunchpadRequests(launchpad.ID, query, nil, "")
		if queryErr, ok := asQueryError(err); ok {
			return LaunchpadSearchResult{QueryError: queryErr}, nil
		}
		if err != nil {
			return LaunchpadSearchResult{}, fmt.Errorf("searching launchpad %s: %w", launchpad.ID, err)
		}
		if len(entries) == 0 {
			continue
		}
		ids := make([]uuid.UUID, 0, len(entries))
		for _, entry := range entries {
			ids = append(ids, entry.ID)
		}
		result.EntriesByLaunchpad[launchpad.ID.String()] = ids
	}
	return result, nil
}
