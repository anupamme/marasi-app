package main

import (
	"fmt"
	"log"
	"regexp"
	"slices"
	"strings"

	"go.yaml.in/yaml/v3"
)

// Highlight colours and app-wide highlight labels, persisted in the
// `highlights` section of marasi_appconfig.yaml as a list of 8 entries: entry
// i is highlight number i+1. An empty label means "unset": the frontend then
// falls back to the colour's own name. Project labels override the app label
// and live in the project's client settings (ADR 0004), not here.

const (
	highlightsKey   = "highlights"
	highlightsCount = 8
)

// Highlight is one highlight number's colour (#rrggbb) and app-wide label.
type Highlight struct {
	Color string `json:"color" yaml:"color"`
	Label string `json:"label" yaml:"label,omitempty"`
}

var hexColor = regexp.MustCompile(`^#[0-9a-f]{6}$`)

// defaultHighlights returns the spec's colours with no labels.
func defaultHighlights() []Highlight {
	colors := []string{"#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"}
	out := make([]Highlight, len(colors))
	for i, c := range colors {
		out[i] = Highlight{Color: c}
	}
	return out
}

// normalizeHighlight lowercases the colour and trims the label, and reports
// whether the colour is a valid #rrggbb.
func normalizeHighlight(h Highlight) (Highlight, bool) {
	h.Color = strings.ToLower(strings.TrimSpace(h.Color))
	h.Label = strings.TrimSpace(h.Label)
	return h, hexColor.MatchString(h.Color)
}

// parseHighlights reads the saved section. An unusable section yields the
// defaults; a missing or invalid entry yields that number's default, so one
// bad colour does not discard the researcher's other settings.
func parseHighlights(node *yaml.Node) []Highlight {
	out := defaultHighlights()
	if node == nil {
		return out
	}
	var saved []Highlight
	if err := node.Decode(&saved); err != nil {
		log.Printf("[!] highlights section unusable, using defaults: %v", err)
		return out
	}
	for i := 0; i < len(saved) && i < highlightsCount; i++ {
		if h, ok := normalizeHighlight(saved[i]); ok {
			out[i] = h
		} else {
			log.Printf("[!] highlight %d has invalid colour %q, using the default", i+1, saved[i].Color)
			out[i].Label = h.Label
		}
	}
	return out
}

// GetHighlights returns the 8 highlight colours and app labels, in number order.
func (a *App) GetHighlights() []Highlight {
	a.Config.mu.Lock()
	defer a.Config.mu.Unlock()
	return slices.Clone(a.Config.highlights)
}

// SaveHighlights validates and persists all 8 highlights, then makes them the
// live config. On error the file and the in-memory config are unchanged and
// the current highlights are returned.
func (a *App) SaveHighlights(highlights []Highlight) ([]Highlight, error) {
	cfg := a.Config
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	current := slices.Clone(cfg.highlights)
	if len(highlights) != highlightsCount {
		return current, fmt.Errorf("wanted %d highlights, got %d", highlightsCount, len(highlights))
	}
	next := make([]Highlight, highlightsCount)
	for i, h := range highlights {
		normalized, ok := normalizeHighlight(h)
		if !ok {
			return current, fmt.Errorf("highlight %d: %q is not a #rrggbb colour", i+1, h.Color)
		}
		next[i] = normalized
	}
	if err := writeConfigKeys(cfg.path(), map[string]any{highlightsKey: next}); err != nil {
		return current, fmt.Errorf("saving highlights: %w", err)
	}
	cfg.highlights = next
	return slices.Clone(next), nil
}

// ResetHighlights restores the default colours and clears the app labels.
func (a *App) ResetHighlights() ([]Highlight, error) {
	return a.SaveHighlights(defaultHighlights())
}
