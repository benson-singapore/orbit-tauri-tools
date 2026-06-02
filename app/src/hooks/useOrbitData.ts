import { useCallback, useEffect, useState } from "react";
import { INITIAL_PLUGINS } from "@/data/plugins";
import {
  fetchFeed,
  fetchPlugins,
  installRSSPlugin,
  setPluginActive,
  uninstallPlugin,
} from "@/lib/feed";
import type { Article, InstallRSSPluginRequest, Plugin } from "@/types";

const ALL_PLUGIN: Plugin = INITIAL_PLUGINS[0]!;

interface UseOrbitDataResult {
  plugins: Plugin[];
  articles: Article[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  installCustomRSS: (payload: InstallRSSPluginRequest) => Promise<void>;
  togglePluginActive: (id: string) => Promise<void>;
  removePlugin: (id: string) => Promise<void>;
  movePlugin: (id: string, direction: "up" | "down") => void;
}

export function useOrbitData(): UseOrbitDataResult {
  const [plugins, setPlugins] = useState<Plugin[]>(INITIAL_PLUGINS);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    const remote = await fetchPlugins();
    setPlugins([ALL_PLUGIN, ...remote]);
  }, []);

  const loadFeed = useCallback(async (force = false) => {
    const items = await fetchFeed({ refresh: force });
    setArticles(items);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPlugins();
      await loadFeed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadPlugins, loadFeed]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const installCustomRSS = useCallback(
    async (payload: InstallRSSPluginRequest) => {
      await installRSSPlugin(payload);
      await loadPlugins();
      await loadFeed(true);
    },
    [loadPlugins, loadFeed],
  );

  const togglePluginActive = useCallback(
    async (id: string) => {
      const target = plugins.find(p => p.id === id);
      if (!target) return;
      const currentlyActive = target?.active !== false;
      const nextActive = !currentlyActive;

      // 先做本地更新，保证按钮点击后立即有视觉反馈
      setPlugins(prev => prev.map(plugin => (
        plugin.id === id ? { ...plugin, active: nextActive } : plugin
      )));

      try {
        await setPluginActive(id, nextActive);
        await loadFeed(true);
      } catch (err) {
        // 失败时回滚并刷新，避免 UI 与后端状态不一致
        setPlugins(prev => prev.map(plugin => (
          plugin.id === id ? { ...plugin, active: currentlyActive } : plugin
        )));
        await loadPlugins();
        throw err;
      }
    },
    [plugins, loadPlugins, loadFeed],
  );

  const removePlugin = useCallback(
    async (id: string) => {
      setPlugins(prev => prev.filter(plugin => plugin.id !== id));
      setArticles(prev => prev.filter(article => article.pluginId !== id));
      try {
        await uninstallPlugin(id);
        await loadFeed(true);
      } catch (err) {
        await loadPlugins();
        await loadFeed(true);
        throw err;
      }
    },
    [loadPlugins, loadFeed],
  );

  const movePlugin = useCallback((id: string, direction: "up" | "down") => {
    setPlugins((prev) => {
      if (prev.length <= 2) return prev;
      const [allPlugin, ...rest] = prev;
      const index = rest.findIndex(plugin => plugin.id === id);
      if (index < 0) return prev;
      if (direction === "up" && index === 0) return prev;
      if (direction === "down" && index === rest.length - 1) return prev;

      const next = [...rest];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
      return [allPlugin, ...next];
    });
  }, []);

  return {
    plugins,
    articles,
    loading,
    error,
    reload,
    installCustomRSS,
    togglePluginActive,
    removePlugin,
    movePlugin,
  };
}
