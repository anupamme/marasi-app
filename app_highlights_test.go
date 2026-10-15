package main

import (
	"os"
	"reflect"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"
)

var specHighlightColors = []string{"#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"}

// completeHighlightsYAML is a highlights section, so a fixture that must not
// be rewritten at startup has nothing missing.
var completeHighlightsYAML = func() string {
	var b strings.Builder
	b.WriteString("highlights:\n")
	for _, c := range specHighlightColors {
		b.WriteString("  - color: \"" + c + "\"\n")
	}
	return b.String()
}()

func specDefaultHighlights() []Highlight {
	out := make([]Highlight, len(specHighlightColors))
	for i, c := range specHighlightColors {
		out[i] = Highlight{Color: c}
	}
	return out
}

// highlightsSection is the parsed highlights value of an app config file.
func highlightsSection(t *testing.T, dir string) any {
	t.Helper()
	data, err := os.ReadFile(appConfigPath(dir))
	if err != nil {
		t.Fatalf("reading app config: %v", err)
	}
	var parsed map[string]any
	if err := yaml.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("parsing app config: %v", err)
	}
	return parsed["highlights"]
}

func TestAppHighlights(t *testing.T) {
	t.Run("should seed the spec's colours with no labels in a new config", func(t *testing.T) {
		dir := t.TempDir()
		app := loadConfigApp(t, dir)

		if got := app.GetHighlights(); !reflect.DeepEqual(got, specDefaultHighlights()) {
			t.Fatalf("wanted: %+v\ngot: %+v", specDefaultHighlights(), got)
		}
		section, ok := highlightsSection(t, dir).([]any)
		if !ok || len(section) != 8 {
			t.Fatalf("wanted: 8 highlights in the YAML\ngot: %#v", highlightsSection(t, dir))
		}
		if first := section[0].(map[string]any); first["color"] != "#ef4444" || first["label"] != nil {
			t.Fatalf("wanted: color #ef4444 and no label\ngot: %#v", first)
		}
	})

	t.Run("should keep saved colours and labels across a reload", func(t *testing.T) {
		dir := t.TempDir()
		app := loadConfigApp(t, dir)
		want := specDefaultHighlights()
		want[0] = Highlight{Color: "#123abc", Label: "IDOR candidate"}
		want[2].Label = "Revisit"

		saved, err := app.SaveHighlights(want)
		if err != nil {
			t.Fatalf("saving: %v", err)
		}
		if !reflect.DeepEqual(saved, want) {
			t.Fatalf("wanted: %+v\ngot: %+v", want, saved)
		}
		if got := loadConfigApp(t, dir).GetHighlights(); !reflect.DeepEqual(got, want) {
			t.Fatalf("after reload wanted: %+v\ngot: %+v", want, got)
		}
	})

	t.Run("should trim labels and lowercase colours", func(t *testing.T) {
		app := loadConfigApp(t, t.TempDir())
		in := specDefaultHighlights()
		in[1] = Highlight{Color: "#ABCDEF", Label: "  Auth  "}
		in[4].Label = "   "

		saved, err := app.SaveHighlights(in)
		if err != nil {
			t.Fatalf("saving: %v", err)
		}
		if saved[1] != (Highlight{Color: "#abcdef", Label: "Auth"}) || saved[4].Label != "" {
			t.Fatalf("wanted: trimmed and lowercased\ngot: %+v", saved)
		}
	})

	t.Run("should refuse a bad save and leave the file and memory unchanged", func(t *testing.T) {
		cases := map[string][]Highlight{
			"seven highlights": specDefaultHighlights()[:7],
			"not a hex colour": func() []Highlight { h := specDefaultHighlights(); h[3].Color = "green"; return h }(),
			"short hex":        func() []Highlight { h := specDefaultHighlights(); h[3].Color = "#fff"; return h }(),
		}
		for name, in := range cases {
			t.Run(name, func(t *testing.T) {
				dir := t.TempDir()
				app := loadConfigApp(t, dir)
				before, _ := os.ReadFile(appConfigPath(dir))

				got, err := app.SaveHighlights(in)
				if err == nil {
					t.Fatalf("wanted: error\ngot: %+v", got)
				}
				if after, _ := os.ReadFile(appConfigPath(dir)); string(after) != string(before) {
					t.Fatalf("wanted: file unchanged\ngot:\n%s", after)
				}
				if !reflect.DeepEqual(app.GetHighlights(), specDefaultHighlights()) {
					t.Fatalf("wanted: memory unchanged\ngot: %+v", app.GetHighlights())
				}
			})
		}
	})

	t.Run("should reset colours and labels to the defaults", func(t *testing.T) {
		dir := t.TempDir()
		app := loadConfigApp(t, dir)
		changed := specDefaultHighlights()
		changed[0] = Highlight{Color: "#000000", Label: "Mine"}
		if _, err := app.SaveHighlights(changed); err != nil {
			t.Fatalf("saving: %v", err)
		}

		got, err := app.ResetHighlights()
		if err != nil {
			t.Fatalf("resetting: %v", err)
		}
		if !reflect.DeepEqual(got, specDefaultHighlights()) {
			t.Fatalf("wanted: %+v\ngot: %+v", specDefaultHighlights(), got)
		}
		if reloaded := loadConfigApp(t, dir).GetHighlights(); !reflect.DeepEqual(reloaded, specDefaultHighlights()) {
			t.Fatalf("after reload wanted defaults\ngot: %+v", reloaded)
		}
	})

	t.Run("should add the section to an existing config without touching other keys", func(t *testing.T) {
		dir := t.TempDir()
		writeAppConfig(t, dir, "vim_enabled: false\nsyntax_mode: dark\n")
		app := loadConfigApp(t, dir)

		if !reflect.DeepEqual(app.GetHighlights(), specDefaultHighlights()) {
			t.Fatalf("wanted defaults\ngot: %+v", app.GetHighlights())
		}
		data, _ := os.ReadFile(appConfigPath(dir))
		if !strings.Contains(string(data), "vim_enabled: false") || !strings.Contains(string(data), "syntax_mode: dark") {
			t.Fatalf("wanted: existing keys kept\ngot:\n%s", data)
		}
	})

	t.Run("should use the defaults for an unusable section and leave it on disk", func(t *testing.T) {
		dir := t.TempDir()
		content := "highlights: not a list\n"
		writeAppConfig(t, dir, content)
		app := loadConfigApp(t, dir)

		if !reflect.DeepEqual(app.GetHighlights(), specDefaultHighlights()) {
			t.Fatalf("wanted defaults\ngot: %+v", app.GetHighlights())
		}
		if section := highlightsSection(t, dir); section != "not a list" {
			t.Fatalf("wanted: section untouched\ngot: %#v", section)
		}
	})

	t.Run("should fill a bad entry from the defaults and keep the good ones", func(t *testing.T) {
		dir := t.TempDir()
		writeAppConfig(t, dir, "highlights:\n  - color: \"#111111\"\n    label: One\n  - color: nope\n    label: Two\n")
		app := loadConfigApp(t, dir)

		want := specDefaultHighlights()
		want[0] = Highlight{Color: "#111111", Label: "One"}
		want[1].Label = "Two"
		if got := app.GetHighlights(); !reflect.DeepEqual(got, want) {
			t.Fatalf("wanted: %+v\ngot: %+v", want, got)
		}
	})
}
