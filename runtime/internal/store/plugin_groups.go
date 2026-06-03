package store

import (
	"context"
	"fmt"
)

const DefaultPluginGroupID = "default"

type PluginGroupRow struct {
	ID        string
	Label     string
	SortOrder int
}

type PluginGroupsSnapshot struct {
	Groups      []PluginGroupRow
	Assignments map[string]string
	Collapsed   map[string]bool
}

func (s *Store) GetPluginGroups(ctx context.Context) (PluginGroupsSnapshot, error) {
	groups, err := s.listPluginGroups(ctx)
	if err != nil {
		return PluginGroupsSnapshot{}, err
	}
	if len(groups) == 0 {
		if err := s.seedDefaultPluginGroup(ctx); err != nil {
			return PluginGroupsSnapshot{}, err
		}
		groups, err = s.listPluginGroups(ctx)
		if err != nil {
			return PluginGroupsSnapshot{}, err
		}
	}

	assignments, err := s.listPluginGroupAssignments(ctx)
	if err != nil {
		return PluginGroupsSnapshot{}, err
	}
	collapsed, err := s.listPluginGroupCollapsed(ctx)
	if err != nil {
		return PluginGroupsSnapshot{}, err
	}

	return PluginGroupsSnapshot{
		Groups:      groups,
		Assignments: assignments,
		Collapsed:   collapsed,
	}, nil
}

func (s *Store) SavePluginGroups(ctx context.Context, snap PluginGroupsSnapshot) error {
	if !hasDefaultPluginGroup(snap.Groups) {
		return fmt.Errorf("default plugin group is required")
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM plugin_group_assignments`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM plugin_group_collapsed`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM plugin_groups`); err != nil {
		return err
	}

	for i, group := range snap.Groups {
		sortOrder := group.SortOrder
		if sortOrder == 0 && i > 0 {
			sortOrder = i
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO plugin_groups (id, label, sort_order)
			VALUES (?, ?, ?)
		`, group.ID, group.Label, sortOrder); err != nil {
			return err
		}
	}

	for pluginID, groupID := range snap.Assignments {
		if pluginID == "" || groupID == "" || groupID == DefaultPluginGroupID {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO plugin_group_assignments (plugin_id, group_id)
			VALUES (?, ?)
		`, pluginID, groupID); err != nil {
			return err
		}
	}

	for groupID, collapsed := range snap.Collapsed {
		if groupID == "" || !collapsed {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO plugin_group_collapsed (group_id, collapsed)
			VALUES (?, 1)
		`, groupID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) listPluginGroups(ctx context.Context) ([]PluginGroupRow, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, label, sort_order
		FROM plugin_groups
		ORDER BY sort_order ASC, label ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PluginGroupRow
	for rows.Next() {
		var row PluginGroupRow
		if err := rows.Scan(&row.ID, &row.Label, &row.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) listPluginGroupAssignments(ctx context.Context) (map[string]string, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT plugin_id, group_id FROM plugin_group_assignments
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]string)
	for rows.Next() {
		var pluginID, groupID string
		if err := rows.Scan(&pluginID, &groupID); err != nil {
			return nil, err
		}
		out[pluginID] = groupID
	}
	return out, rows.Err()
}

func (s *Store) listPluginGroupCollapsed(ctx context.Context) (map[string]bool, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT group_id, collapsed FROM plugin_group_collapsed WHERE collapsed = 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]bool)
	for rows.Next() {
		var groupID string
		var collapsed int
		if err := rows.Scan(&groupID, &collapsed); err != nil {
			return nil, err
		}
		out[groupID] = collapsed == 1
	}
	return out, rows.Err()
}

func (s *Store) seedDefaultPluginGroup(ctx context.Context) error {
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO plugin_groups (id, label, sort_order)
		VALUES (?, ?, 0)
	`, DefaultPluginGroupID, "默认分组")
	return err
}

func hasDefaultPluginGroup(groups []PluginGroupRow) bool {
	for _, g := range groups {
		if g.ID == DefaultPluginGroupID {
			return true
		}
	}
	return false
}
