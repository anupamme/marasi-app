package main

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/domain"
)

func highlightOf(t *testing.T, app *App, id uuid.UUID) *int {
	t.Helper()
	row, err := app.Proxy.TrafficRepo.GetRequestResponseRow(id)
	if err != nil {
		t.Fatalf("reading pair %s: %v", id, err)
	}
	return row.Highlight
}

func idSelection(t *testing.T, ids ...uuid.UUID) domain.Selection {
	t.Helper()
	var sel domain.Selection
	body, _ := json.Marshal(map[string]any{"ids": ids})
	if err := json.Unmarshal(body, &sel); err != nil {
		t.Fatalf("decoding selection: %v", err)
	}
	return sel
}

func setOldHighlight(t *testing.T, app *App, id uuid.UUID, value string) {
	t.Helper()
	metadata, err := app.Proxy.TrafficRepo.GetMetadata(id)
	if err != nil {
		t.Fatalf("reading metadata: %v", err)
	}
	metadata["highlight"] = value
	if err := app.Proxy.TrafficRepo.UpdateMetadata(metadata, id); err != nil {
		t.Fatalf("writing metadata: %v", err)
	}
}

func TestSetHighlightReportsHowManyPairsChanged(t *testing.T) {
	app := newScratchpadApp(t)
	a := capturePair(t, app, capturedPair{host: "a.test", path: "/a", statusCode: 200})
	b := capturePair(t, app, capturedPair{host: "a.test", path: "/b", statusCode: 200})
	other := capturePair(t, app, capturedPair{host: "a.test", path: "/c", statusCode: 200})

	changed, err := app.SetHighlight(idSelection(t, a, b), 3)
	if err != nil {
		t.Fatalf("setting highlight: %v", err)
	}
	if changed != 2 {
		t.Fatalf("wanted 2 pairs changed, got %d", changed)
	}
	if h := highlightOf(t, app, a); h == nil || *h != 3 {
		t.Fatalf("wanted pair a highlighted 3, got %v", h)
	}
	if h := highlightOf(t, app, other); h != nil {
		t.Fatalf("wanted the unselected pair left alone, got %d", *h)
	}

	again, err := app.SetHighlight(idSelection(t, a, b), 3)
	if err != nil || again != 0 {
		t.Fatalf("wanted no change on repeat, got %d, %v", again, err)
	}
}

func TestClearHighlightReportsHowManyPairsHadOne(t *testing.T) {
	app := newScratchpadApp(t)
	a := capturePair(t, app, capturedPair{host: "a.test", path: "/a", statusCode: 200})
	b := capturePair(t, app, capturedPair{host: "a.test", path: "/b", statusCode: 200})
	if _, err := app.SetHighlight(idSelection(t, a), 5); err != nil {
		t.Fatalf("setting highlight: %v", err)
	}

	cleared, err := app.ClearHighlight(idSelection(t, a, b))
	if err != nil {
		t.Fatalf("clearing highlight: %v", err)
	}
	if cleared != 1 {
		t.Fatalf("wanted 1 pair cleared, got %d", cleared)
	}
	if h := highlightOf(t, app, a); h != nil {
		t.Fatalf("wanted no highlight, got %d", *h)
	}
}

func TestSetHighlightRejectsANumberOutsideOneToEight(t *testing.T) {
	app := newScratchpadApp(t)
	a := capturePair(t, app, capturedPair{host: "a.test", path: "/a", statusCode: 200})
	if _, err := app.SetHighlight(idSelection(t, a), 9); err == nil {
		t.Fatal("wanted an error for highlight 9")
	}
}

