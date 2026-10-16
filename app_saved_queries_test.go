package main

import (
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestAppSavedQueries(t *testing.T) {
	t.Run("should start with no saved queries and no hidden built-ins", func(t *testing.T) {
		dir := t.TempDir()
		app := loadConfigApp(t, dir)

		got := app.GetAppSavedQueries()
		if len(got.Queries) != 0 || len(got.HiddenBuiltins) != 0 {
			t.Fatalf("wanted: empty\ngot: %+v", got)
		}
		data, _ := os.ReadFile(appConfigPath(dir))
		if strings.Contains(string(data), "saved_queries") {
			t.Fatalf("wanted: nothing written at startup\ngot:\n%s", data)
		}
	})

	t.Run("should keep saved queries in order across a reload", func(t *testing.T) {
		dir := t.TempDir()
		app := loadConfigApp(t, dir)
		in := []SavedQuery{
			{ID: "b", Name: "Third-party noise", Query: `host != "*.acme.test"`, Order: 1},
			{ID: "a", Name: "Highlighted", Query: "highlight:*", Order: 0},
		}
		want := []SavedQuery{in[1], in[0]}

		saved, err := app.SaveAppSavedQueries(in)
		if err != nil {
			t.Fatalf("saving: %v", err)
		}
		if !reflect.DeepEqual(saved, want) {
			t.Fatalf("wanted: %+v\ngot: %+v", want, saved)
		}
		if got := loadConfigApp(t, dir).GetAppSavedQueries().Queries; !reflect.DeepEqual(got, want) {
			t.Fatalf("after reload wanted: %+v\ngot: %+v", want, got)
		}
	})

	t.Run("should trim names and queries", func(t *testing.T) {
		app := loadConfigApp(t, t.TempDir())
		saved, err := app.SaveAppSavedQueries([]SavedQuery{{ID: " a ", Name: "  Admin  ", Query: "  status_code = 403 "}})
		if err != nil {
			t.Fatalf("saving: %v", err)
		}
		if want := (SavedQuery{ID: "a", Name: "Admin", Query: "status_code = 403"}); saved[0] != want {
			t.Fatalf("wanted: %+v\ngot: %+v", want, saved[0])
		}
	})

	t.Run("should refuse a bad save and leave the file and memory unchanged", func(t *testing.T) {
		cases := map[string][]SavedQuery{
			"no id":        {{Name: "A", Query: "highlight:*"}},
			"no name":      {{ID: "a", Name: " ", Query: "highlight:*"}},
			"no query":     {{ID: "a", Name: "A", Query: ""}},
			"duplicate id": {{ID: "a", Name: "A", Query: "x"}, {ID: "a", Name: "B", Query: "y"}},
		}
		for name, in := range cases {
			t.Run(name, func(t *testing.T) {
				dir := t.TempDir()
				app := loadConfigApp(t, dir)
				kept := []SavedQuery{{ID: "k", Name: "Kept", Query: "note:*"}}
				if _, err := app.SaveAppSavedQueries(kept); err != nil {
					t.Fatalf("saving: %v", err)
				}
				before, _ := os.ReadFile(appConfigPath(dir))

				got, err := app.SaveAppSavedQueries(in)
				if err == nil {
					t.Fatalf("wanted: error\ngot: %+v", got)
				}
				if !reflect.DeepEqual(got, kept) {
					t.Fatalf("wanted: the current queries returned\ngot: %+v", got)
				}
				if after, _ := os.ReadFile(appConfigPath(dir)); string(after) != string(before) {
					t.Fatalf("wanted: file unchanged\ngot:\n%s", after)
				}
				if !reflect.DeepEqual(app.GetAppSavedQueries().Queries, kept) {
					t.Fatalf("wanted: memory unchanged\ngot: %+v", app.GetAppSavedQueries())
				}
			})
		}
	})

	t.Run("should keep hidden built-ins across a reload, trimmed and without duplicates", func(t *testing.T) {
		dir := t.TempDir()
		app := loadConfigApp(t, dir)

		got, err := app.SetHiddenBuiltinQueries([]string{" writes ", "redirects", "writes", ""})
		if err != nil {
			t.Fatalf("saving: %v", err)
		}
		want := []string{"writes", "redirects"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("wanted: %v\ngot: %v", want, got)
		}
		if reloaded := loadConfigApp(t, dir).GetAppSavedQueries().HiddenBuiltins; !reflect.DeepEqual(reloaded, want) {
			t.Fatalf("after reload wanted: %v\ngot: %v", want, reloaded)
		}
	})

	t.Run("should keep other keys when saving", func(t *testing.T) {
		dir := t.TempDir()
		writeAppConfig(t, dir, "vim_enabled: false\nsyntax_mode: dark\n")
		app := loadConfigApp(t, dir)
		if _, err := app.SaveAppSavedQueries([]SavedQuery{{ID: "a", Name: "A", Query: "note:*"}}); err != nil {
			t.Fatalf("saving: %v", err)
		}
		if _, err := app.SetHiddenBuiltinQueries([]string{"writes"}); err != nil {
			t.Fatalf("hiding: %v", err)
		}
		data, _ := os.ReadFile(appConfigPath(dir))
		if !strings.Contains(string(data), "vim_enabled: false") || !strings.Contains(string(data), "syntax_mode: dark") {
			t.Fatalf("wanted: existing keys kept\ngot:\n%s", data)
		}
	})

	t.Run("should skip unusable entries and leave an unusable section on disk", func(t *testing.T) {
		dir := t.TempDir()
		writeAppConfig(t, dir, "saved_queries:\n  - id: a\n    name: Good\n    query: note:*\n  - id: b\n    name: \"\"\n    query: x\n  - id: a\n    name: Duplicate\n    query: y\nhidden_builtin_queries: nope\n")
		app := loadConfigApp(t, dir)

		got := app.GetAppSavedQueries()
		if want := []SavedQuery{{ID: "a", Name: "Good", Query: "note:*"}}; !reflect.DeepEqual(got.Queries, want) {
			t.Fatalf("wanted: %+v\ngot: %+v", want, got.Queries)
		}
		if len(got.HiddenBuiltins) != 0 {
			t.Fatalf("wanted: no hidden built-ins\ngot: %v", got.HiddenBuiltins)
		}
		data, _ := os.ReadFile(appConfigPath(dir))
		if !strings.Contains(string(data), "hidden_builtin_queries: nope") {
			t.Fatalf("wanted: section untouched\ngot:\n%s", data)
		}
	})
}
