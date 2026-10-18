package main

import (
	"strings"
	"time"
)

// Which build counts as newer (GLOSSARY "Update": never an older build).
//
// Version strings, as build_info.go sets them:
//   - release: the tag, "DD.MM.YYYY" with an optional "-<suffix>" for a
//     same-day re-release ("17.10.2026-1")
//   - nightly: "DD.MM.YYYY (nightly <commit>)", the short commit the build
//     was made from

// releaseDateLayout is the DD.MM.YYYY date that names a release.
const releaseDateLayout = "02.01.2006"

// releaseVersion is a parsed release tag.
type releaseVersion struct {
	date time.Time
	// suffix is the re-release suffix after the date's "-"; "" for the plain
	// tag.
	suffix string
}

// parseReleaseVersion parses a release tag "DD.MM.YYYY[-suffix]".
func parseReleaseVersion(tag string) (releaseVersion, bool) {
	datePart, suffix, hasSuffix := strings.Cut(tag, "-")
	if hasSuffix && suffix == "" {
		return releaseVersion{}, false
	}
	date, ok := parseReleaseDate(datePart)
	if !ok {
		return releaseVersion{}, false
	}
	return releaseVersion{date: date, suffix: suffix}, true
}

// parseReleaseDate parses exactly "DD.MM.YYYY".
func parseReleaseDate(s string) (time.Time, bool) {
	if len(s) != len(releaseDateLayout) {
		return time.Time{}, false
	}
	date, err := time.Parse(releaseDateLayout, s)
	if err != nil {
		return time.Time{}, false
	}
	return date, true
}

// newerThan reports whether v is a later release than other: a later date,
// or on the same date a re-release after other. The plain tag comes first on
// its date, then suffixes in natural order (-2 before -10).
func (v releaseVersion) newerThan(other releaseVersion) bool {
	if !v.date.Equal(other.date) {
		return v.date.After(other.date)
	}
	return compareNatural(v.suffix, other.suffix) > 0
}

// compareNatural compares a and b with runs of digits compared as numbers,
// so "9" < "10" and "rc2" < "rc10". It returns -1, 0 or 1.
func compareNatural(a, b string) int {
	for a != "" && b != "" {
		aChunk, aRest, aDigits := nextChunk(a)
		bChunk, bRest, bDigits := nextChunk(b)
		var c int
		if aDigits && bDigits {
			c = compareDigits(aChunk, bChunk)
		} else {
			c = strings.Compare(aChunk, bChunk)
		}
		if c != 0 {
			return c
		}
		a, b = aRest, bRest
	}
	switch {
	case a == b:
		return 0
	case a == "":
		return -1
	default:
		return 1
	}
}

// nextChunk splits off the leading run of digits or of non-digits.
func nextChunk(s string) (chunk, rest string, digits bool) {
	digits = isDigit(s[0])
	i := 1
	for i < len(s) && isDigit(s[i]) == digits {
		i++
	}
	return s[:i], s[i:], digits
}

// compareDigits compares two runs of digits as numbers of any length.
func compareDigits(a, b string) int {
	a = strings.TrimLeft(a, "0")
	b = strings.TrimLeft(b, "0")
	if len(a) != len(b) {
		if len(a) < len(b) {
			return -1
		}
		return 1
	}
	return strings.Compare(a, b)
}

func isDigit(c byte) bool { return '0' <= c && c <= '9' }

// nightlyVersion is a parsed nightly version string.
type nightlyVersion struct {
	date time.Time
	// commit is the commit as the version string has it, usually the short
	// hash.
	commit string
}

// parseNightlyVersion parses "DD.MM.YYYY (nightly <commit>)".
func parseNightlyVersion(s string) (nightlyVersion, bool) {
	datePart, rest, ok := strings.Cut(s, " (nightly ")
	if !ok {
		return nightlyVersion{}, false
	}
	commit, ok := strings.CutSuffix(rest, ")")
	if !ok || !isCommitHash(commit) {
		return nightlyVersion{}, false
	}
	date, ok := parseReleaseDate(datePart)
	if !ok {
		return nightlyVersion{}, false
	}
	return nightlyVersion{date: date, commit: commit}, true
}

// isCommitHash reports whether s looks like a git commit hash, full or
// shortened.
func isCommitHash(s string) bool {
	if len(s) < 4 || len(s) > 64 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !isDigit(c) && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}

// sameCommit reports whether two hashes name the same commit, where either
// may be shortened.
func sameCommit(a, b string) bool {
	a, b = strings.ToLower(a), strings.ToLower(b)
	return strings.HasPrefix(a, b) || strings.HasPrefix(b, a)
}

// isUpdateFor reports whether the published nightly v is an update for the
// running nightly: built from another commit, and dated the same day as the
// running build or later. The same commit is never an update. A running
// build with no commit (a release switched to nightly) is ordered by date
// alone.
func (v nightlyVersion) isUpdateFor(running nightlyVersion) bool {
	if running.commit != "" && sameCommit(v.commit, running.commit) {
		return false
	}
	return !v.date.Before(running.date)
}

// isUpdateForNightly reports whether release r is an update for the
// running nightly: only when it is dated after the nightly (ADR 0006), so
// switching from nightly to release never downgrades.
func (r releaseVersion) isUpdateForNightly(running nightlyVersion) bool {
	return r.date.After(running.date)
}