func TestMigrateOldHighlightsMapsColoursAndClearsMetadata(t *testing.T) {
	app := newScratchpadApp(t)
	red := capturePair(t, app, capturedPair{host: "a.test", path: "/red", statusCode: 200})
	yellow := capturePair(t, app, capturedPair{host: "a.test", path: "/yellow", statusCode: 200})
	green := capturePair(t, app, capturedPair{host: "a.test", path: "/green", statusCode: 200})
	blue := capturePair(t, app, capturedPair{host: "a.test", path: "/blue", statusCode: 200})
	purple := capturePair(t, app, capturedPair{host: "a.test", path: "/purple", statusCode: 200})
	odd := capturePair(t, app, capturedPair{host: "a.test", path: "/odd", statusCode: 200})
	plain := capturePair(t, app, capturedPair{host: "a.test", path: "/plain", statusCode: 200})
	setOldHighlight(t, app, red, "#EF4444")
	setOldHighlight(t, app, yellow, "#EAB308")
	setOldHighlight(t, app, green, "#22C55E")
	setOldHighlight(t, app, blue, "#3B82F6")
	setOldHighlight(t, app, purple, "#A855F7")
	setOldHighlight(t, app, odd, "#123456")

	result, err := app.MigrateOldHighlights()
	if err != nil {
		t.Fatalf("migrating: %v", err)
	}
	if !result.Ran || result.Highlighted != 5 || result.Cleared != 6 {
		t.Fatalf("wanted a run that highlighted 5 and cleared 6, got %+v", result)
	}
	want := map[uuid.UUID]int{red: 1, yellow: 3, green: 4, blue: 6, purple: 7}
	for id, n := range want {
		if h := highlightOf(t, app, id); h == nil || *h != n {
			t.Errorf("pair %s: wanted highlight %d, got %v", id, n, h)
		}
	}
	for _, id := range []uuid.UUID{odd, plain} {
		if h := highlightOf(t, app, id); h != nil {
			t.Errorf("pair %s: wanted no highlight, got %d", id, *h)
		}
	}
	for _, id := range []uuid.UUID{red, odd} {
		metadata, err := app.Proxy.TrafficRepo.GetMetadata(id)
		if err != nil {
			t.Fatalf("reading metadata: %v", err)
		}
		if _, ok := metadata["highlight"]; ok {
			t.Errorf("pair %s: wanted metadata.highlight gone, got %v", id, metadata["highlight"])
		}
	}
	flag, err := app.GetClientSetting(highlightsMigratedKey)
	if err != nil || flag == nil {
		t.Fatalf("wanted the migrated flag set, got %v, %v", flag, err)
	}
}

func TestMigrateOldHighlightsKeepsANewerHighlight(t *testing.T) {
	app := newScratchpadApp(t)
	id := capturePair(t, app, capturedPair{host: "a.test", path: "/a", statusCode: 200})
	setOldHighlight(t, app, id, "#EF4444")
	if _, err := app.SetHighlight(idSelection(t, id), 8); err != nil {
		t.Fatalf("setting highlight: %v", err)
	}

	if _, err := app.MigrateOldHighlights(); err != nil {
		t.Fatalf("migrating: %v", err)
	}
	if h := highlightOf(t, app, id); h == nil || *h != 8 {
		t.Fatalf("wanted the newer highlight 8 kept, got %v", h)
	}
}

func TestMigrateOldHighlightsRunsOncePerProject(t *testing.T) {
	app := newScratchpadApp(t)
	id := capturePair(t, app, capturedPair{host: "a.test", path: "/a", statusCode: 200})
	if _, err := app.MigrateOldHighlights(); err != nil {
		t.Fatalf("migrating: %v", err)
	}
	setOldHighlight(t, app, id, "#EF4444")

	result, err := app.MigrateOldHighlights()
	if err != nil {
		t.Fatalf("migrating again: %v", err)
	}
	if result.Ran {
		t.Fatalf("wanted no second run, got %+v", result)
	}
	if h := highlightOf(t, app, id); h != nil {
		t.Fatalf("wanted the pair left alone, got %d", *h)
	}
}

func TestMigrateOldHighlightsOnAnEmptyProjectSetsTheFlag(t *testing.T) {
	app := newScratchpadApp(t)
	result, err := app.MigrateOldHighlights()
	if err != nil {
		t.Fatalf("migrating: %v", err)
	}
	if !result.Ran || result.Highlighted != 0 || result.Cleared != 0 {
		t.Fatalf("wanted an empty run, got %+v", result)
	}
	if flag, _ := app.GetClientSetting(highlightsMigratedKey); flag == nil {
		t.Fatal("wanted the migrated flag set")
	}
}
