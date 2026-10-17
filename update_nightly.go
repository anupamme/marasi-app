package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"strings"
)

// The nightly channel (GLOSSARY "Nightly"): the release tagged "nightly",
// which the nightly workflow deletes and publishes again. Its title is its
// version string and its notes carry a "Commit: <sha>" line.

// nightlyTag is the tag of the published nightly.
const nightlyTag = "nightly"

// errNoNightlyPublished: GitHub has no nightly right now, most likely because
// the nightly workflow is publishing a new one. A manual check reports it as
// a failure worth retrying; an automatic check treats it as no update.
var errNoNightlyPublished = errors.New("no nightly is published right now; a new one may be on its way, so try again in a few minutes")

// findNightlyUpdate compares the published nightly with the running nightly.
func (a *App) findNightlyUpdate(ctx context.Context) (*Update, error) {
	running, ok := parseNightlyVersion(a.build.Version)
	if !ok {
		return nil, fmt.Errorf("the running version %q is not a nightly version", a.build.Version)
	}
	release, err := a.releases().releaseByTag(ctx, nightlyTag)
	if errors.Is(err, errReleaseNotFound) {
		return nil, errNoNightlyPublished
	}
	if err != nil {
		return nil, err
	}
	published, ok := parseNightlyVersion(release.Name)
	if !ok {
		return nil, fmt.Errorf("the published nightly's title %q is not a nightly version", release.Name)
	}
	commit, ok := nightlyCommit(release.Notes)
	if !ok {
		return nil, errors.New("the published nightly's notes do not say which commit it was built from")
	}
	published.commit = commit
	if !published.isUpdateFor(running) {
		return nil, nil
	}
	return &Update{
		Channel:     channelNightly,
		Version:     release.Name,
		Notes:       release.Notes,
		ReleasePage: release.Page,
		Commit:      commit,
		CompareURL:  compareURL(release.Page, running.commit, commit),
		release:     release,
	}, nil
}

// nightlyCommit reads the commit from the "Commit: <sha>" line of a nightly's
// release notes.
func nightlyCommit(notes string) (string, bool) {
	lines := bufio.NewScanner(strings.NewReader(notes))
	for lines.Scan() {
		value, ok := strings.CutPrefix(strings.TrimSpace(lines.Text()), "Commit:")
		if !ok {
			continue
		}
		commit := strings.TrimSpace(value)
		return commit, isCommitHash(commit)
	}
	return "", false
}

// compareURL is the GitHub comparison from one commit to another in the
// repository whose release page is releasePage
// (https://github.com/<owner>/<repo>/releases/tag/<tag>). It is "" when the
// page is not a release page.
func compareURL(releasePage, from, to string) string {
	repo, _, ok := strings.Cut(releasePage, "/releases/")
	if !ok || repo == "" {
		return ""
	}
	return repo + "/compare/" + from + "..." + to
}
