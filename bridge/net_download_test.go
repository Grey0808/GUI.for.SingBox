package bridge

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDownloadHTTPAndChecksum(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/missing" {
			http.Error(w, "missing", http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte("test release"))
	}))
	defer server.Close()

	sum := sha256.Sum256([]byte("test release"))
	cases := []struct {
		name, path, digest string
		wantSuccess bool
	}{
		{"verified", "/ok", fmt.Sprintf("%x", sum), true},
		{"no digest", "/ok", "", true},
		{"wrong digest", "/ok", fmt.Sprintf("%064x", 1), false},
		{"http error", "/missing", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "release.zip")
			result := (&App{}).Download(http.MethodGet, server.URL+tc.path, path, nil, "", RequestOptions{Sha256: tc.digest})
			if result.Flag != tc.wantSuccess {
				t.Fatalf("success = %v, body = %q", result.Flag, result.Body)
			}
			data, err := os.ReadFile(path)
			if tc.wantSuccess && (err != nil || string(data) != "test release") {
				t.Fatalf("download = %q, error = %v", data, err)
			}
			if !tc.wantSuccess && !os.IsNotExist(err) {
				t.Fatalf("failed download left a file: %v", err)
			}
		})
	}
}
