package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLXPathsFollowDataDirectory(t *testing.T) {
	old := *Env
	t.Cleanup(func() { *Env = old })
	base := t.TempDir()
	Env.BasePath = filepath.Join(base, "application")
	if err := os.MkdirAll(Env.BasePath, 0755); err != nil {
		t.Fatal(err)
	}
	Env.OS = "linux"
	Env.AppId = "codex-data-dir-test"
	t.Setenv("XDG_DATA_HOME", filepath.Join(base, "user data"))
	for _, tc := range []struct {
		name, directory, expected string
		portable                  bool
	}{
		{"default per-user", "", filepath.Join(base, "user data", Env.AppId), false},
		{"portable", "", filepath.Join(Env.BasePath, "data"), true},
		{"custom absolute", filepath.Join(base, "custom data"), filepath.Join(base, "custom data"), false},
		{"custom relative", "custom-data", filepath.Join(Env.BasePath, "custom-data"), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			initDataDir(tc.directory, tc.portable)
			if filepath.Clean(Env.DataDir) != filepath.Clean(tc.expected) {
				t.Fatalf("data directory = %s, want %s", Env.DataDir, tc.expected)
			}
			for _, path := range []string{
				"data/sing-box/versions/lx/1.14.4-lx.33/sing-box.exe",
				"data/.cache/lx-install-test/release.zip",
				"data/sing-box/config.json",
			} {
				want := filepath.Join(Env.DataDir, filepath.FromSlash(path[len("data/"):]))
				if got := filepath.Clean(resolvePath(path)); got != filepath.Clean(want) {
					t.Errorf("%s: got %s, want %s", path, got, want)
				}
			}
		})
	}
}
