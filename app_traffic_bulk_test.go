package main

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/domain"
)

// querySelection is a ⌘A selection as the frontend sends it: the query, the
// exclusion and as_of, decoded the way Wails decodes it.
func querySelection(t *testing.T, text string, asOf uuid.UUID, exclusion ...string) domain.Selection {
	t.Helper()
	var sel domain.Selection
	body, _ := json.Marshal(map[string]any{"query": text, "exclusion": exclusion, "as_of": asOf})
	if err := json.Unmarshal(body, &sel); err != nil {
		t.Fatalf("decoding selection: %v", err)
	}
	return sel
}

func jsonPair(t *testing.T, app *App, host string) uuid.UUID {
	t.Helper()
	return capturePair(t, app, capturedPair{host: host, path: "/", statusCode: 200, contentType: "application/json"})
}

func launchpadPairIDs(app *App, launchpadID uuid.UUID) []uuid.UUID {
	return itemIDs(app.GetLaunchpadRequests(launchpadID))
}

func findingRequests(t *testing.T, app *App, findingID uuid.UUID) []uuid.UUID {
	t.Helper()
	findings, err := app.ListFindings()
	if err != nil {
		t.Fatalf("listing findings: %v", err)
	}
	for _, finding := range findings {
		if finding.ID == findingID {
			return finding.Requests
		}
	}
	t.Fatalf("finding %s not found", findingID)
	return nil
}

func TestLinkTrafficLinksListedPairsToALaunchpad(t *testing.T) {
	app := newScratchpadApp(t)
	a := jsonPair(t, app, "a.acme.test")
	jsonPair(t, app, "b.acme.test")
	c := jsonPair(t, app, "c.acme.test")
	launchpad := app.CreateLaunchpadEntry("Login", "")

	n, err := app.LinkTraffic(idSelection(t, a, c), TrafficLinkTarget{Kind: "launchpad", ID: launchpad.String()})

	if err != nil || n != 2 {
		t.Fatalf("wanted 2 linked, got %d, %v", n, err)
	}
	got := launchpadPairIDs(app, launchpad)
	if len(got) != 2 || !slices.Contains(got, a) || !slices.Contains(got, c) {
		t.Fatalf("wanted a and c in the launchpad, got %v", got)
	}
}

func TestLinkTrafficLinksAQuerySelectionUpToItsAsOf(t *testing.T) {
	app := newScratchpadApp(t)
	a := jsonPair(t, app, "api.acme.test")
	jsonPair(t, app, "www.acme.test")
	asOf := jsonPair(t, app, "api.acme.test")
	later := jsonPair(t, app, "api.acme.test")
	finding, err := app.CreateDraftFinding(nil, nil)
	if err != nil {
		t.Fatalf("creating finding: %v", err)
	}

	n, err := app.LinkTraffic(querySelection(t, `host = "api.acme.test"`, asOf), TrafficLinkTarget{Kind: "finding", ID: finding.ID.String()})

	if err != nil || n != 2 {
		t.Fatalf("wanted 2 linked, got %d, %v", n, err)
	}
	got := findingRequests(t, app, finding.ID)
	if !slices.Contains(got, a) || !slices.Contains(got, asOf) || slices.Contains(got, later) {
		t.Fatalf("wanted the two matches up to as_of linked, not the later one, got %v", got)
	}
}

func TestLinkTrafficQuerySelectionSkipsExcludedTypes(t *testing.T) {
	app := newScratchpadApp(t)
	json := jsonPair(t, app, "api.acme.test")
	html := capturePair(t, app, capturedPair{host: "api.acme.test", path: "/", statusCode: 200, contentType: "text/html"})
	testCase, err := app.CreateDraftTestCase(nil)
	if err != nil {
		t.Fatalf("creating test case: %v", err)
	}

	n, err := app.LinkTraffic(querySelection(t, "", html, "text/html"), TrafficLinkTarget{Kind: "test_case", ID: testCase.ID.String()})

	if err != nil || n != 1 {
		t.Fatalf("wanted 1 linked, got %d, %v", n, err)
	}
	if got := countTraffic(t, app, `test_case = "`+testCase.ID.String()+`"`, "").Count; got != 1 {
		t.Fatalf("wanted only %s linked, got %d linked", json, got)
	}
}

func TestUnlinkTrafficRemovesPairsFromALaunchpad(t *testing.T) {
	app := newScratchpadApp(t)
	a := jsonPair(t, app, "a.acme.test")
	b := jsonPair(t, app, "b.acme.test")
	launchpad := app.CreateLaunchpadEntry("Login", "")
	app.LinkRequestToLaunchpad(a, launchpad)
	app.LinkRequestToLaunchpad(b, launchpad)

	n, err := app.UnlinkTraffic(idSelection(t, a), TrafficLinkTarget{Kind: "launchpad", ID: launchpad.String()})

	if err != nil || n != 1 {
		t.Fatalf("wanted 1 unlinked, got %d, %v", n, err)
	}
	if got := launchpadPairIDs(app, launchpad); len(got) != 1 || got[0] != b {
		t.Fatalf("wanted only b left in the launchpad, got %v", got)
	}
}

