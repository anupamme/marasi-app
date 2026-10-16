package main

import (
	"fmt"

	"github.com/tfkr-ae/marasi/domain"
)

// CountContentTypes returns every content type in the project with its pair
// count, most common first, for the Ledger's Types menu. Excluded types are
// counted too. Pairs still waiting for a response count under "". Marasi
// serves the counts from the sitemap buckets once its sitemap job is
// complete, and from the pairs until then; they are exact either way.
func (a *App) CountContentTypes() (domain.ContentTypeCounts, error) {
	traffic, err := a.Proxy.GetTrafficRepo()
	if err != nil {
		return domain.ContentTypeCounts{}, fmt.Errorf("counting content types: %w", err)
	}
	counts, err := traffic.CountContentTypes()
	if err != nil {
		return domain.ContentTypeCounts{}, fmt.Errorf("counting content types: %w", err)
	}
	return counts, nil
}
