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
//   - nightly: "DD.MM.YYYY (nightly <commit>)" (ordering added with the
//     nightly channel)

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
