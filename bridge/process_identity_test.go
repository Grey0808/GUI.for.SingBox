package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProcessMatchesExecutable(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	result := (&App{}).ProcessMatchesExecutable(int32(os.Getpid()), exe)
	if !result.Flag || result.Data != "true" {
		t.Fatalf("own executable: %+v", result)
	}
	other := filepath.Join(t.TempDir(), "other.exe")
	if err := os.WriteFile(other, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	result = (&App{}).ProcessMatchesExecutable(int32(os.Getpid()), other)
	if !result.Flag || result.Data != "false" {
		t.Fatalf("other executable: %+v", result)
	}
}

func TestPathsReferToSameFile(t *testing.T) {
	base := t.TempDir()
	one := filepath.Join(base, "core.exe")
	alias := filepath.Join(base, "alias.exe")
	other := filepath.Join(base, "other.exe")
	for _, path := range []string{one, other} {
		if err := os.WriteFile(path, []byte("fixture"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Link(one, alias); err != nil {
		t.Fatal(err)
	}
	app := &App{}
	for _, tc := range []struct{ path, want string }{{alias, "true"}, {other, "false"}} {
		got := app.PathsReferToSameFile(one, tc.path)
		if !got.Flag || got.Data != tc.want {
			t.Fatalf("%s: %+v", tc.path, got)
		}
	}
}
