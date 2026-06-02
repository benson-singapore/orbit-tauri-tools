import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { PLUGIN_MARKET_GROUPS, PLUGINS_STORE } from "@/data/plugins";
import type { Plugin, PluginManagerTab, PluginMarketCategory, ThemeMode } from "@/types";

const MODAL_HEIGHT = "h-[680px]";
const PRIMARY = "bg-[#5856D6] hover:bg-[#4a48c4]";

interface PluginManagerModalProps {
  theme: ThemeMode;
  myPlugins: Plugin[];
  onClose: () => void;
  onInstall: (plugin: Plugin) => void;
  onUninstall: (id: string) => void;
  onToggleActive: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onImport: (url: string) => void;
}

const TABS: { id: PluginManagerTab; label: string; icon: string }[] = [
  { id: "market", label: "插件市场", icon: "sparkles" },
  { id: "manage", label: "已下载管理", icon: "puzzle" },
  { id: "import", label: "导入自定义插件", icon: "puzzle" },
];

function filterMarketPlugins(
  plugins: Plugin[],
  category: PluginMarketCategory,
  query: string,
): Plugin[] {
  let list = plugins;
  if (category !== "all") {
    list = list.filter(p => p.marketCategory === category);
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q) ||
        (p.categoryTag?.toLowerCase().includes(q) ?? false),
    );
  }
  return list;
}

