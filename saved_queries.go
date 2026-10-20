package main

import (
	"fmt"
	"log"
	"slices"
	"strings"

	"go.yaml.in/yaml/v3"
)

// App-wide saved queries, persisted in marasi_appconfig.yaml: the
// `saved_queries` list (id, name, query, order) and `hidden_builtin_queries`,
// the ids of the built-in saved queries the researcher hid. The built-ins
// themselves ship with the frontend. Project saved queries are client
// settings in the project (docs/adr/2026-10-16-app-defaults-with-project-overrides.md), not here. Neither key is seeded: a
// missing key means none.

const (
	savedQueriesKey         = "saved_queries"
	hiddenBuiltinQueriesKey = "hidden_builtin_queries"
)

// SavedQuery is one named query. Order sorts a source's queries, lowest first.
type SavedQuery struct {
	ID    string `json:"id" yaml:"id"`
	Name  string `json:"name" yaml:"name"`
	Query string `json:"query" yaml:"query"`
	Order int    `json:"order" yaml:"order"`
}

// AppSavedQueries is the app-wide saved queries, in order, and the hidden
// built-in ids.
type AppSavedQueries struct {
	Queries        []SavedQuery `json:"queries"`
	HiddenBuiltins []string     `json:"hidden_builtins"`
}

// normalizeSavedQuery trims every field and reports whether the entry is
// usable: it has an id, a name and a query.
func normalizeSavedQuery(q SavedQuery) (SavedQuery, error) {
	q.ID = strings.TrimSpace(q.ID)
	q.Name = strings.TrimSpace(q.Name)
	q.Query = strings.TrimSpace(q.Query)
	switch {
	case q.ID == "":
		return q, fmt.Errorf("saved query %q has no id", q.Name)
	case q.Name == "":
		return q, fmt.Errorf("saved query %s has no name", q.ID)
	case q.Query == "":
		return q, fmt.Errorf("saved query %q has no query", q.Name)
	}
	return q, nil
}

func sortSavedQueries(queries []SavedQuery) {
	slices.SortStableFunc(queries, func(a, b SavedQuery) int { return a.Order - b.Order })
}

// parseSavedQueries reads the saved list, skipping unusable and duplicate
// entries so one bad entry does not discard the others.
func parseSavedQueries(node *yaml.Node) []SavedQuery {
	out := []SavedQuery{}
	if node == nil {
		return out
	}
	var saved []SavedQuery
	if err := node.Decode(&saved); err != nil {
		log.Printf("[!] %s section unusable, ignoring it: %v", savedQueriesKey, err)
		return out
	}
	seen := map[string]bool{}
	for _, q := range saved {
		normalized, err := normalizeSavedQuery(q)
		if err != nil || seen[normalized.ID] {
			log.Printf("[!] skipping saved query %+v: unusable or duplicate", q)
			continue
		}
		seen[normalized.ID] = true
		out = append(out, normalized)
	}
	sortSavedQueries(out)
	return out
}

// normalizeHiddenBuiltins trims the ids and drops blanks and duplicates.
func normalizeHiddenBuiltins(ids []string) []string {
	out := []string{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}

func parseHiddenBuiltins(node *yaml.Node) []string {
	if node == nil {
		return []string{}
	}
	var ids []string
	if err := node.Decode(&ids); err != nil {
		log.Printf("[!] %s section unusable, ignoring it: %v", hiddenBuiltinQueriesKey, err)
		return []string{}
	}
	return normalizeHiddenBuiltins(ids)
}

// GetAppSavedQueries returns the app-wide saved queries and hidden built-ins.
func (a *App) GetAppSavedQueries() AppSavedQueries {
	a.Config.mu.Lock()
	defer a.Config.mu.Unlock()
	return AppSavedQueries{
		Queries:        slices.Clone(a.Config.savedQueries),
		HiddenBuiltins: slices.Clone(a.Config.hiddenBuiltinQueries),
	}
}

// SaveAppSavedQueries validates and persists the whole list of app-wide saved
// queries, then makes it the live config and returns it in order. On error
// the file and the in-memory config are unchanged and the current list is
// returned.
func (a *App) SaveAppSavedQueries(queries []SavedQuery) ([]SavedQuery, error) {
	cfg := a.Config
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	current := slices.Clone(cfg.savedQueries)
	next := make([]SavedQuery, 0, len(queries))
	seen := map[string]bool{}
	for _, q := range queries {
		normalized, err := normalizeSavedQuery(q)
		if err != nil {
			return current, err
		}
		if seen[normalized.ID] {
			return current, fmt.Errorf("saved query id %s is used twice", normalized.ID)
		}
		seen[normalized.ID] = true
		next = append(next, normalized)
	}
	sortSavedQueries(next)
	if err := writeConfigKeys(cfg.path(), map[string]any{savedQueriesKey: next}); err != nil {
		return current, fmt.Errorf("saving saved queries: %w", err)
	}
	cfg.savedQueries = next
	return slices.Clone(next), nil
}

// SetHiddenBuiltinQueries persists the ids of the hidden built-in saved
// queries and returns them. On error nothing changes and the current ids are
// returned.
func (a *App) SetHiddenBuiltinQueries(ids []string) ([]string, error) {
	cfg := a.Config
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	next := normalizeHiddenBuiltins(ids)
	if err := writeConfigKeys(cfg.path(), map[string]any{hiddenBuiltinQueriesKey: next}); err != nil {
		return slices.Clone(cfg.hiddenBuiltinQueries), fmt.Errorf("saving hidden built-in queries: %w", err)
	}
	cfg.hiddenBuiltinQueries = next
	return slices.Clone(next), nil
}
