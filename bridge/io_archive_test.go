package bridge

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestUnzipZIPFile(t *testing.T) {
	for _, tc := range []struct {
		name  string
		entry string
		ok    bool
	}{
		{"valid archive", "release/sing-box", true},
		{"path traversal", "../outside", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "release.zip")
			file, err := os.Create(path)
			if err != nil {
				t.Fatal(err)
			}
			writer := zip.NewWriter(file)
			if _, err := writer.Create("release/"); err != nil {
				t.Fatal(err)
			}
			entry, err := writer.Create(tc.entry)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := entry.Write([]byte("test")); err != nil {
				t.Fatal(err)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			if err := file.Close(); err != nil {
				t.Fatal(err)
			}
			result := (&App{}).UnzipZIPFile(path, filepath.Join(dir, "output"))
			if result.Flag != tc.ok {
				t.Fatalf("success = %v: %s", result.Flag, result.Data)
			}
		})
	}
}

func TestRealLXArchive(t *testing.T) {
	path := os.Getenv("LX_TEST_ARCHIVE")
	if path == "" {
		t.Skip("set LX_TEST_ARCHIVE to a downloaded LX release")
	}
	dir := t.TempDir()
	result := (&App{}).UnzipZIPFile(path, dir)
	if !result.Flag {
		t.Fatal(result.Data)
	}
	for _, name := range []string{"sing-box.exe", "libcronet.dll"} {
		if _, err := os.Stat(filepath.Join(dir, "sing-box-1.14.4-lx.33-windows-amd64", name)); err != nil {
			t.Fatal(err)
		}
	}
}
