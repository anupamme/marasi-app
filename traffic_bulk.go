package main

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/domain"
)

// Bulk changes on a Ledger selection (marasi ADR-0033): the frontend sends
// the selection in Marasi's JSON shape, {"ids": [...]} or {"query": "...",
// "exclusion": [...], "as_of": "<uuid>"}, which domain.Selection decodes and
// checks. Each operation runs in one transaction and returns how many pairs
// it changed. Marasi emits no event for an in-process bulk change, so the
// frontend refreshes its own views.

// TrafficLinkTarget is what a bulk link joins pairs to: Kind is "launchpad",
// "finding" or "test_case", ID its id.
type TrafficLinkTarget struct {
	Kind string
	ID   string
}

var linkKinds = map[string]domain.LinkKind{
	"launchpad": domain.LinkLaunchpad,
	"finding":   domain.LinkFinding,
	"test_case": domain.LinkTestCase,
}

func (target TrafficLinkTarget) domainTarget() (domain.LinkTarget, error) {
	kind, ok := linkKinds[target.Kind]
	if !ok {
		return domain.LinkTarget{}, fmt.Errorf("unknown link kind %q", target.Kind)
	}
	id, err := uuid.Parse(target.ID)
	if err != nil {
		return domain.LinkTarget{}, fmt.Errorf("%s id %q: %w", target.Kind, target.ID, err)
	}
	return domain.LinkTarget{Kind: kind, ID: id}, nil
}

// bulk runs one of Marasi's bulk operations and wraps its error with what.
func (a *App) bulk(what string, op func(domain.TrafficRepository) (int, error)) (int, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return 0, fmt.Errorf("%s: %w", what, err)
	}
	n, err := op(traffic)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", what, err)
	}
	return n, nil
}

// LinkTraffic links every pair in sel to a launchpad, finding or test case,
// and returns how many were newly linked.
func (a *App) LinkTraffic(sel domain.Selection, target TrafficLinkTarget) (int, error) {
	to, err := target.domainTarget()
	if err != nil {
		return 0, fmt.Errorf("linking traffic: %w", err)
	}
	return a.bulk("linking traffic", func(repo domain.TrafficRepository) (int, error) {
		return repo.LinkTraffic(sel, to)
	})
}

// UnlinkTraffic unlinks every pair in sel from a launchpad, finding or test
// case, and returns how many had been linked.
func (a *App) UnlinkTraffic(sel domain.Selection, target TrafficLinkTarget) (int, error) {
	from, err := target.domainTarget()
	if err != nil {
		return 0, fmt.Errorf("unlinking traffic: %w", err)
	}
	return a.bulk("unlinking traffic", func(repo domain.TrafficRepository) (int, error) {
		return repo.UnlinkTraffic(sel, from)
	})
}

// AppendNote adds text to every pair's note in sel, after a blank line when
// the pair already has one, and returns how many notes it wrote.
func (a *App) AppendNote(sel domain.Selection, text string) (int, error) {
	return a.bulk("appending a note", func(repo domain.TrafficRepository) (int, error) {
		return repo.AppendNote(sel, text)
	})
}

// ClearNotes deletes the notes of the pairs in sel and returns how many it
// deleted.
func (a *App) ClearNotes(sel domain.Selection) (int, error) {
	return a.bulk("clearing notes", func(repo domain.TrafficRepository) (int, error) {
		return repo.ClearNotes(sel)
	})
}

// DeleteTraffic deletes the pairs in sel from the project, with their notes,
// links, WebSocket messages and logs (marasi ADR-0034), and returns how many
// it deleted.
func (a *App) DeleteTraffic(sel domain.Selection) (int, error) {
	return a.bulk("deleting traffic", func(repo domain.TrafficRepository) (int, error) {
		return repo.DeleteTraffic(sel)
	})
}
