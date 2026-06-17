package store

import (
	"context"
	"testing"
)

func TestDictsDefaultsAndUpsert(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	st, err := Open()
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer st.Close()

	ctx := context.Background()

	rows, err := st.ListDicts(ctx, "setting_config")
	if err != nil {
		t.Fatalf("ListDicts: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 default dict rows, got %d", len(rows))
	}

	aiMode, ok, err := st.GetDict(ctx, "setting_config", "ai_mode")
	if err != nil {
		t.Fatalf("GetDict ai_mode: %v", err)
	}
	if !ok {
		t.Fatal("expected ai_mode dict to exist")
	}
	if aiMode.Value != "false" {
		t.Fatalf("expected ai_mode value false, got %q", aiMode.Value)
	}

	saved, err := st.UpsertDict(ctx, DictRow{
		Type:    "setting_config",
		Label:   "ai_mode",
		Value:   "true",
		Remarks: "enable AI mode",
	})
	if err != nil {
		t.Fatalf("UpsertDict: %v", err)
	}
	if saved.Value != "true" {
		t.Fatalf("expected updated value true, got %q", saved.Value)
	}
	if saved.Remarks != "enable AI mode" {
		t.Fatalf("expected remarks to be saved, got %q", saved.Remarks)
	}

	updated, ok, err := st.GetDict(ctx, "setting_config", "ai_mode")
	if err != nil {
		t.Fatalf("GetDict after upsert: %v", err)
	}
	if !ok || updated.Value != "true" {
		t.Fatalf("expected persisted value true, got ok=%v value=%q", ok, updated.Value)
	}
}