export function PluginManagerModal({
  theme,
  myPlugins,
  onClose,
  onInstall,
  onUninstall,
  onToggleActive,
  onMove,
  onImport,
}: PluginManagerModalProps) {
  const [activeTab, setActiveTab] = useState<PluginManagerTab>("market");
  const [marketCategory, setMarketCategory] =
    useState<PluginMarketCategory>("all");
  const [marketSearch, setMarketSearch] = useState("");
  const [importFeedUrl, setImportFeedUrl] = useState("");

  const installedPlugins = myPlugins.filter(p => p.id !== "all");
  const runningCount = installedPlugins.filter(p => p.active !== false).length;

  const availableStorePlugins = useMemo(
    () => PLUGINS_STORE.filter(p => !myPlugins.some(mp => mp.id === p.id)),
    [myPlugins],
  );

  const filteredMarketPlugins = useMemo(
    () => filterMarketPlugins(availableStorePlugins, marketCategory, marketSearch),
    [availableStorePlugins, marketCategory, marketSearch],
  );

  const isDark = theme === "dark";
  const panelBg = isDark ? "bg-[#1c1d1f] text-white" : "bg-white text-neutral-900";
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-100";
  const mutedBg = isDark ? "bg-neutral-900/40" : "bg-neutral-50";

  const handleImportSubmit = () => {
    onImport(importFeedUrl);
    setImportFeedUrl("");
    setActiveTab("manage");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 md:p-10"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-6xl ${MODAL_HEIGHT} flex flex-col rounded-[28px] shadow-2xl overflow-hidden ${panelBg} border ${subtleBorder}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className={`shrink-0 flex items-start justify-between gap-6 px-8 pt-7 pb-5 border-b ${subtleBorder}`}
        >
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={`w-12 h-12 shrink-0 rounded-full ${PRIMARY} flex items-center justify-center text-white shadow-lg shadow-indigo-500/25`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="w-6 h-6"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight">
                插件获取与超级控制中心
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-xl">
                在此集中下载、排版、排序、启用或注入自定义流媒体爬虫脚本
              </p>
            </div>
          </div>

          <div
            className={`shrink-0 flex items-center gap-1 p-1 rounded-2xl ${mutedBg}`}
          >
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-neutral-800 text-[#5856D6] shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
              >
                <Icon name={tab.icon} className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === "market" && (
            <div className="flex-1 min-h-0 flex">
              <aside
                className={`w-52 shrink-0 border-r ${subtleBorder} px-4 py-5 overflow-y-auto`}
              >
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-3">
                  插件分组
                </p>
                <nav className="space-y-0.5">
                  {PLUGIN_MARKET_GROUPS.map(group => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setMarketCategory(group.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        marketCategory === group.id
                          ? "bg-[#5856D6]/10 text-[#5856D6] font-medium"
                          : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                      }`}
                    >
                      <Icon name={group.icon} className="w-4 h-4 shrink-0" />
                      <span className="truncate text-left">{group.label}</span>
                    </button>
                  ))}
                </nav>
              </aside>

              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className={`shrink-0 px-6 py-4 border-b ${subtleBorder}`}>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                      <Icon
                        name="search"
                        className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
                      />
                      <input
                        type="search"
                        value={marketSearch}
                        onChange={e => setMarketSearch(e.target.value)}
                        placeholder="搜索官方应用、漫库、RSS或剧集频道..."
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border ${subtleBorder} ${mutedBg} focus:border-[#5856D6]/50`}
                      />
                    </div>
                    <span className="text-xs text-neutral-400 whitespace-nowrap shrink-0">
                      发现 {filteredMarketPlugins.length} 个获取接口
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {filteredMarketPlugins.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-16">
                      {availableStorePlugins.length === 0
                        ? "市场插件已全部安装，可在「已下载管理」中调整。"
                        : "当前分组下暂无匹配插件，试试其他分组或搜索词。"}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredMarketPlugins.map(plugin => (
                        <article
                          key={plugin.id}
                          className={`relative flex flex-col p-4 rounded-2xl border ${subtleBorder} hover:border-[#5856D6]/30 transition-colors`}
                        >
                          {plugin.official && (
                            <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                              官方推荐
                            </span>
                          )}
                          <div className="flex items-start gap-3 mb-3 pr-16">
                            <div
                              className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-bold text-white text-sm ${plugin.color}`}
                            >
                              {plugin.logoText}
                            </div>
                            <div className="min-w-0 pt-0.5">
                              <h3 className="text-sm font-bold leading-snug">
                                {plugin.name}
                              </h3>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                                {plugin.desc}
                              </p>
                            </div>
                          </div>
                          <div className="mt-auto flex items-center justify-between pt-3 border-t border-dashed border-neutral-100 dark:border-neutral-800">
                            <span className="text-[10px] font-semibold text-neutral-400 tracking-wider">
                              {plugin.categoryTag ?? "FEED"}
                            </span>
                            <button
                              type="button"
                              onClick={() => onInstall(plugin)}
                              className={`text-xs font-semibold text-white px-3 py-1.5 rounded-lg ${PRIMARY} transition-colors`}
                            >
                              下载安装
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "manage" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div
                className={`shrink-0 flex items-start justify-between gap-4 px-8 py-5 border-b ${subtleBorder}`}
              >
                <div>
                  <h3 className="text-base font-bold">
                    已下载的内容插件重塑管理
                  </h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    调整侧边栏的排版顺序、临时关闭或彻底卸载数据通道
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg shrink-0 ${mutedBg} text-neutral-500`}
                >
                  运行中：{runningCount} 个
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-4 space-y-3">
                {installedPlugins.length === 0 ? (
                  <p className="text-sm text-neutral-400 text-center py-16">
                    暂无已下载插件，请前往「插件市场」安装。
                  </p>
                ) : (
                  installedPlugins.map((plugin, index) => {
                    const isEnabled = plugin.active !== false;
                    const canMoveUp = index > 0;
                    const canMoveDown = index < installedPlugins.length - 1;
                    return (
                      <div
                        key={plugin.id}
                        className={`flex items-center gap-4 p-4 rounded-2xl border ${subtleBorder} ${mutedBg}`}
                      >
                        <div
                          className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-bold text-white text-sm ${plugin.color}`}
                        >
                          {plugin.logoText}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold">{plugin.name}</span>
                            {plugin.official && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200/80 dark:bg-neutral-700 text-neutral-500">
                                官方
                              </span>
                            )}
                            {!isEnabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500">
                                已停用
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
                            {plugin.desc}
                          </p>
                          <button
                            type="button"
                            onClick={() => onUninstall(plugin.id)}
                            className="text-[11px] text-rose-500 hover:text-rose-600 mt-1"
                          >
                            卸载此通道
                          </button>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              disabled={!canMoveUp}
                              onClick={() => onMove(plugin.id, "up")}
                              className="p-1.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-25 rounded-lg hover:bg-white dark:hover:bg-neutral-800"
                              title="上移"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 15l-6-6-6 6" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              disabled={!canMoveDown}
                              onClick={() => onMove(plugin.id, "down")}
                              className="p-1.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-25 rounded-lg hover:bg-white dark:hover:bg-neutral-800"
                              title="下移"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleActive(plugin.id)}
                            className={`text-xs font-semibold px-4 py-2 rounded-xl border transition-colors ${
                              isEnabled
                                ? "border-emerald-200 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900"
                                : "border-neutral-200 text-neutral-500 bg-white dark:bg-neutral-800 dark:border-neutral-700"
                            }`}
                          >
                            {isEnabled ? "已启用" : "已停用"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === "import" && (
            <div className="flex-1 overflow-y-auto px-8 py-8">
              <div className="max-w-xl mx-auto space-y-6">
                <div>
                  <h3 className="text-base font-bold">导入自定义插件</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    粘贴 RSS / Atom 订阅地址，或上传本地插件配置包
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-500">
                    订阅地址
                  </label>
                  <input
                    type="url"
                    value={importFeedUrl}
                    onChange={e => setImportFeedUrl(e.target.value)}
                    placeholder="https://example.com/feed.xml"
                    className={`w-full px-4 py-3 rounded-xl text-sm outline-none border ${subtleBorder} ${mutedBg} focus:border-[#5856D6]/50`}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  className={`w-full py-3 rounded-xl text-sm font-semibold text-white ${PRIMARY}`}
                >
                  导入并安装
                </button>
                <div
                  className={`rounded-2xl border border-dashed ${subtleBorder} p-10 text-center`}
                >
                  <p className="text-sm text-neutral-400">
                    拖拽 .json / .orbit-plugin 到此处
                  </p>
                  <p className="text-xs text-neutral-400 mt-2">
                    本地配置文件导入将在后续版本开放
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer
          className={`shrink-0 flex items-center justify-end gap-3 px-8 py-4 border-t ${subtleBorder}`}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            关闭并返回
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl ${PRIMARY} shadow-lg shadow-indigo-500/20 transition-colors`}
          >
            完成保存并同步大盘
          </button>
        </footer>
      </div>
    </div>
  );
}
