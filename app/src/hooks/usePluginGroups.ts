import { useCallback, useEffect, useRef, useState } from "react";
import {
  assignPluginToGroup,
  clearLegacyPluginGroupsState,
  createDefaultState,
  createPluginGroup,
  groupInstalledPlugins,
  isDefaultOnlyPluginGroupsState,
  readLegacyPluginGroupsState,
  removePluginGroup,
  movePluginGroup,
  renamePluginGroup,
  resolvePluginGroupId,
  toggleGroupCollapsed,
  type PluginGroupsState,
  type PluginSidebarGroup,
} from "@/lib/pluginGroups";
import {
  fetchPluginGroupsState,
  savePluginGroupsState,
} from "@/lib/pluginGroupsApi";
import type { Plugin } from "@/types";

export function usePluginGroups() {
  const [state, setState] = useState<PluginGroupsState>(createDefaultState);
  const [loaded, setLoaded] = useState(false);
  const persistQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        let remote = await fetchPluginGroupsState();
        const legacy = readLegacyPluginGroupsState();

        if (
          legacy &&
          isDefaultOnlyPluginGroupsState(remote) &&
          !isDefaultOnlyPluginGroupsState(legacy)
        ) {
          remote = legacy;
          await savePluginGroupsState(remote);
          clearLegacyPluginGroupsState();
        } else if (legacy) {
          clearLegacyPluginGroupsState();
        }

        if (!cancelled) {
          setState(remote);
        }
      } catch {
        const legacy = readLegacyPluginGroupsState();
        if (!cancelled) {
          setState(legacy ?? createDefaultState());
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enqueuePersist = useCallback((next: PluginGroupsState) => {
    persistQueueRef.current = persistQueueRef.current
      .then(() => savePluginGroupsState(next))
      .catch(err => {
        console.error("failed to persist plugin groups:", err);
      });
  }, []);

  const commit = useCallback(
    (updater: (prev: PluginGroupsState) => PluginGroupsState) => {
      setState(prev => {
        const next = updater(prev);
        enqueuePersist(next);
        return next;
      });
    },
    [enqueuePersist],
  );

  const groups: PluginSidebarGroup[] = state.groups;

  const addGroup = useCallback(
    (label: string) => commit(prev => createPluginGroup(prev, label)),
    [commit],
  );

  const renameGroup = useCallback(
    (groupId: string, label: string) =>
      commit(prev => renamePluginGroup(prev, groupId, label)),
    [commit],
  );

  const moveGroup = useCallback(
    (groupId: string, direction: "up" | "down") =>
      commit(prev => movePluginGroup(prev, groupId, direction)),
    [commit],
  );

  const removeGroup = useCallback(
    (groupId: string) => commit(prev => removePluginGroup(prev, groupId)),
    [commit],
  );

  const assignPlugin = useCallback(
    (pluginId: string, groupId: string) =>
      commit(prev => assignPluginToGroup(prev, pluginId, groupId)),
    [commit],
  );

  const toggleCollapsed = useCallback(
    (groupId: string) => commit(prev => toggleGroupCollapsed(prev, groupId)),
    [commit],
  );

  const isGroupCollapsed = useCallback(
    (groupId: string) => Boolean(state.collapsed[groupId]),
    [state.collapsed],
  );

  const groupedPluginsForManage = useCallback(
    (plugins: Plugin[]) =>
      groupInstalledPlugins(plugins, state, { includeEmptyGroups: true }),
    [state],
  );

  const groupedPluginsForSidebar = useCallback(
    (plugins: Plugin[]) =>
      groupInstalledPlugins(plugins, state, { onlyActive: true }),
    [state],
  );

  return {
    loaded,
    groups,
    addGroup,
    renameGroup,
    moveGroup,
    removeGroup,
    assignPlugin,
    toggleCollapsed,
    isGroupCollapsed,
    groupedPluginsForManage,
    groupedPluginsForSidebar,
    getPluginGroupId: (pluginId: string) =>
      resolvePluginGroupId(pluginId, state.assignments),
  };
}