func TestLinkTrafficRejectsAnUnknownKind(t *testing.T) {
	app := newScratchpadApp(t)
	a := jsonPair(t, app, "a.acme.test")

	if _, err := app.LinkTraffic(idSelection(t, a), TrafficLinkTarget{Kind: "armory", ID: uuid.NewString()}); err == nil {
		t.Fatal("wanted an error for an unknown link kind")
	}
}

func TestBulkOpsRejectAnEmptySelection(t *testing.T) {
	app := newScratchpadApp(t)
	jsonPair(t, app, "a.acme.test")

	if _, err := app.ClearNotes(domain.Selection{}); err == nil {
		t.Fatal("wanted an error for an empty selection")
	}
}

func TestAppendNoteAddsAParagraphAfterAnExistingNote(t *testing.T) {
	app := newScratchpadApp(t)
	noted := jsonPair(t, app, "a.acme.test")
	bare := jsonPair(t, app, "b.acme.test")
	if err := app.UpdateNote(noted, "first"); err != nil {
		t.Fatalf("writing note: %v", err)
	}

	n, err := app.AppendNote(idSelection(t, noted, bare), "second")

	if err != nil || n != 2 {
		t.Fatalf("wanted 2 notes written, got %d, %v", n, err)
	}
	if got := app.GetNote(noted); got != "first\n\nsecond" {
		t.Fatalf("wanted the note appended after a blank line, got %q", got)
	}
	if got := app.GetNote(bare); got != "second" {
		t.Fatalf("wanted a new note, got %q", got)
	}
}

func TestClearNotesDeletesTheSelectionsNotes(t *testing.T) {
	app := newScratchpadApp(t)
	a := jsonPair(t, app, "a.acme.test")
	b := jsonPair(t, app, "b.acme.test")
	c := jsonPair(t, app, "c.acme.test")
	for _, id := range []uuid.UUID{a, b, c} {
		if err := app.UpdateNote(id, "note"); err != nil {
			t.Fatalf("writing note: %v", err)
		}
	}

	n, err := app.ClearNotes(querySelection(t, "", b))

	if err != nil || n != 2 {
		t.Fatalf("wanted 2 notes cleared, got %d, %v", n, err)
	}
	if app.GetNote(a) != "" || app.GetNote(b) != "" || app.GetNote(c) != "note" {
		t.Fatalf("wanted a and b cleared and c kept, got %q %q %q", app.GetNote(a), app.GetNote(b), app.GetNote(c))
	}
}

func TestDeleteTrafficDeletesTheSelection(t *testing.T) {
	app := newScratchpadApp(t)
	a := jsonPair(t, app, "a.acme.test")
	jsonPair(t, app, "b.acme.test")
	c := jsonPair(t, app, "c.acme.test")

	n, err := app.DeleteTraffic(idSelection(t, a, c))

	if err != nil || n != 2 {
		t.Fatalf("wanted 2 deleted, got %d, %v", n, err)
	}
	if got := countTraffic(t, app, "", "").Count; got != 1 {
		t.Fatalf("wanted 1 pair left, got %d", got)
	}
}

func TestDeleteTrafficReportsAnInvalidQuery(t *testing.T) {
	app := newScratchpadApp(t)
	a := jsonPair(t, app, "a.acme.test")

	if _, err := app.DeleteTraffic(querySelection(t, "host = ", a)); err == nil {
		t.Fatal("wanted an error for an invalid query")
	}
	if got := countTraffic(t, app, "", "").Count; got != 1 {
		t.Fatalf("wanted nothing deleted, got %d left", got)
	}
}

func TestBulkOpsReportAQuerySelectionRefusedWhileTheIndexBuilds(t *testing.T) {
	app := newLegacyTrafficApp(t)
	asOf, err := uuid.NewV7()
	if err != nil {
		t.Fatalf("creating as_of: %v", err)
	}

	n, err := app.SetHighlight(querySelection(t, `"acme"`, asOf), 3)

	if n != 0 || !errors.Is(err, domain.ErrSelectionIncomplete) {
		t.Fatalf("wanted ErrSelectionIncomplete and nothing changed, got %d, %v", n, err)
	}
	if !strings.Contains(err.Error(), "selection_incomplete (traffic_index") {
		t.Fatalf("wanted the selection_incomplete code and its jobs in %q", err)
	}
	if _, err := app.SetHighlight(querySelection(t, `host = "api.acme.test"`, asOf), 3); err != nil {
		t.Fatalf("a query without a text term still applies while the index builds: %v", err)
	}
}
