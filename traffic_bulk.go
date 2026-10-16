package main

import (
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/domain"
)

// TrafficSelection is the pairs a Ledger bulk action applies to, in
// Marasi's selection shape (ADR-0033): either the listed pair ids, or every
// pair matching a query, minus an exclusion, up to as_of. Set IDs, or Query
// with AsOf; Query "" selects the whole live view.
type TrafficSelection struct {
	IDs       []string `json:"ids,omitempty"`
	Query     *string  `json:"query,omitempty"`
	Exclusion []string `json:"exclusion,omitempty"`
	AsOf      string   `json:"as_of,omitempty"`
}

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

// domainSelection checks sel the way Marasi's JSON decoding does: exactly
// one shape, ids within the limit, as_of present and the exclusion
// normalised.
func (sel TrafficSelection) domainSelection() (domain.Selection, error) {
	data, err := json.Marshal(sel)
	if err != nil {
		return domain.Selection{}, err
	}
	var out domain.Selection
	if err := json.Unmarshal(data, &out); err != nil {
		return domain.Selection{}, err
	}
	return out, nil
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

// bulk runs one of Marasi's bulk operations on sel and returns how many pairs
// it changed. Marasi emits no event for an in-process bulk change, so the
// frontend refreshes its own views.
func (a *App) bulk(what string, sel TrafficSelection, op func(domain.TrafficRepository, domain.Selection) (int, error)) (int, error) {
	selection, err := sel.domainSelection()
	if err != nil {
		return 0, fmt.Errorf("%s: %w", what, err)
	}
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return 0, fmt.Errorf("%s: %w", what, err)
	}
	n, err := op(traffic, selection)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", what, err)
	}
	return n, nil
}

// LinkTraffic links every pair in sel to a launchpad, finding or test case,
// and returns how many were newly linked.
func (a *App) LinkTraffic(sel TrafficSelection, target TrafficLinkTarget) (int, error) {
	to, err := target.domainTarget()
	if err != nil {
		return 0, fmt.Errorf("linking traffic: %w", err)
	}
	return a.bulk("linking traffic", sel, func(repo domain.TrafficRepository, s domain.Selection) (int, error) {
		return repo.LinkTraffic(s, to)
	})
}

// UnlinkTraffic unlinks every pair in sel from a launchpad, finding or test
// case, and returns how many had been linked.
func (a *App) UnlinkTraffic(sel TrafficSelection, target TrafficLinkTarget) (int, error) {
	from, err := target.domainTarget()
	if err != nil {
		return 0, fmt.Errorf("unlinking traffic: %w", err)
	}
	return a.bulk("unlinking traffic", sel, func(repo domain.TrafficRepository, s domain.Selection) (int, error) {
		return repo.UnlinkTraffic(s, from)
	})
}

// AppendNote adds text to every pair's note in sel, after a blank line when
// the pair already has one, and returns how many notes it wrote.
func (a *App) AppendNote(sel TrafficSelection, text string) (int, error) {
	return a.bulk("appending a note", sel, func(repo domain.TrafficRepository, s domain.Selection) (int, error) {
		return repo.AppendNote(s, text)
	})
}

// ClearNotes deletes the notes of the pairs in sel and returns how many it
// deleted.
func (a *App) ClearNotes(sel TrafficSelection) (int, error) {
	return a.bulk("clearing notes", sel, domain.TrafficRepository.ClearNotes)
}

// DeleteTraffic deletes the pairs in sel from the project, with their notes,
// links, WebSocket messages and logs (Marasi ADR-0034), and returns how many
// it deleted.
func (a *App) DeleteTraffic(sel TrafficSelection) (int, error) {
	return a.bulk("deleting traffic", sel, domain.TrafficRepository.DeleteTraffic)
}
