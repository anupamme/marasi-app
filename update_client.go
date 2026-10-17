package main

import (
	"net/http"
	"time"
)

// updateHTTPClient is the client every update request (release checks and
// downloads) goes through. It is its own client, never the proxy's
// transport, so update traffic stays out of the researcher's project. It
// honours the proxy set in the environment.
func (a *App) updateHTTPClient() *http.Client {
	if a.updateClient != nil {
		return a.updateClient
	}
	return &http.Client{
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 30 * time.Second,
		},
	}
}
