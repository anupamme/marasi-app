package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/domain"
)

// Codes that start the error of a launchpad change Marasi refuses because the
// frontend's view of the launchpads is stale: "moving launchpad entries:
// invalid_placement: ...". The frontend reads the code from the message
// (Wails passes only the text), says why, and refreshes the launchpads.
//
// A change that would take a pending launch's pair out of its launchpad,
// delete it, or delete its launchpad (marasi ADR-0053) reads as
// launchPending with the pending pairs: "launch_pending (<uuid>, <uuid>)".
const launchPending = "launch_pending"

var launchpadRefusals = []struct {
	err  error
	code string
}{
	{domain.ErrInvalidPlacement, "invalid_placement"},
	{domain.ErrLaunchpadAlreadyLinked, "already_linked"},
	{domain.ErrLaunchpadNotLinked, "not_linked"},
}

// launchpadError wraps err with what, and with its code when it is one of
// launchpadRefusals or a launch pending.
func launchpadError(what string, err error) error {
	var pending *domain.LaunchPendingError
	if errors.As(err, &pending) {
		ids := make([]string, len(pending.IDs))
		for i, id := range pending.IDs {
			ids[i] = id.String()
		}
		return fmt.Errorf("%s: %s (%s): %w", what, launchPending, strings.Join(ids, ", "), err)
	}
	for _, refusal := range launchpadRefusals {
		if errors.Is(err, refusal.err) {
			return fmt.Errorf("%s: %s: %w", what, refusal.code, err)
		}
	}
	return fmt.Errorf("%s: %w", what, err)
}

// MoveLaunchpadEntries moves the entries requestIDs of the launchpad
// sourceID to the launchpad targetID, which may be the source, and returns
// the moved pair ids in their new entry order. The moved entries keep their
// order relative to each other and go before the target's entry before, or
// after its last entry when before is "". Marasi moves all of them or none.
func (a *App) MoveLaunchpadEntries(sourceID, targetID uuid.UUID, requestIDs []uuid.UUID, before string) ([]uuid.UUID, error) {
	move := domain.LaunchpadMove{SourceID: sourceID, TargetID: targetID, RequestIDs: requestIDs}
	if before != "" {
		id, err := uuid.Parse(before)
		if err != nil {
			return nil, fmt.Errorf("moving launchpad entries: before %q: %w", before, err)
		}
		move.BeforeID = id
	}
	moved, err := a.Proxy.MoveLaunchpadEntries(move)
	if err != nil {
		return nil, launchpadError("moving launchpad entries", err)
	}
	return moved, nil
}
