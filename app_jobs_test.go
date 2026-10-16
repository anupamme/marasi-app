package main

import (
	"testing"
)

func jobByName(t *testing.T, jobs []JobState, name string) JobState {
	t.Helper()
	for _, job := range jobs {
		if job.Name == name {
			return job
		}
	}
	t.Fatalf("wanted a %s job, got %+v", name, jobs)
	return JobState{}
}

func TestListJobsListsEveryBackgroundJobAndWhichCanBeRebuilt(t *testing.T) {
	app := newScratchpadApp(t)

	jobs, err := app.ListJobs()

	if err != nil {
		t.Fatalf("listing jobs: %v", err)
	}
	for name, rebuildable := range map[string]bool{
		"traffic_index":    true,
		"annotation_index": true,
		"sitemap":          true,
		"prettified_move":  false,
	} {
		if got := jobByName(t, jobs, name).Rebuildable; got != rebuildable {
			t.Fatalf("wanted %s rebuildable=%v, got %v", name, rebuildable, got)
		}
	}
}

func TestListJobsReturnsGoErrorWithoutAProject(t *testing.T) {
	app := newProjectApp(t)

	if _, err := app.ListJobs(); err == nil {
		t.Fatalf("wanted an error when no project is open")
	}
}

func TestRebuildJobRestartsARebuildableJob(t *testing.T) {
	app := newScratchpadApp(t)
	capturePair(t, app, capturedPair{host: "api.acme.test", path: "/a", statusCode: 200, contentType: "application/json"})

	if err := app.RebuildJob("sitemap"); err != nil {
		t.Fatalf("rebuilding the sitemap: %v", err)
	}

	jobs, err := app.ListJobs()
	if err != nil {
		t.Fatalf("listing jobs: %v", err)
	}
	jobByName(t, jobs, "sitemap")
}

func TestRebuildJobRefusesAJobThatCannotBeRebuilt(t *testing.T) {
	app := newScratchpadApp(t)

	for _, name := range []string{"prettified_move", "no_such_job"} {
		if err := app.RebuildJob(name); err == nil {
			t.Fatalf("wanted an error rebuilding %s", name)
		}
	}
}
