import { waitForRuntimeReady } from "@/lib/runtime";
import { DEFAULT_PLUGIN_GROUP_ID, type PluginGroupsState } from "@/lib/pluginGroups";

async function apiBase(): Promise<string> {
  const base = await waitForRuntimeReady();
  return base.replace(/\/$/, "");
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function fetchPluginGroupsState(): Promise<PluginGroupsState> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/plugin-groups`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as Partial<PluginGroupsState>;
  return normalizePluginGroupsState(data);
}

export async function savePluginGroupsState(state: PluginGroupsState): Promise<void> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/plugin-groups`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

function normalizePluginGroupsState(data: Partial<PluginGroupsState>): PluginGroupsState {
  const groups = Array.isArray(data.groups)
    ? data.groups.filter(
        (g): g is { id: string; label: string } =>
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
    data.assignments && typeof data.assignments === "object"
      ? (data.assignments as Record<string, string>)
      : {};
  const collapsed =
    data.collapsed && typeof data.collapsed === "object"
      ? (data.collapsed as Record<string, boolean>)
      : {};
  return { groups, assignments, collapsed };
}
