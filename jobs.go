package main

import (
	"errors"
	"fmt"

	"github.com/tfkr-ae/marasi/domain"
)

// rebuildableJobs are the background jobs Settings → Maintenance can rebuild.
// Marasi refuses the others.
var rebuildableJobs = map[domain.JobName]bool{
	domain.JobTrafficIndex:    true,
	domain.JobAnnotationIndex: true,
	domain.JobSitemap:         true,
}

// JobState is one of the open project's background jobs.
type JobState struct {
	Name     string // traffic_index, annotation_index, sitemap, prettified_move
	Complete bool
	Done     int64
	Total    int64 // 0 until the job has counted its work
	// Rebuildable means RebuildJob accepts the job.
	Rebuildable bool
}

// ListJobs returns the state of the open project's background jobs, for
// Settings → Maintenance and the Ledger's notices. Marasi emits no
// in-process job events, so the frontend polls this while a job runs.
func (a *App) ListJobs() ([]JobState, error) {
	if a.projects == nil {
		return nil, errors.New("listing background jobs: no project lifecycle")
	}
	states, err := a.projects.ListJobs()
	if err != nil {
		return nil, fmt.Errorf("listing background jobs: %w", err)
	}
	jobs := make([]JobState, 0, len(states))
	for _, state := range states {
		jobs = append(jobs, JobState{
			Name:        string(state.Name),
			Complete:    state.Complete,
			Done:        state.Done,
			Total:       state.Total,
			Rebuildable: rebuildableJobs[state.Name],
		})
	}
	return jobs, nil
}

// RebuildJob resets one of the open project's background jobs and starts it
// again. Rebuilding the search index also re-decodes compressed bodies, so
// older ones become searchable.
func (a *App) RebuildJob(name string) error {
	if a.projects == nil {
		return errors.New("rebuilding a background job: no project lifecycle")
	}
	if err := a.projects.RebuildJob(domain.JobName(name)); err != nil {
		return fmt.Errorf("rebuilding background job %s: %w", name, err)
	}
	return nil
}
