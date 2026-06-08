package plugin

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractOrbitPackage_Juejin(t *testing.T) {
	root := filepath.Join("..", "..", "..", "docs", "插件", "掘金", "掘金.orbit")
	data, err := os.ReadFile(root)
	if err != nil {
		t.Skipf("sample orbit package missing: %v", err)
	}
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

	m, dir, err := extractOrbitPackage(data)
	if err != nil {
		t.Fatalf("extractOrbitPackage: %v", err)
	}
	if m.ID != "juejin" {
		t.Fatalf("expected id juejin, got %q", m.ID)
	}
	if m.Source != SourceWASM {
		t.Fatalf("expected wasm source, got %q", m.Source)
	}
	wasmPath := filepath.Join(dir, "main.wasm.br")
	if _, err := os.Stat(wasmPath); err != nil {
		t.Fatalf("wasm binary missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "manifest.json")); err != nil {
		t.Fatalf("manifest missing: %v", err)
	}
	if m.Meta.LogoImageURL == "" {
		t.Fatal("expected iconUrl alias to populate logoImageUrl")
	}
}

func TestLoadWasmBinary_Brotli(t *testing.T) {
	root := filepath.Join("..", "..", "..", "docs", "插件", "掘金", "掘金", "main.wasm.br")
	data, err := loadWasmBinary(root)
	if err != nil {
		t.Fatalf("loadWasmBinary: %v", err)
	}
	if len(data) < 4 || string(data[:4]) != "\x00asm" {
		t.Fatalf("expected wasm magic, got %d bytes", len(data))
	}
}
