package main

import (
	"errors"
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

// selectionIncomplete starts the error a bulk operation returns when Marasi
// refuses a query selection because a job its query depends on is still
// building: "selection_incomplete (traffic_index, annotation_index)". The
// frontend reads the code and the jobs from the message (Wails passes only
// the text) and offers to try again.
const selectionIncomplete = "selection_incomplete"

// bulk runs one of Marasi's bulk operations and wraps its error with what.
// A refused query selection changes nothing and reads as selectionIncomplete;
// a selection refused for a pending launch reads as launchPending.
func (a *App) bulk(what string, op func() (int, error)) (int, error) {
	n, err := op()
	if err == nil {
		return n, nil
	}
	var incomplete *domain.SelectionIncompleteError
	if errors.As(err, &incomplete) {
		jobs := make([]string, len(incomplete.Jobs))
		for i, job := range incomplete.Jobs {
			jobs[i] = string(job)
		}
		return 0, codedError(what, selectionIncomplete, jobs, err)
	}
	return 0, launchpadError(what, err)
}

// trafficBulk runs op on the project's traffic repository through bulk.
func (a *App) trafficBulk(what string, op func(domain.TrafficRepository) (int, error)) (int, error) {
	return a.bulk(what, func() (int, error) {
		traffic, err := a.Proxy.GetTrafficRepo()
		if err != nil {
			return 0, err
		}
		return op(traffic)
	})
}

// LinkTraffic links every pair in sel to a launchpad, finding or test case,
// and returns how many were newly linked.
func (a *App) LinkTraffic(sel domain.Selection, target TrafficLinkTarget) (int, error) {
	to, err := target.domainTarget()
	if err != nil {
		return 0, fmt.Errorf("linking traffic: %w", err)
	}
	return a.trafficBulk("linking traffic", func(repo domain.TrafficRepository) (int, error) {
		return repo.LinkTraffic(sel, to)
	})
}

// UnlinkTraffic unlinks every pair in sel from a launchpad, finding or test
// case, and returns how many had been linked. Marasi unlinks nothing from a
// launchpad when sel holds a launch pending from it.
func (a *App) UnlinkTraffic(sel domain.Selection, target TrafficLinkTarget) (int, error) {
	from, err := target.domainTarget()
	if err != nil {
		return 0, fmt.Errorf("unlinking traffic: %w", err)
	}
	return a.bulk("unlinking traffic", func() (int, error) {
		return a.Proxy.UnlinkTraffic(sel, from)
	})
}

// AppendNote adds text to every pair's note in sel, after a blank line when
// the pair already has one, and returns how many notes it wrote.
func (a *App) AppendNote(sel domain.Selection, text string) (int, error) {
	return a.trafficBulk("appending a note", func(repo domain.TrafficRepository) (int, error) {
		return repo.AppendNote(sel, text)
	})
}

// ClearNotes deletes the notes of the pairs in sel and returns how many it
// deleted.
func (a *App) ClearNotes(sel domain.Selection) (int, error) {
	return a.trafficBulk("clearing notes", func(repo domain.TrafficRepository) (int, error) {
		return repo.ClearNotes(sel)
	})
}

// DeleteTraffic deletes the pairs in sel from the project, with their notes,
// links, WebSocket messages and logs (marasi ADR-0034), and returns how many
// it deleted. Marasi deletes nothing when sel holds a pending launch.
func (a *App) DeleteTraffic(sel domain.Selection) (int, error) {
	return a.bulk("deleting traffic", func() (int, error) {
		return a.Proxy.DeleteTraffic(sel)
	})
}
