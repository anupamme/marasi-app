package main

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/tfkr-ae/marasi/domain"
)

// Highlights on pairs (marasi ADR-0035): a number from 1 to 8 per pair,
// written in bulk on a selection. The old context menu stored a hex colour in
// metadata.highlight instead; MigrateOldHighlights moves those to numbers
// once per project.

// highlightsMigratedKey is the app's project setting that records that the
// project's old highlights were migrated.
const highlightsMigratedKey = "ledger.highlight_migrated"

// oldHighlights maps each colour the old context menu wrote to the highlight
// number it becomes. Any other value is dropped.
var oldHighlights = []struct {
	hex    string
	number int
}{
	{"#EF4444", 1},
	{"#EAB308", 3},
	{"#22C55E", 4},
	{"#3B82F6", 6},
	{"#A855F7", 7},
}

// HighlightMigration reports what MigrateOldHighlights did. Ran is false when
// the project was already migrated.
type HighlightMigration struct {
	Ran         bool
	Highlighted int // pairs given a highlight number
	Cleared     int // pairs whose metadata.highlight was removed
}

// SetHighlight gives every pair in sel the highlight (1-8) and returns how
// many pairs changed. marasi publishes no event for it: the caller refreshes
// its own view.
func (a *App) SetHighlight(sel domain.Selection, highlight int) (int, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return 0, fmt.Errorf("setting highlight: %w", err)
	}
	changed, err := traffic.SetHighlight(sel, highlight)
	if err != nil {
		return 0, fmt.Errorf("setting highlight %d: %w", highlight, err)
	}
	return changed, nil
}

// ClearHighlight removes the highlight of every pair in sel and returns how
// many pairs had one.
func (a *App) ClearHighlight(sel domain.Selection) (int, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return 0, fmt.Errorf("clearing highlights: %w", err)
	}
	cleared, err := traffic.ClearHighlight(sel)
	if err != nil {
		return 0, fmt.Errorf("clearing highlights: %w", err)
	}
	return cleared, nil
}

// MigrateOldHighlights turns the project's old hex highlights into highlight
// numbers, then removes metadata.highlight from every pair, and records that
// the project is migrated. A pair that already has a number keeps it. Each
// step can run again, so an interrupted migration resumes on the next call.
func (a *App) MigrateOldHighlights() (HighlightMigration, error) {
	config, err := a.configRepo()
	if err != nil {
		return HighlightMigration{}, err
	}
	_, err = config.GetClientSetting(appClient, highlightsMigratedKey)
	if err == nil {
		return HighlightMigration{}, nil
	}
	if !errors.Is(err, domain.ErrClientSettingNotFound) {
		return HighlightMigration{}, fmt.Errorf("reading %s: %w", highlightsMigratedKey, err)
	}
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return HighlightMigration{}, fmt.Errorf("migrating old highlights: %w", err)
	}

	result := HighlightMigration{Ran: true}
	// The selections stop at the newest pair now; pairs captured later
	// never carry an old highlight.
	page, err := traffic.ListTraffic(domain.TrafficQuery{Limit: 1})
	if err != nil {
		return HighlightMigration{}, fmt.Errorf("migrating old highlights: finding the newest pair: %w", err)
	}
	if page.AsOf != nil {
		selection := func(text string) domain.Selection {
			return domain.Selection{Query: &domain.SelectionQuery{Text: text, AsOf: *page.AsOf}}
		}
		for _, old := range oldHighlights {
			text := fmt.Sprintf("metadata.highlight = %q AND NOT highlight:*", old.hex)
			changed, err := traffic.SetHighlight(selection(text), old.number)
			if err != nil {
				return HighlightMigration{}, fmt.Errorf("migrating old highlight %s: %w", old.hex, err)
			}
			result.Highlighted += changed
		}
		result.Cleared, err = traffic.ClearMetadataKey(selection("metadata.highlight:*"), "highlight")
		if err != nil {
			return HighlightMigration{}, fmt.Errorf("clearing old highlights: %w", err)
		}
	}
	if _, err := config.SetClientSetting(appClient, highlightsMigratedKey, json.RawMessage("true")); err != nil {
		return HighlightMigration{}, fmt.Errorf("storing %s: %w", highlightsMigratedKey, err)
	}
	return result, nil
}
