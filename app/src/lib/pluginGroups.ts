import type { Plugin } from "@/types";

export const DEFAULT_PLUGIN_GROUP_ID = "default";

export interface PluginSidebarGroup {
  id: string;
  label: string;
}

export interface PluginGroupsState {
  groups: PluginSidebarGroup[];
  /** plugin id → group id */
  assignments: Record<string, string>;
  /** group id → collapsed in sidebar */
  collapsed: Record<string, boolean>;
}

const LEGACY_STORAGE_KEY = "orbit.pluginGroups";

export function createDefaultState(): PluginGroupsState {
  return {
    groups: [{ id: DEFAULT_PLUGIN_GROUP_ID, label: "默认分组" }],
    assignments: {},
    collapsed: {},
  };
}

function newGroupId(): string {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Read legacy localStorage state (used once for migration to SQLite). */
export function readLegacyPluginGroupsState(): PluginGroupsState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PluginGroupsState>;
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.filter(
          (g): g is PluginSidebarGroup =>
            typeof g?.id === "string" &&
            g.id.length > 0 &&
            typeof g?.label === "string" &&
            g.label.trim().length > 0,
        )
      : [];
    if (!groups.some(g => g.id === DEFAULT_PLUGIN_GROUP_ID)) {
      groups.unshift({ id: DEFAULT_PLUGIN_GROUP_ID, label: "默认分组" });
    }
    const assignments =
      parsed.assignments && typeof parsed.assignments === "object"
        ? (parsed.assignments as Record<string, string>)
        : {};
    const collapsed =
      parsed.collapsed && typeof parsed.collapsed === "object"
        ? (parsed.collapsed as Record<string, boolean>)
        : {};
    return { groups, assignments, collapsed };
  } catch {
    return null;
  }
}

export function clearLegacyPluginGroupsState(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isDefaultOnlyPluginGroupsState(state: PluginGroupsState): boolean {
  return (
    state.groups.length === 1 &&
    state.groups[0]?.id === DEFAULT_PLUGIN_GROUP_ID &&
    Object.keys(state.assignments).length === 0 &&
    Object.keys(state.collapsed).length === 0
  );
}

export function resolvePluginGroupId(
  pluginId: string,
  assignments: Record<string, string>,
): string {
  const assigned = assignments[pluginId];
  if (assigned) return assigned;
  return DEFAULT_PLUGIN_GROUP_ID;
}

export function groupInstalledPlugins(
  plugins: Plugin[],
  state: PluginGroupsState,
  options?: { includeEmptyGroups?: boolean; onlyActive?: boolean },
): { group: PluginSidebarGroup; plugins: Plugin[] }[] {
  let installed = plugins.filter(p => p.id !== "all");
  if (options?.onlyActive) {
    installed = installed.filter(p => p.active !== false);
  }

  const byGroup = new Map<string, Plugin[]>();
  for (const group of state.groups) {
    byGroup.set(group.id, []);
  }
  if (!byGroup.has(DEFAULT_PLUGIN_GROUP_ID)) {
    byGroup.set(DEFAULT_PLUGIN_GROUP_ID, []);
  }

  for (const plugin of installed) {
    const gid = resolvePluginGroupId(plugin.id, state.assignments);
    if (!byGroup.has(gid)) {
      byGroup.set(gid, []);
    }
    byGroup.get(gid)!.push(plugin);
  }

  const entries = state.groups.map(group => ({
    group,
    plugins: (byGroup.get(group.id) ?? []).sort(
      (a, b) => (a.sort ?? 0) - (b.sort ?? 0),
    ),
  }));

  if (options?.includeEmptyGroups) {
    return entries;
  }
  return entries.filter(entry => entry.plugins.length > 0);
}

export function createPluginGroup(
  state: PluginGroupsState,
  label: string,
): PluginGroupsState {
  const trimmed = label.trim();
  if (!trimmed) return state;
  const id = newGroupId();
  return {
    ...state,
    groups: [...state.groups, { id, label: trimmed }],
  };
}

export function movePluginGroup(
  state: PluginGroupsState,
  groupId: string,
  direction: "up" | "down",
): PluginGroupsState {
  const index = state.groups.findIndex(g => g.id === groupId);
  if (index < 0) return state;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= state.groups.length) return state;
  const groups = [...state.groups];
  [groups[index], groups[targetIndex]] = [groups[targetIndex], groups[index]];
  return { ...state, groups };
}

export function renamePluginGroup(
  state: PluginGroupsState,
  groupId: string,
  label: string,
): PluginGroupsState {
  const trimmed = label.trim();
  if (!trimmed) return state;
  return {
    ...state,
    groups: state.groups.map(g =>
      g.id === groupId ? { ...g, label: trimmed } : g,
    ),
  };
}

export function removePluginGroup(
  state: PluginGroupsState,
  groupId: string,
): PluginGroupsState {
  if (groupId === DEFAULT_PLUGIN_GROUP_ID) return state;
  const nextAssignments = { ...state.assignments };
  for (const [pluginId, gid] of Object.entries(nextAssignments)) {
    if (gid === groupId) {
      nextAssignments[pluginId] = DEFAULT_PLUGIN_GROUP_ID;
    }
  }
  const nextCollapsed = { ...state.collapsed };
  delete nextCollapsed[groupId];
  return {
    groups: state.groups.filter(g => g.id !== groupId),
    assignments: nextAssignments,
    collapsed: nextCollapsed,
  };
}

export function assignPluginToGroup(
  state: PluginGroupsState,
  pluginId: string,
  groupId: string,
): PluginGroupsState {
  if (!state.groups.some(g => g.id === groupId)) return state;
  const next = { ...state.assignments };
  if (groupId === DEFAULT_PLUGIN_GROUP_ID) {
    delete next[pluginId];
  } else {
    next[pluginId] = groupId;
  }
  return { ...state, assignments: next };
}

export function toggleGroupCollapsed(
  state: PluginGroupsState,
  groupId: string,
): PluginGroupsState {
  const current = Boolean(state.collapsed[groupId]);
  return {
    ...state,
    collapsed: { ...state.collapsed, [groupId]: !current },
  };
}
