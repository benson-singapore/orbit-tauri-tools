import { useCallback, useState } from "react";
import {
  assignPluginToGroup,
  createPluginGroup,
  groupInstalledPlugins,
  persistPluginGroupsState,
  readPluginGroupsState,
  removePluginGroup,
  movePluginGroup,
  renamePluginGroup,
  resolvePluginGroupId,
  toggleGroupCollapsed,
  type PluginGroupsState,
  type PluginSidebarGroup,
} from "@/lib/pluginGroups";
import type { Plugin } from "@/types";

export function usePluginGroups() {
  const [state, setState] = useState<PluginGroupsState>(readPluginGroupsState);

  const commit = useCallback((updater: (prev: PluginGroupsState) => PluginGroupsState) => {
    setState(prev => {
      const next = updater(prev);
      persistPluginGroupsState(next);
      return next;
    });
  }, []);

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
