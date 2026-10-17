package main

import (
	"context"
	"log"
	"sync"
	"time"
)

// Automatic checks: while they are on, the app checks for an update at
// startup and every updateCheckInterval after, without interrupting the
// researcher. A failed automatic check is logged, never shown.

// updateCheckInterval is how often a running app checks again.
const updateCheckInterval = 6 * time.Hour

// updateScheduler runs the automatic checks. Its zero value is stopped.
type updateScheduler struct {
	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}
}

// startUpdateChecks starts the automatic checks under ctx. Startup calls it;
// it returns at once.
func (a *App) startUpdateChecks(ctx context.Context) {
	s := &a.updateSchedule
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		return
	}
	ctx, s.cancel = context.WithCancel(ctx)
	s.done = make(chan struct{})
	go func(done chan struct{}) {
		defer close(done)
		a.automaticCheck(ctx)
		ticks, stopTicks := a.newUpdateTicker(updateCheckInterval)
		defer stopTicks()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticks:
				a.automaticCheck(ctx)
			}
		}
	}(s.done)
}

// stopUpdateChecks stops the automatic checks and waits for a running one to
// end. Shutdown calls it.
func (a *App) stopUpdateChecks() {
	s := &a.updateSchedule
	s.mu.Lock()
	cancel, done := s.cancel, s.done
	s.cancel, s.done = nil, nil
	s.mu.Unlock()
	if cancel == nil {
		return
	}
	cancel()
	<-done
}

// newUpdateTicker returns the ticks automatic checks follow and a func that
// stops them. Tests replace it through App.updateTicker.
func (a *App) newUpdateTicker(interval time.Duration) (<-chan time.Time, func()) {
	if a.updateTicker != nil {
		return a.updateTicker(interval)
	}
	ticker := time.NewTicker(interval)
	return ticker.C, ticker.Stop
}

// automaticCheck runs one automatic check. Its failure is logged only.
func (a *App) automaticCheck(ctx context.Context) {
	if !a.automaticChecksOn() {
		return
	}
	check := a.checkForUpdate(ctx, checkAutomatic)
	if check.Outcome == UpdateOutcomeFailed && ctx.Err() == nil {
		log.Printf("[!] automatic check for an update on the %s channel failed: %s", check.Channel, check.Reason)
	}
}
