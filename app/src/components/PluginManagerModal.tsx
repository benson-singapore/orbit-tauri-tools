import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { PluginAvatar } from "@/components/PluginAvatar";
import {
  fetchMarketPlugins,
  fetchPluginTypeDicts,
  parseMarketPluginZhTags,
} from "@/lib/orbitApi";
import { fetchPluginManifest, installOrbitPackage } from "@/lib/feed";
import { slugifyChannelId } from "@/lib/channelId";
import { waitForRuntimeReady } from "@/lib/runtime";
import type { PluginSidebarGroup } from "@/lib/pluginGroups";
import { DEFAULT_PLUGIN_GROUP_ID } from "@/lib/pluginGroups";
import type {
  InstallRSSPluginRequest,
  MarketPluginItem,
  MarketPluginSort,
  Plugin,
  PluginContentType,
  PluginManagerTab,
  PluginMarketCategory,
  ThemeMode,
} from "@/types";

const MODAL_HEIGHT = "h-[660px]";
const PRIMARY = "bg-[#5856D6] hover:bg-[#4a48c4]";

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

type ChannelFormRow = {
  _key: string;
  id: string;
  label: string;
  feedUrl: string;
  itemLimit: string;
  /** 为 true 时，修改名称会自动更新 id */
  idAuto: boolean;
};

function createChannelRow(
  partial: Partial<Pick<ChannelFormRow, "id" | "label" | "feedUrl" | "itemLimit">> = {},
  options?: { idAuto?: boolean },
): ChannelFormRow {
  const label = partial.label ?? "全部";
  const idAuto = options?.idAuto ?? partial.id === undefined;
  const id =
    partial.id ??
    (idAuto ? slugifyChannelId(label) || "main" : "main");
  return {
    _key: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    id,
    label,
    feedUrl: partial.feedUrl ?? "",
    itemLimit: partial.itemLimit ?? "100",
    idAuto,
  };
}

/** id 仍随名称自动同步（含默认 main / 全部，或 id 与当前名称 slug 一致） */
function isChannelIdSyncedWithLabel(row: ChannelFormRow): boolean {
  if (row.idAuto) return true;
  const slug = slugifyChannelId(row.label);
  if (slug && row.id === slug) return true;
  return row.id === "main" && row.label === "全部";
}

type WasmChannelFormRow = {
  _key: string;
  id: string;
  label: string;
  route: string;
  params: string;
  itemLimit: string;
  idAuto: boolean;
};

function createWasmChannelRow(
  partial: Partial<Pick<WasmChannelFormRow, "id" | "label" | "route" | "params" | "itemLimit">> = {},
  options?: { idAuto?: boolean },
): WasmChannelFormRow {
  const label = partial.label ?? "默认";
  const idAuto = options?.idAuto ?? partial.id === undefined;
  const id =
    partial.id ??
    (idAuto ? slugifyChannelId(label) || "main" : "main");
  return {
    _key: `wch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    id,
    label,
    route: partial.route ?? "",
    params: partial.params ?? "",
    itemLimit: partial.itemLimit ?? "100",
    idAuto,
  };
}

function isWasmChannelIdSyncedWithLabel(row: WasmChannelFormRow): boolean {
  if (row.idAuto) return true;
  const slug = slugifyChannelId(row.label);
  if (slug && row.id === slug) return true;
  return row.id === "main" && row.label === "默认";
}

function parseWasmChannelParams(paramsStr: string): Record<string, string> | undefined {
  const trimmed = paramsStr.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("params 须为 JSON 对象");
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    result[k] = String(v);
  }
  return result;
}

interface PluginManagerModalProps {
  theme: ThemeMode;
  myPlugins: Plugin[];
  pluginGroups: PluginSidebarGroup[];
  groupedPluginsForManage: { group: PluginSidebarGroup; plugins: Plugin[] }[];
  onClose: () => void;
  onInstall: (marketId: string) => Promise<void>;
  onSaveManifest: (pluginId: string, manifestText: string) => Promise<void>;
  onUninstall: (id: string) => void | Promise<void>;
  onToggleActive: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReorder: (orderedIds: string[]) => void;
  onImport: (payload: InstallRSSPluginRequest, targetGroupId?: string) => void;
  onRefresh: () => void;
  onForceRefresh: (pluginId: string) => Promise<void>;
  onAssignPluginGroup: (pluginId: string, groupId: string) => void;
  onAddPluginGroup: (label: string) => void;
  onRenamePluginGroup: (groupId: string, label: string) => void;
  onMovePluginGroup: (groupId: string, direction: "up" | "down") => void;
  onRemovePluginGroup: (groupId: string) => void;
  getPluginGroupId: (pluginId: string) => string;
  embedded?: boolean;
}

const TABS: { id: Extract<PluginManagerTab, "market" | "manage">; label: string; icon: string }[] = [
  { id: "market", label: "插件市场", icon: "sparkles" },
  { id: "manage", label: "已安装插件", icon: "puzzle" },
];

function StyledSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={`orbit-select w-full appearance-none px-4 py-3 pr-10 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${className}`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M3 4.5 6 7.5 9 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

const MARKET_SORT_OPTIONS: { id: MarketPluginSort; label: string }[] = [
  { id: "rating", label: "评分" },
  { id: "downloads", label: "安装量" },
  { id: "size", label: "文件大小" },
];

const MARKET_TAG_COLOR_CLASS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 border-blue-200",
  green: "bg-emerald-50 text-emerald-600 border-emerald-200",
  amber: "bg-amber-50 text-amber-600 border-amber-200",
  rose: "bg-rose-50 text-rose-600 border-rose-200",
  violet: "bg-violet-50 text-violet-600 border-violet-200",
};

function MarketStarRating({ stars }: { stars?: number }) {
  const value = typeof stars === "number" ? Math.max(0, Math.min(5, stars)) : 0;
  return (
    <div className="flex items-center gap-0.5" aria-label={`评分 ${value.toFixed(1)} / 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const fill = value - index;
        if (fill >= 1) {
          return <Icon key={index} name="star" className="w-3.5 h-3.5 text-amber-400" />;
        }
        if (fill >= 0.5) {
          return (
            <span key={index} className="relative w-3.5 h-3.5">
              <Icon name="star-outline" className="absolute inset-0 w-3.5 h-3.5 text-amber-300" />
              <span className="absolute inset-0 w-1/2 overflow-hidden">
                <Icon name="star" className="w-3.5 h-3.5 text-amber-400" />
              </span>
            </span>
          );
        }
        return <Icon key={index} name="star-outline" className="w-3.5 h-3.5 text-amber-300" />;
      })}
    </div>
  );
}

function findInstalledMarketPlugin(
  marketItem: MarketPluginItem,
  installedPlugins: Plugin[],
): Plugin | undefined {
  const name = marketItem.name.trim().toLowerCase();
  const logo = marketItem.logoUrl?.trim();
  return installedPlugins.find(item => {
    if (item.id === "all") return false;
    if (item.name.trim().toLowerCase() === name) return true;
    if (logo && item.logoImageUrl?.trim() === logo) return true;
    return false;
  });
}

function MarketPluginCard({
  plugin,
  categoryLabel,
  subtleBorder,
  installedPlugin,
  installing,
  onInstall,
}: {
  plugin: MarketPluginItem;
  categoryLabel?: string;
  subtleBorder: string;
  installedPlugin?: Plugin;
  installing: boolean;
  onInstall: (marketId: string) => Promise<void>;
}) {
  const color = plugin.colorClass?.trim() || plugin.accentColor || "#7c3aed";
  const useBgClass = color.startsWith("bg-");
  const zhTags = parseMarketPluginZhTags(plugin.longDesc);
  const featuredTagClass =
    MARKET_TAG_COLOR_CLASS[plugin.tagColor ?? "blue"]
    ?? MARKET_TAG_COLOR_CLASS.blue;

  return (
    <article
      className={`flex flex-col p-4 rounded-2xl border ${subtleBorder} bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md hover:border-[#5856D6]/30 transition-colors`}
    >
      <div className="flex items-start gap-3 mb-3">
        {plugin.logoUrl ? (
          <img
            src={plugin.logoUrl}
            alt=""
            className="h-11 w-auto max-w-[5.5rem] shrink-0 object-contain"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className={`w-11 h-11 shrink-0 rounded-xl overflow-hidden flex items-center justify-center font-bold text-white text-sm ${
              useBgClass ? color : ""
            }`}
            style={useBgClass ? undefined : { backgroundColor: color }}
          >
            <span>{(plugin.name || "").trim().slice(0, 1) || "★"}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-bold leading-snug text-neutral-900 dark:text-white">{plugin.name}</h3>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {categoryLabel ? (
              <span
                className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${featuredTagClass}`}
              >
                {categoryLabel}
              </span>
            ) : null}
            {zhTags.map(tag => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed line-clamp-2 mb-3">{plugin.desc}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] mb-3">
        {plugin.size ? <span className="text-neutral-400">{plugin.size}</span> : null}
        <MarketStarRating stars={plugin.stars} />
        <span className="inline-flex items-center gap-1 text-neutral-400">
          <Icon name="download" className="w-3 h-3" />
          {plugin.downloads ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-500">
          <Icon name="thumbs-up" className="w-3 h-3" />
          {plugin.upvotes ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 text-rose-500">
          <Icon name="thumbs-down" className="w-3 h-3" />
          {plugin.downvotes ?? 0}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 !-mt-[5px] -mb-[5px] border-t border-dashed border-neutral-100 dark:border-neutral-800">
        {plugin.author ? (
          <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-neutral-400">
            {plugin.authorAvatarUrl ? (
              <img
                src={plugin.authorAvatarUrl}
                alt=""
                className="w-4 h-4 rounded-full object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <span className="truncate">作者 {plugin.author}</span>
          </div>
        ) : (
          <span />
        )}
        {installedPlugin ? (
          <button
            type="button"
            disabled
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50 cursor-not-allowed"
          >
            <Icon name="check" className="w-3 h-3" />
            已安装
          </button>
        ) : (
          <button
            type="button"
            disabled={installing}
            onClick={() => {
              void onInstall(plugin.id).catch(console.error);
            }}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name={installing ? "refresh" : "download"} className={`w-3 h-3 ${installing ? "animate-spin" : ""}`} />
            {installing ? "安装中…" : "插件安装"}
          </button>
        )}
      </div>
    </article>
  );
}

interface PluginSectionProps {
  plugins: Plugin[];
  installedPlugins: Plugin[];
  subtleBorder: string;
  mutedBg: string;
  inputBg: string;
  inputBorder: string;
  pluginGroups: PluginSidebarGroup[];
  onUninstall: (id: string) => void;
  onToggleActive: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReorder: (orderedIds: string[]) => void;
  onAssignGroup: (pluginId: string, groupId: string) => void;
  resolveGroupId: (pluginId: string) => string;
  onEdit?: (plugin: Plugin) => void;
  onForceRefresh: (pluginId: string) => Promise<void>;
}

function PluginSection(props: PluginSectionProps) {
  const {
    plugins,
    installedPlugins,
    subtleBorder,
    mutedBg,
    inputBg,
    inputBorder,
    pluginGroups,
    onUninstall,
    onToggleActive,
    onMove,
    onReorder,
    onAssignGroup,
    resolveGroupId,
    onEdit,
    onForceRefresh,
  } = props;
  const [draggingPluginId, setDraggingPluginId] = useState<string | null>(null);
  const [dragOverPluginId, setDragOverPluginId] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<Plugin | null>(null);
  const [forceRefreshingId, setForceRefreshingId] = useState<string | null>(null);
  const [forceRefreshError, setForceRefreshError] = useState<string | null>(null);

  const handleDropReorder = (targetPluginId: string) => {
    if (!draggingPluginId || draggingPluginId === targetPluginId) {
      setDragOverPluginId(null);
      return;
    }
    const fromIndex = installedPlugins.findIndex(p => p.id === draggingPluginId);
    const toIndex = installedPlugins.findIndex(p => p.id === targetPluginId);
    if (fromIndex < 0 || toIndex < 0) {
      setDragOverPluginId(null);
      return;
    }

    const next = [...installedPlugins];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      setDragOverPluginId(null);
      return;
    }
    next.splice(toIndex, 0, moved);
    onReorder(next.map(plugin => plugin.id));
    setDragOverPluginId(null);
  };

  return (
    <div className="space-y-3">
      {forceRefreshError && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 px-1">
          {forceRefreshError}
        </p>
      )}
      {plugins.map((plugin) => {
        const index = installedPlugins.findIndex(p => p.id === plugin.id);
        const isEnabled = plugin.active !== false;
        const canMoveUp = index > 0;
        const canMoveDown = index < installedPlugins.length - 1;
        const isCustom = !plugin.official;
        const isWasm = plugin.source === "wasm";
        const canEditManifest = isCustom || isWasm;
        const cardClass = isCustom
          ? "border border-indigo-200/70 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/10"
          : `border ${subtleBorder} ${mutedBg}`;
        const currentGroupId = resolveGroupId(plugin.id);

        return (
          <article
            key={plugin.id}
            className={`rounded-2xl transition-colors ${cardClass} ${dragOverPluginId === plugin.id ? "ring-2 ring-[#5856D6]/35" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverPluginId(plugin.id);
            }}
            onDragLeave={() => {
              if (dragOverPluginId === plugin.id) {
                setDragOverPluginId(null);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDropReorder(plugin.id);
            }}
          >
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-5">
              <div className="shrink-0 flex items-center gap-2 lg:pr-4 lg:mr-1 lg:border-r lg:border-neutral-200/70 dark:lg:border-neutral-800">
                <button
                  type="button"
                  draggable
                  onDragStart={() => {
                    setDraggingPluginId(plugin.id);
                  }}
                  onDragEnd={() => {
                    setDraggingPluginId(null);
                    setDragOverPluginId(null);
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white cursor-grab active:cursor-grabbing dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  title="拖拽排序"
                  aria-label="拖拽排序"
                >
                  <span aria-hidden className="text-[10px] leading-none">⋮⋮</span>
                </button>
                <button
                  type="button"
                  disabled={!canMoveUp}
                  onClick={() => onMove(plugin.id, "up")}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  title="上移"
                  aria-label="上移"
                >
                  <span aria-hidden className="text-[10px] leading-none">↑</span>
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown}
                  onClick={() => onMove(plugin.id, "down")}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  title="下移"
                  aria-label="下移"
                >
                  <span aria-hidden className="text-[10px] leading-none">↓</span>
                </button>
              </div>
              <div className="flex flex-1 min-w-0 items-start gap-3">
                <PluginAvatar plugin={plugin} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold">{plugin.name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono tabular-nums bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                      title="排序权重（越小越靠前）"
                    >
                      sort {typeof plugin.sort === "number" ? plugin.sort : index}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isCustom ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300" : "bg-neutral-200/80 dark:bg-neutral-700 text-neutral-500"}`}>
                      {isCustom ? "自定义" : "官方"}
                    </span>
                    {pluginGroups.length > 0 && (
                      <label className="flex items-center gap-1">
                        <span className="text-[10px] text-neutral-400">分组</span>
                        <select
                          value={currentGroupId}
                          onChange={e => onAssignGroup(plugin.id, e.target.value)}
                          className={`orbit-select text-[10px] py-0.5 pl-1.5 pr-6 rounded-md border ${inputBorder} ${inputBg}`}
                        >
                          {pluginGroups.map(g => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {canEditManifest && (
                      <button
                        type="button"
                        onClick={() => onEdit?.(plugin)}
                        className="px-2 py-0.5 text-[10px] font-medium rounded text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                      >
                        编辑配置
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    {plugin.desc}
                  </p>
                </div>
              </div>

              <div className="lg:pl-4 lg:border-l lg:border-neutral-200/70 dark:lg:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => onToggleActive(plugin.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                      isEnabled ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"
                    }`}
                    title={isEnabled ? "点击停用" : "点击启用"}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        isEnabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className={`text-[11px] font-medium ${isEnabled ? "text-emerald-600" : "text-neutral-500"}`}>
                    {isEnabled ? "已启用" : "已停用"}
                  </span>
                  <button
                    type="button"
                    disabled={!isEnabled || forceRefreshingId === plugin.id}
                    onClick={() => {
                      setForceRefreshError(null);
                      setForceRefreshingId(plugin.id);
                      void onForceRefresh(plugin.id)
                        .catch((err: unknown) => {
                          const message = err instanceof Error ? err.message : String(err);
                          setForceRefreshError(`${plugin.name}：${message}`);
                          console.error(err);
                        })
                        .finally(() => setForceRefreshingId(null));
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title="清空本地缓存并重新抓取最新内容"
                  >
                    <Icon
                      name="refresh"
                      className={`w-3 h-3 ${forceRefreshingId === plugin.id ? "animate-spin" : ""}`}
                    />
                    {forceRefreshingId === plugin.id ? "抓取中…" : "强制刷新"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUninstallTarget(plugin)}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                  >
                    卸载插件
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}

      {uninstallTarget && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6"
          onClick={() => setUninstallTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-[24px] border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-[#141416] dark:text-white"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="uninstall-confirm-title"
          >
            <h4 id="uninstall-confirm-title" className="text-sm font-bold">
              确认卸载插件
            </h4>
            <p className="text-[11px] mt-2 text-neutral-500 dark:text-neutral-400 leading-relaxed">
              确定要卸载「{uninstallTarget.name}」吗？卸载后插件配置将从本地移除，此操作不可恢复。
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setUninstallTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900/50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onUninstall(uninstallTarget.id);
                  setUninstallTarget(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700"
              >
                确认卸载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WasmManifestEditorModal({
  theme,
  plugin,
  onClose,
  onSave,
}: {
  theme: ThemeMode;
  plugin: Plugin;
  onClose: () => void;
  onSave: (manifestText: string) => Promise<void>;
}) {
  const isDark = theme === "dark";
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const mutedBg = isDark ? "bg-neutral-900/50" : "bg-neutral-50";
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
  const inputBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const inputText = isDark ? "text-neutral-100 placeholder:text-neutral-500" : "text-neutral-900 placeholder:text-neutral-400";

  const baseManifestRef = useRef<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [isEditingJson, setIsEditingJson] = useState(false);

  const [pluginName, setPluginName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [mediaType, setMediaType] = useState<NonNullable<InstallRSSPluginRequest["mediaType"]>>("article");
  const [channels, setChannels] = useState<WasmChannelFormRow[]>([
    createWasmChannelRow({ label: "默认" }, { idAuto: true }),
  ]);
  const [defaultChannel, setDefaultChannel] = useState("");
  const [refreshInterval, setRefreshInterval] = useState("3600");
  const [userAgent, setUserAgent] = useState("");
  const [executionMode, setExecutionMode] = useState("wasm");
  const [wasmEntry, setWasmEntry] = useState("plugin.wasm");
  const [wasmTimeoutMs, setWasmTimeoutMs] = useState("30000");
  const [wasmMaxMemoryMB, setWasmMaxMemoryMB] = useState("64");
  const [icon, setIcon] = useState<PluginContentType>("text");
  const [marketCategory, setMarketCategory] = useState<Exclude<PluginMarketCategory, "all">>("blog");
  const [categoryTag, setCategoryTag] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#7c3aed");
  const [logoImageUrl, setLogoImageUrl] = useState("");

  const applyManifestToForm = (raw: Record<string, unknown>) => {
    const config = (raw.config ?? {}) as Record<string, unknown>;
    const meta = (raw.meta ?? {}) as Record<string, unknown>;
    const wasm = (config.wasm ?? {}) as Record<string, unknown>;

    setPluginName(typeof raw.name === "string" ? raw.name : "");
    setVersion(typeof raw.version === "string" ? raw.version : "1.0.0");
    const nextMediaType = typeof raw.mediaType === "string" ? raw.mediaType : "article";
    if (nextMediaType === "article" || nextMediaType === "manga" || nextMediaType === "video" || nextMediaType === "audio") {
      setMediaType(nextMediaType);
    }

    const rawChannels = Array.isArray(config.channels)
      ? (config.channels as { id?: string; label?: string; route?: string; params?: Record<string, string>; itemLimit?: number }[])
      : [];
    if (rawChannels.length > 0) {
      setChannels(
        rawChannels.map((ch, i) =>
          createWasmChannelRow(
            {
              id: String(ch.id ?? `channel-${i + 1}`).trim(),
              label: String(ch.label ?? ch.id ?? `频道 ${i + 1}`).trim(),
              route: String(ch.route ?? "").trim(),
              params: ch.params ? JSON.stringify(ch.params) : "",
              itemLimit: String(
                typeof ch.itemLimit === "number" && ch.itemLimit > 0 ? ch.itemLimit : 100,
              ),
            },
            { idAuto: false },
          ),
        ),
      );
    } else {
      setChannels([createWasmChannelRow({ label: "默认" }, { idAuto: true })]);
    }

    setDefaultChannel(typeof config.defaultChannel === "string" ? config.defaultChannel : "");
    const nextRefresh =
      typeof config.refreshInterval === "number" && config.refreshInterval > 0
        ? config.refreshInterval
        : 3600;
    setRefreshInterval(String(nextRefresh));
    setUserAgent(typeof config.userAgent === "string" ? config.userAgent : "");
    setExecutionMode(typeof config.executionMode === "string" ? config.executionMode : "wasm");
    setWasmEntry(typeof wasm.entry === "string" ? wasm.entry : "plugin.wasm");
    setWasmTimeoutMs(
      String(typeof wasm.timeoutMs === "number" && wasm.timeoutMs > 0 ? wasm.timeoutMs : 30000),
    );
    setWasmMaxMemoryMB(
      String(typeof wasm.maxMemoryMB === "number" && wasm.maxMemoryMB > 0 ? wasm.maxMemoryMB : 64),
    );

    const nextIcon = typeof meta.icon === "string" ? meta.icon : "text";
    if (nextIcon === "text" || nextIcon === "image" || nextIcon === "video" || nextIcon === "audio") {
      setIcon(nextIcon);
    }
    const nextMarketCategory =
      typeof meta.marketCategory === "string" ? meta.marketCategory : "blog";
    if (
      nextMarketCategory === "blog" ||
      nextMarketCategory === "news" ||
      nextMarketCategory === "manga" ||
      nextMarketCategory === "video" ||
      nextMarketCategory === "audio"
    ) {
      setMarketCategory(nextMarketCategory);
    }
    setCategoryTag(typeof meta.categoryTag === "string" ? meta.categoryTag : "");
    setDescription(typeof meta.description === "string" ? meta.description : "");
    const nextColor =
      typeof meta.color === "string"
        ? meta.color
        : typeof meta.iconColor === "string"
          ? meta.iconColor
          : "#7c3aed";
    setColor(nextColor);
    const nextLogo =
      typeof meta.logoImageUrl === "string"
        ? meta.logoImageUrl
        : typeof meta.iconUrl === "string"
          ? meta.iconUrl
          : "";
    setLogoImageUrl(nextLogo);
  };

  const buildManifestFromForm = (): Record<string, unknown> => {
    const manifest = JSON.parse(JSON.stringify(baseManifestRef.current)) as Record<string, unknown>;
    manifest.name = pluginName.trim() || manifest.name;
    manifest.version = version.trim() || "1.0.0";
    manifest.mediaType = mediaType;

    const config = (manifest.config ?? {}) as Record<string, unknown>;
    config.channels = channels.map(ch => {
      const parsedLimit = Number.parseInt(ch.itemLimit.trim(), 10);
      const item: Record<string, unknown> = {
        id: ch.id.trim(),
        label: ch.label.trim(),
        route: ch.route.trim(),
      };
      const params = parseWasmChannelParams(ch.params);
      if (params && Object.keys(params).length > 0) {
        item.params = params;
      }
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        item.itemLimit = parsedLimit;
      }
      return item;
    });
    const dc = defaultChannel.trim();
    if (dc) {
      config.defaultChannel = dc;
    } else {
      delete config.defaultChannel;
    }
    const parsedRefresh = Number.parseInt(refreshInterval.trim(), 10);
    config.refreshInterval =
      Number.isFinite(parsedRefresh) && parsedRefresh > 0 ? parsedRefresh : 3600;
    config.userAgent = userAgent.trim();
    const mode = executionMode.trim();
    if (mode) {
      config.executionMode = mode;
    }

    const wasm = (config.wasm ?? {}) as Record<string, unknown>;
    wasm.entry = wasmEntry.trim() || "plugin.wasm";
    const parsedTimeout = Number.parseInt(wasmTimeoutMs.trim(), 10);
    wasm.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30000;
    const parsedMemory = Number.parseInt(wasmMaxMemoryMB.trim(), 10);
    wasm.maxMemoryMB = Number.isFinite(parsedMemory) && parsedMemory > 0 ? parsedMemory : 64;
    config.wasm = wasm;
    manifest.config = config;

    const meta = (manifest.meta ?? {}) as Record<string, unknown>;
    meta.description = description.trim();
    meta.icon = icon;
    meta.color = color.trim();
    meta.marketCategory = marketCategory;
    meta.categoryTag = categoryTag.trim();
    const logoUrl = logoImageUrl.trim();
    if (logoUrl) {
      meta.logoImageUrl = logoUrl;
      meta.iconUrl = logoUrl;
    }
    manifest.meta = meta;

    baseManifestRef.current = manifest;
    return manifest;
  };

  const buildManifestJsonText = () => JSON.stringify(buildManifestFromForm(), null, 2);

  const applyJsonToForm = (input: string): boolean => {
    if (!input.trim()) return true;
    try {
      const raw = JSON.parse(input) as Record<string, unknown>;
      baseManifestRef.current = raw;
      applyManifestToForm(raw);
      setError(null);
      return true;
    } catch {
      setError("manifest JSON 格式错误，请检查配置内容");
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPluginManifest(plugin.id)
      .then(text => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          baseManifestRef.current = parsed;
          applyManifestToForm(parsed);
          setJsonText(JSON.stringify(parsed, null, 2));
          setError(null);
        } catch {
          setJsonText(text);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id]);

  useEffect(() => {
    if (loading || isEditingJson || viewMode !== "form") return;
    setJsonText(buildManifestJsonText());
  }, [
    loading,
    isEditingJson,
    viewMode,
    pluginName,
    version,
    mediaType,
    channels,
    defaultChannel,
    refreshInterval,
    userAgent,
    executionMode,
    wasmEntry,
    wasmTimeoutMs,
    wasmMaxMemoryMB,
    icon,
    marketCategory,
    categoryTag,
    description,
    color,
    logoImageUrl,
  ]);

  const validateBeforeSave = (): string | null => {
    if (viewMode === "json") {
      if (!applyJsonToForm(jsonText)) {
        return "invalid-json";
      }
    }

    const normalizedChannels = channels.map(ch => ({
      id: ch.id.trim(),
      label: ch.label.trim(),
      route: ch.route.trim(),
      params: ch.params,
    }));

    if (normalizedChannels.length === 0) {
      return "请至少配置一个频道";
    }
    for (const ch of normalizedChannels) {
      if (!ch.id || !ch.label || !ch.route) {
        return "每个频道需填写 ID、名称与 route";
      }
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(ch.id)) {
        return `频道 ID「${ch.id}」格式无效`;
      }
      try {
        if (ch.params.trim()) {
          parseWasmChannelParams(ch.params);
        }
      } catch (e) {
        return `频道「${ch.label}」的 params 无效：${e instanceof Error ? e.message : String(e)}`;
      }
    }

    const dc = defaultChannel.trim();
    if (dc && !normalizedChannels.some(ch => ch.id === dc)) {
      return `defaultChannel「${dc}」不在 channels 列表中`;
    }

    const parsedRefresh = Number.parseInt(refreshInterval.trim(), 10);
    if (!Number.isFinite(parsedRefresh) || parsedRefresh <= 0) {
      return "刷新间隔需为正整数（秒）";
    }

    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const validationError = validateBeforeSave();
      if (validationError) {
        if (validationError !== "invalid-json") {
          setError(validationError);
        }
        return;
      }
      const text = buildManifestJsonText();
      JSON.parse(text);
      await onSave(text);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className={`w-full max-w-6xl h-[690px] rounded-[28px] overflow-hidden border shadow-2xl ${panelBg} ${subtleBorder}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`h-[72px] px-6 flex items-center justify-between border-b ${subtleBorder}`}>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">编辑插件 manifest — {plugin.name}</h3>
            <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              修改 channels、refreshInterval、userAgent、wasm 等配置，支持可视化表单或 JSON 编辑
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center p-1 rounded-2xl ${mutedBg} border ${subtleBorder}`}>
              <button
                type="button"
                onClick={() => setViewMode("form")}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  viewMode === "form"
                    ? `${isDark ? "bg-neutral-800 text-[#B7B5FF]" : "bg-white text-[#5856D6]"} shadow-sm`
                    : `${isDark ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-500 hover:text-neutral-700"}`
                }`}
              >
                可视化配置
              </button>
              <button
                type="button"
                onClick={() => setViewMode("json")}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  viewMode === "json"
                    ? `${isDark ? "bg-neutral-800 text-[#B7B5FF]" : "bg-white text-[#5856D6]"} shadow-sm`
                    : `${isDark ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-500 hover:text-neutral-700"}`
                }`}
              >
                JSON 编辑
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 text-xs rounded-lg border ${subtleBorder} ${
                isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              关闭
            </button>
          </div>
        </div>

        <div className="h-[calc(100%-140px)] flex min-h-0">
          <main className="flex-1 min-w-0 min-h-0 flex flex-col">
            {loading ? (
              <p className={`text-sm text-center py-16 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                加载 manifest.json…
              </p>
            ) : viewMode === "form" ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-7">
                <div className="max-w-3xl mx-auto w-full">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-4 rounded-full bg-[#5856D6]" />
                    <h4 className="text-sm font-bold">核心配置</h4>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          频道 (config.channels)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setChannels(prev => [
                              ...prev,
                              createWasmChannelRow({ label: `频道 ${prev.length + 1}` }, { idAuto: true }),
                            ])
                          }
                          className="text-[11px] font-semibold text-[#5856D6] hover:underline"
                        >
                          + 添加频道
                        </button>
                      </div>
                      <div className="space-y-3">
                        {channels.map((ch, index) => (
                          <div
                            key={ch._key}
                            className={`p-4 rounded-2xl border space-y-3 ${subtleBorder} ${mutedBg}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">频道 {index + 1}</span>
                              {channels.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setChannels(prev => prev.filter((_, i) => i !== index))}
                                  className="text-[11px] text-rose-500 hover:underline"
                                >
                                  删除
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                value={ch.label}
                                onChange={e => {
                                  const v = e.target.value;
                                  setChannels(prev =>
                                    prev.map((row, i) => {
                                      if (i !== index) return row;
                                      const slug = slugifyChannelId(v);
                                      const synced = isWasmChannelIdSyncedWithLabel(row);
                                      return {
                                        ...row,
                                        label: v,
                                        ...(synced && slug ? { id: slug, idAuto: true } : {}),
                                      };
                                    }),
                                  );
                                }}
                                placeholder="显示名称"
                                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                              />
                              <input
                                value={ch.id}
                                onChange={e => {
                                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
                                  setChannels(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, id: v, idAuto: false } : row,
                                    ),
                                  );
                                }}
                                placeholder="id（根据名称自动生成）"
                                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText} ${
                                  ch.idAuto ? (isDark ? "text-neutral-400" : "text-neutral-500") : ""
                                }`}
                              />
                            </div>
                            <input
                              value={ch.route}
                              onChange={e => {
                                const v = e.target.value;
                                setChannels(prev =>
                                  prev.map((row, i) => (i === index ? { ...row, route: v } : row)),
                                );
                              }}
                              placeholder="/plugin/route"
                              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                            />
                            <div className="space-y-1">
                              <label className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                                params（JSON 对象，可选）
                              </label>
                              <input
                                value={ch.params}
                                onChange={e => {
                                  const v = e.target.value;
                                  setChannels(prev =>
                                    prev.map((row, i) => (i === index ? { ...row, params: v } : row)),
                                  );
                                }}
                                placeholder='{"category":"frontend"}'
                                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 font-mono ${inputBg} ${inputBorder} ${inputText}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                                抓取数量上限 itemLimit（默认 100）
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={ch.itemLimit}
                                onChange={e => {
                                  const v = e.target.value;
                                  setChannels(prev =>
                                    prev.map((row, i) => (i === index ? { ...row, itemLimit: v } : row)),
                                  );
                                }}
                                placeholder="100"
                                className={`w-full sm:w-40 px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          默认频道 defaultChannel
                        </label>
                        <StyledSelect
                          value={defaultChannel}
                          onChange={e => setDefaultChannel(e.target.value)}
                          className={`${inputBg} ${inputBorder} ${inputText}`}
                        >
                          <option value="">（不指定）</option>
                          {channels.map(ch => (
                            <option key={ch._key} value={ch.id.trim()}>
                              {ch.label.trim() || ch.id.trim()}
                            </option>
                          ))}
                        </StyledSelect>
                      </div>
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          刷新间隔 refreshInterval（秒）
                        </label>
                        <input
                          value={refreshInterval}
                          onChange={e => setRefreshInterval(e.target.value)}
                          placeholder="3600"
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                        User-Agent（可选）
                      </label>
                      <input
                        value={userAgent}
                        onChange={e => setUserAgent(e.target.value)}
                        placeholder="OrbitReader/0.1"
                        className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                      />
                    </div>

                    <div className={`mt-6 p-6 rounded-[24px] border ${subtleBorder} ${isDark ? "bg-neutral-950/20" : "bg-neutral-50/60"}`}>
                      <div className="flex items-center gap-2 mb-5">
                        <div className="w-1 h-4 rounded-full bg-emerald-500" />
                        <h4 className="text-sm font-bold">WASM 运行时</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                            入口文件 config.wasm.entry
                          </label>
                          <input
                            value={wasmEntry}
                            onChange={e => setWasmEntry(e.target.value)}
                            placeholder="main.wasm.br"
                            className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                            执行模式 executionMode
                          </label>
                          <StyledSelect
                            value={executionMode}
                            onChange={e => setExecutionMode(e.target.value)}
                            className={`${inputBg} ${inputBorder} ${inputText}`}
                          >
                            <option value="wasm">wasm</option>
                            <option value="browser">browser</option>
                            <option value="hybrid">hybrid</option>
                          </StyledSelect>
                        </div>
                        <div className="space-y-1.5">
                          <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                            超时 timeoutMs（毫秒）
                          </label>
                          <input
                            value={wasmTimeoutMs}
                            onChange={e => setWasmTimeoutMs(e.target.value)}
                            placeholder="30000"
                            className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                            内存上限 maxMemoryMB
                          </label>
                          <input
                            value={wasmMaxMemoryMB}
                            onChange={e => setWasmMaxMemoryMB(e.target.value)}
                            placeholder="64"
                            className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          插件名称
                        </label>
                        <input
                          value={pluginName}
                          onChange={e => setPluginName(e.target.value)}
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          版本 version
                        </label>
                        <input
                          value={version}
                          onChange={e => setVersion(e.target.value)}
                          placeholder="1.0.0"
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          插件 ID（只读）
                        </label>
                        <input
                          value={plugin.id}
                          readOnly
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none ${inputBg} ${inputBorder} ${
                            isDark ? "text-neutral-500" : "text-neutral-400"
                          }`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          媒体类型 mediaType
                        </label>
                        <StyledSelect
                          value={mediaType}
                          onChange={e =>
                            setMediaType(
                              e.target.value as NonNullable<InstallRSSPluginRequest["mediaType"]>,
                            )
                          }
                          className={`${inputBg} ${inputBorder} ${inputText}`}
                        >
                          <option value="article">article</option>
                          <option value="manga">manga</option>
                          <option value="video">video</option>
                          <option value="audio">audio</option>
                        </StyledSelect>
                      </div>
                    </div>

                    <div className={`mt-2 p-6 rounded-[24px] border ${subtleBorder} ${isDark ? "bg-neutral-950/20" : "bg-neutral-50/60"}`}>
                      <div className="flex items-center gap-2 mb-5">
                        <div className="w-1 h-4 rounded-full bg-orange-500" />
                        <h4 className="text-sm font-bold">品牌与展示</h4>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-start gap-6">
                        <div className="shrink-0 w-full md:w-[200px]">
                          <PluginAvatar
                            plugin={{
                              name: pluginName || plugin.name,
                              color,
                              iconUrl: logoImageUrl,
                              logoImageUrl,
                            }}
                            className="w-16 h-16 rounded-2xl shadow-lg"
                            textClassName="text-2xl font-black"
                          />
                          <div className="mt-4 space-y-1.5">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                              颜色
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={/^#([0-9a-fA-F]{6})$/.test(color.trim()) ? color.trim() : "#7c3aed"}
                                onChange={e => setColor(e.target.value)}
                                className="h-10 w-12 rounded-xl border border-neutral-200 p-1 bg-white"
                              />
                              <input
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                placeholder="#7c3aed 或 bg-blue-500"
                                className={`flex-1 px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                              图标类型
                            </label>
                            <StyledSelect
                              value={icon}
                              onChange={e => setIcon(e.target.value as PluginContentType)}
                              className={`${inputBg} ${inputBorder} ${inputText}`}
                            >
                              <option value="text">文章适应排版</option>
                              <option value="image">漫画/图片</option>
                              <option value="video">视频</option>
                              <option value="audio">音频</option>
                            </StyledSelect>
                          </div>
                          <div className="space-y-1.5">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                              排版分类大区
                            </label>
                            <StyledSelect
                              value={marketCategory}
                              onChange={e =>
                                setMarketCategory(
                                  e.target.value as Exclude<PluginMarketCategory, "all">,
                                )
                              }
                              className={`${inputBg} ${inputBorder} ${inputText}`}
                            >
                              <option value="blog">个人博客</option>
                              <option value="news">新闻资讯</option>
                              <option value="manga">二次元漫画</option>
                              <option value="video">流媒体/视频</option>
                              <option value="audio">有声播客</option>
                            </StyledSelect>
                          </div>
                          <div className="space-y-1.5">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                              分类标签
                            </label>
                            <input
                              value={categoryTag}
                              onChange={e => setCategoryTag(e.target.value)}
                              className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                              图标图片 URL（可选）
                            </label>
                            <input
                              value={logoImageUrl}
                              onChange={e => setLogoImageUrl(e.target.value)}
                              placeholder="https://example.com/icon.png"
                              className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                              描述 description
                            </label>
                            <input
                              value={description}
                              onChange={e => setDescription(e.target.value)}
                              className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden p-7">
                <div className={`h-full rounded-[22px] overflow-hidden border ${subtleBorder} ${isDark ? "bg-[#0b0f12]" : "bg-neutral-950"}`}>
                  <div className={`px-5 py-3 border-b ${isDark ? "border-neutral-800" : "border-neutral-900"} text-xs flex items-center justify-between`}>
                    <span className={isDark ? "text-neutral-400" : "text-neutral-400"}>manifest.json</span>
                    <span className="text-emerald-400">● WASM 配置</span>
                  </div>
                  <textarea
                    value={jsonText}
                    onFocus={() => setIsEditingJson(true)}
                    onChange={e => {
                      const next = e.target.value;
                      setJsonText(next);
                      applyJsonToForm(next);
                    }}
                    onBlur={() => {
                      setIsEditingJson(false);
                      if (applyJsonToForm(jsonText)) {
                        setJsonText(buildManifestJsonText());
                      }
                    }}
                    spellCheck={false}
                    className="w-full h-[calc(100%-48px)] bg-transparent p-5 text-[12px] leading-6 font-mono text-[#58f5d3] resize-none outline-none"
                  />
                </div>
                {error && <p className="text-xs text-rose-500 mt-3">{error}</p>}
              </div>
            )}
          </main>
        </div>

        <div className={`h-[68px] px-8 flex items-center justify-between border-t ${subtleBorder}`}>
          <div className={`text-[11px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
            {viewMode === "json"
              ? "提示：JSON 模式会绕过部分表单校验，保存前请确认语法正确。"
              : "保存后会立即同步到运行时插件目录。"}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border ${subtleBorder} ${
                isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              取消
            </button>
            <button
              type="button"
              disabled={loading || saving}
              onClick={() => {
                void handleSave();
              }}
              className={`px-5 py-2 rounded-xl text-xs font-semibold text-white ${PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? "保存中…" : "保存 manifest"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportPluginModal({
  theme,
  onClose,
  onImport,
  onOrbitImport,
  initialPlugin,
}: {
  theme: ThemeMode;
  onClose: () => void;
  onImport: (payload: InstallRSSPluginRequest) => void;
  onOrbitImport?: (file: File) => Promise<void>;
  initialPlugin?: Plugin | null;
}) {
  const isDark = theme === "dark";
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const mutedBg = isDark ? "bg-neutral-900/50" : "bg-neutral-50";
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
  const inputBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const inputText = isDark ? "text-neutral-100 placeholder:text-neutral-500" : "text-neutral-900 placeholder:text-neutral-400";

  const [pluginId, setPluginId] = useState("");
  const [pluginName, setPluginName] = useState("");
  const [marketCategory, setMarketCategory] = useState<Exclude<PluginMarketCategory, "all">>("blog");
  const [icon, setIcon] = useState<PluginContentType>("text");
  const [mediaType, setMediaType] = useState<NonNullable<InstallRSSPluginRequest["mediaType"]>>("article");
  const [channels, setChannels] = useState<ChannelFormRow[]>([
    createChannelRow({ label: "全部" }, { idAuto: true }),
  ]);
  const [refreshInterval, setRefreshInterval] = useState("3600");
  const [userAgent, setUserAgent] = useState("");
  const [categoryTag, setCategoryTag] = useState("NEWS");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#7c3aed");
  const [logoImageUrl, setLogoImageUrl] = useState("");
  const [logoSourceUrl, setLogoSourceUrl] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [showLogoUploadModal, setShowLogoUploadModal] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState("");
  const [isEditingJson, setIsEditingJson] = useState(false);
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [importSource, setImportSource] = useState<"rss" | "wasm">("rss");
  const [orbitFile, setOrbitFile] = useState<File | null>(null);
  const [isInstallingOrbit, setIsInstallingOrbit] = useState(false);
  const orbitFileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const logoLetter = pluginName.trim().slice(0, 1) || "R";
  const isTailwindBg = color.trim().startsWith("bg-");

  useEffect(() => {
    if (!initialPlugin) return;
    setPluginId(initialPlugin.id);
    setPluginName(initialPlugin.name);
    setMarketCategory(initialPlugin.marketCategory ?? "blog");
    if (
      initialPlugin.icon === "text" ||
      initialPlugin.icon === "image" ||
      initialPlugin.icon === "video" ||
      initialPlugin.icon === "audio"
    ) {
      setIcon(initialPlugin.icon);
    }
    setColor(initialPlugin.color);
    setLogoImageUrl(initialPlugin.logoImageUrl ?? "");
    setLogoSourceUrl(initialPlugin.logoImageUrl ?? "");
    if (initialPlugin.channels?.length) {
      setChannels(
        initialPlugin.channels.map(ch =>
          createChannelRow(
            {
              id: ch.id,
              label: ch.label,
              feedUrl: ch.feedUrl ?? "",
              itemLimit: String(ch.itemLimit ?? 100),
            },
            { idAuto: false },
          ),
        ),
      );
    } else {
      setChannels([createChannelRow({ label: "全部" }, { idAuto: true })]);
    }
    setRefreshInterval(String(initialPlugin.refreshInterval ?? 3600));
    setUserAgent(initialPlugin.userAgent ?? "");
    if (
      initialPlugin.mediaType === "article" ||
      initialPlugin.mediaType === "manga" ||
      initialPlugin.mediaType === "video" ||
      initialPlugin.mediaType === "audio"
    ) {
      setMediaType(initialPlugin.mediaType);
    }
    setCategoryTag(initialPlugin.categoryTag ?? "NEWS");
    setDescription(initialPlugin.desc);
  }, [initialPlugin]);

  const buildPayloadFromForm = (): InstallRSSPluginRequest => {
    const parsedRefresh = Number.parseInt(refreshInterval.trim(), 10);
    return {
      source: "rss",
      channels: channels.map(ch => {
        const parsedLimit = Number.parseInt(ch.itemLimit.trim(), 10);
        return {
          id: ch.id.trim(),
          label: ch.label.trim(),
          feedUrl: ch.feedUrl.trim(),
          itemLimit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100,
        };
      }),
      id: pluginId.trim() || undefined,
      name: pluginName.trim() || undefined,
      icon,
      mediaType,
      refreshInterval: Number.isFinite(parsedRefresh) && parsedRefresh > 0 ? parsedRefresh : 3600,
      userAgent: userAgent.trim() || undefined,
      marketCategory,
      color,
      logoText: logoLetter,
      logoImageUrl: logoImageUrl.trim() || undefined,
      categoryTag: categoryTag.trim() || "NEWS",
      description: description.trim() || (pluginName.trim() ? `${pluginName.trim()} RSS 插件` : "自定义 RSS 插件"),
    };
  };

  const buildManifestJsonText = () => {
    const payload = buildPayloadFromForm();
    const manifest = {
      id: payload.id || "custom-rss",
      name: payload.name || "自定义 RSS",
      version: "1.0.0",
      mediaType: payload.mediaType || "article",
      source: "rss",
      capabilities: ["feed"],
      config: {
        channels: payload.channels ?? [],
        refreshInterval: payload.refreshInterval ?? 3600,
        userAgent: payload.userAgent || "",
      },
      meta: {
        description: payload.description || "",
        color: payload.color || "#7c3aed",
        logoText: payload.logoText || logoLetter,
        logoImageUrl: payload.logoImageUrl || "",
        marketCategory: payload.marketCategory || "blog",
        categoryTag: payload.categoryTag || "NEWS",
        official: false,
        icon: payload.icon || "text",
      },
    };
    return JSON.stringify(manifest, null, 2);
  };

  const applyJsonToForm = (input: string): boolean => {
    if (!input.trim()) return true;
    try {
      const raw = JSON.parse(input) as Record<string, unknown>;
      const config = (raw.config ?? {}) as Record<string, unknown>;
      const meta = (raw.meta ?? {}) as Record<string, unknown>;

      const nextId = typeof raw.id === "string" ? raw.id : "";
      const nextName = typeof raw.name === "string" ? raw.name : "";
      const nextMediaType = typeof raw.mediaType === "string" ? raw.mediaType : undefined;
      const rawChannels = Array.isArray(config.channels)
        ? (config.channels as { id?: string; label?: string; feedUrl?: string; itemLimit?: number }[])
        : [];
      const legacyFeedUrl =
        typeof config.feedUrl === "string" ? config.feedUrl.trim() : "";
      const nextChannels: ChannelFormRow[] =
        rawChannels.length > 0
          ? rawChannels.map((ch, i) =>
              createChannelRow(
                {
                  id: String(ch.id ?? `channel-${i + 1}`).trim(),
                  label: String(ch.label ?? ch.id ?? `频道 ${i + 1}`).trim(),
                  feedUrl: String(ch.feedUrl ?? "").trim(),
                  itemLimit: String(
                    typeof ch.itemLimit === "number" && ch.itemLimit > 0 ? ch.itemLimit : 100,
                  ),
                },
                { idAuto: false },
              ),
            )
          : legacyFeedUrl
            ? [createChannelRow({ label: "全部", feedUrl: legacyFeedUrl }, { idAuto: true })]
            : [createChannelRow({ label: "全部" }, { idAuto: true })];
      const nextRefreshIntervalRaw = typeof raw.refreshInterval === "number"
        ? raw.refreshInterval
        : typeof config.refreshInterval === "number"
          ? config.refreshInterval
          : 3600;
      const nextUserAgent = typeof raw.userAgent === "string"
        ? raw.userAgent
        : typeof config.userAgent === "string"
          ? config.userAgent
          : "";

      setPluginId(nextId);
      setPluginName(nextName);
      if (nextMediaType === "article" || nextMediaType === "manga" || nextMediaType === "video" || nextMediaType === "audio") {
        setMediaType(nextMediaType);
      }
      setChannels(nextChannels);
      setRefreshInterval(String(nextRefreshIntervalRaw));
      setUserAgent(nextUserAgent);

      const nextColor = typeof raw.color === "string"
        ? raw.color
        : typeof meta.color === "string"
          ? meta.color
          : color;
      const nextLogoImageUrl = typeof raw.logoImageUrl === "string"
        ? raw.logoImageUrl
        : typeof meta.logoImageUrl === "string"
          ? meta.logoImageUrl
          : logoImageUrl;
      const nextCategoryTag = typeof raw.categoryTag === "string"
        ? raw.categoryTag
        : typeof meta.categoryTag === "string"
          ? meta.categoryTag
          : categoryTag;
      const nextDescription = typeof raw.description === "string"
        ? raw.description
        : typeof meta.description === "string"
          ? meta.description
          : "";
      const nextMarketCategory = typeof raw.marketCategory === "string"
        ? raw.marketCategory
        : typeof meta.marketCategory === "string"
          ? meta.marketCategory
          : marketCategory;
      const nextIcon = typeof raw.icon === "string"
        ? raw.icon
        : typeof meta.icon === "string"
          ? meta.icon
          : icon;

      if (nextMarketCategory === "blog" || nextMarketCategory === "news" || nextMarketCategory === "manga" || nextMarketCategory === "video" || nextMarketCategory === "audio") {
        setMarketCategory(nextMarketCategory);
      }
      if (nextIcon === "text" || nextIcon === "image" || nextIcon === "video" || nextIcon === "audio") {
        setIcon(nextIcon);
      }
      setColor(nextColor);
      setLogoImageUrl(nextLogoImageUrl.trim());
      if (!logoSourceUrl.trim()) {
        setLogoSourceUrl(nextLogoImageUrl.trim());
      }
      setCategoryTag(nextCategoryTag);
      setDescription(nextDescription);
      setError(null);
      return true;
    } catch {
      setError("RSS JSON 格式错误，请检查配置内容");
      return false;
    }
  };

  useEffect(() => {
    if (isEditingJson) return;
    setJsonText(buildManifestJsonText());
  }, [isEditingJson, pluginId, pluginName, marketCategory, icon, mediaType, channels, refreshInterval, userAgent, categoryTag, description, color, logoLetter, logoImageUrl]);

  const uploadLogoFile = async (file: File) => {
    setIsUploadingLogo(true);
    setError(null);
    try {
      const base = (await waitForRuntimeReady()).replace(/\/$/, "");
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch(`${base}/v1/images/upload`, { method: "POST", body: fd });
      const body = (await res.json()) as any;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const url = String(body?.data?.image?.url ?? "").trim();
      if (!url) throw new Error("upload succeeded but url missing");
      setLogoImageUrl(url);
      setLogoSourceUrl(url);
      setShowLogoUploadModal(false);
    } catch (e) {
      setError(`图标上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const uploadLogoByURL = async () => {
    const sourceURL = logoSourceUrl.trim();
    if (!sourceURL) {
      setError("请先填写图片 URL");
      return;
    }
    setIsUploadingLogo(true);
    setError(null);
    try {
      const base = (await waitForRuntimeReady()).replace(/\/$/, "");
      const res = await fetch(`${base}/v1/images/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceURL }),
      });
      const body = (await res.json()) as any;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const url = String(body?.data?.image?.url ?? "").trim();
      if (!url) throw new Error("upload succeeded but url missing");
      setLogoImageUrl(url);
      setLogoSourceUrl(url);
      setShowLogoUploadModal(false);
    } catch (e) {
      setError(`图标上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const applyDirectLogoUrl = (value?: string) => {
    const trimmed = (value ?? logoSourceUrl).trim();
    if (!isHttpUrl(trimmed)) return;
    setLogoImageUrl(trimmed);
  };

  const handleLogoSourcePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    if (!isHttpUrl(pasted)) return;
    e.preventDefault();
    setLogoSourceUrl(pasted);
    setLogoImageUrl(pasted);
  };

  const handleSubmit = () => {
    if (viewMode === "json") {
      if (!applyJsonToForm(jsonText)) {
        return;
      }
    }

    const payload: InstallRSSPluginRequest = buildPayloadFromForm();
    const trimmedId = (payload.id ?? "").trim();
    const parsedRefresh = payload.refreshInterval ?? 3600;
    const normalizedChannels = (payload.channels ?? []).map(ch => ({
      id: ch.id.trim(),
      label: ch.label.trim(),
      feedUrl: ch.feedUrl?.trim() ?? "",
    }));

    if (trimmedId && !/^[a-z0-9_-]{2,64}$/.test(trimmedId)) {
      setError("插件 ID 需为 2-64 位小写字母/数字/-/_");
      return;
    }
    if (normalizedChannels.length === 0) {
      setError("请至少配置一个 RSS 频道");
      return;
    }
    for (const ch of normalizedChannels) {
      if (!ch.id || !ch.label || !ch.feedUrl) {
        setError("每个频道需填写 ID、名称与 Feed URL");
        return;
      }
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(ch.id)) {
        setError(`频道 ID「${ch.id}」格式无效`);
        return;
      }
    }
    if (!Number.isFinite(parsedRefresh) || parsedRefresh <= 0) {
      setError("刷新间隔需为正整数（秒）");
      return;
    }
    payload.source = "rss";
    payload.channels = normalizedChannels;
    onImport(payload);
    onClose();
  };

  const handleOrbitInstall = async () => {
    if (!orbitFile || !onOrbitImport) {
      setError("请先选择 .orbit 插件包");
      return;
    }
    setIsInstallingOrbit(true);
    setError(null);
    try {
      await onOrbitImport(orbitFile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInstallingOrbit(false);
    }
  };

  const isWasmImport = importSource === "wasm" && !initialPlugin;

  return (
    <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className={`w-full max-w-6xl h-[690px] rounded-[28px] overflow-hidden border shadow-2xl ${panelBg} ${subtleBorder}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`h-[72px] px-6 flex items-center justify-between border-b ${subtleBorder}`}>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">
              {initialPlugin ? "编辑 RSS 插件" : isWasmImport ? "导入 WASM 插件" : "导入插件"}
            </h3>
            <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              {initialPlugin
                ? "修改 RSS 插件配置，支持可视化表单或 JSON 编辑"
                : isWasmImport
                  ? "上传 .orbit 官方插件包，系统将自动解压并导入 manifest"
                  : "RSS 可视化导入，或从左侧切换 WASM 官方插件"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isWasmImport ? (
              <div className={`flex items-center p-1 rounded-2xl ${mutedBg} border ${subtleBorder}`}>
                <button
                  type="button"
                  onClick={() => setViewMode("form")}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    viewMode === "form"
                      ? `${isDark ? "bg-neutral-800 text-[#B7B5FF]" : "bg-white text-[#5856D6]"} shadow-sm`
                      : `${isDark ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-500 hover:text-neutral-700"}`
                  }`}
                >
                  可视化配置
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("json")}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    viewMode === "json"
                      ? `${isDark ? "bg-neutral-800 text-[#B7B5FF]" : "bg-white text-[#5856D6]"} shadow-sm`
                      : `${isDark ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-500 hover:text-neutral-700"}`
                  }`}
                >
                  JSON 编辑
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 text-xs rounded-lg border ${subtleBorder} ${
                isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              关闭
            </button>
          </div>
        </div>

        <div className="h-[calc(100%-140px)] flex min-h-0">
          {/* Left: Source selector (Phase 1 RSS only) — hidden in edit mode */}
          {!initialPlugin ? (
          <aside className={`w-72 shrink-0 border-r ${subtleBorder} p-5 flex flex-col ${isDark ? "bg-neutral-950/10" : "bg-white"}`}>
            <nav className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setImportSource("rss");
                  setError(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
                  importSource === "rss" || initialPlugin
                    ? isDark
                      ? "border-[#5856D6]/25 bg-[#5856D6]/10 text-neutral-100"
                      : "border-[#5856D6]/25 bg-[#5856D6]/5 text-neutral-900"
                    : `${subtleBorder} ${isDark ? "hover:bg-neutral-900/40 text-neutral-300" : "hover:bg-neutral-50 text-neutral-700"}`
                }`}
              >
                <div className={`p-2.5 rounded-xl ${isDark ? "bg-[#5856D6]/25" : "bg-[#5856D6]"} `}>
                  <Icon name="rss" className={`w-4 h-4 ${isDark ? "text-[#B7B5FF]" : "text-white"}`} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">RSS 订阅源</p>
                  <p className={`text-[11px] mt-0.5 truncate ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>通过 `config.channels` 拉取</p>
                </div>
                {(importSource === "rss" || initialPlugin) ? (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${isDark ? "bg-neutral-900/60 text-neutral-300" : "bg-white text-neutral-600 border border-neutral-200"}`}>
                    已启用
                  </span>
                ) : null}
              </button>

              {onOrbitImport && !initialPlugin ? (
                <button
                  type="button"
                  onClick={() => {
                    setImportSource("wasm");
                    setError(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
                    importSource === "wasm"
                      ? isDark
                        ? "border-emerald-900/40 bg-emerald-950/20 text-neutral-100"
                        : "border-emerald-200 bg-emerald-50/60 text-neutral-900"
                      : `${subtleBorder} ${isDark ? "hover:bg-neutral-900/40 text-neutral-300" : "hover:bg-neutral-50 text-neutral-700"}`
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${isDark ? "bg-emerald-900/40" : "bg-emerald-500"}`}>
                    <Icon name="puzzle" className={`w-4 h-4 ${isDark ? "text-emerald-300" : "text-white"}`} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold truncate">WASM 官方插件</p>
                    <p className={`text-[11px] mt-0.5 truncate ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                      导入 .orbit 包（manifest + wasm）
                    </p>
                  </div>
                  {importSource === "wasm" ? (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${isDark ? "bg-neutral-900/60 text-neutral-300" : "bg-white text-neutral-600 border border-neutral-200"}`}>
                      当前
                    </span>
                  ) : null}
                </button>
              ) : null}

              <div className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border ${subtleBorder} ${isDark ? "bg-neutral-900/40 text-neutral-500" : "bg-neutral-50 text-neutral-400"}`}>
                <div className={`p-2.5 rounded-xl ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}>
                  <Icon name="terminal" className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">Script / Scraper</p>
                  <p className="text-[11px] mt-0.5 truncate">Phase 1 暂不开放</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${isDark ? "bg-neutral-800 text-neutral-400" : "bg-white text-neutral-500 border border-neutral-200"}`}>
                  SOON
                </span>
              </div>
            </nav>

            <div className={`mt-auto p-4 rounded-2xl border ${subtleBorder} ${mutedBg}`}>
              <div className="flex items-center gap-2 text-[#5856D6]">
                <Icon name="info" className="w-4 h-4" />
                <p className="text-xs font-semibold">提示</p>
              </div>
              <p className={`text-[11px] mt-2 leading-relaxed ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                {isWasmImport
                  ? "在右侧选择 .orbit 文件后点击安装，系统将自动解压 manifest 与 wasm 主文件。"
                  : "右侧 JSON 会随表单实时生成；你也可以切到 JSON 模式直接编辑，失焦后会自动回填并格式化。"}
              </p>
            </div>
          </aside>
          ) : null}

          {/* Right: Main workspace */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col">
            {isWasmImport ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-7">
                <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${isDark ? "bg-emerald-900/30" : "bg-emerald-50"}`}>
                    <Icon name="puzzle" className={`w-8 h-8 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                  </div>
                  <h4 className="text-sm font-bold mb-2">上传 WASM 官方插件包</h4>
                  <p className={`text-[11px] leading-relaxed max-w-md mb-6 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                    支持 `.orbit` 格式（ZIP 压缩包），需包含 `manifest.json`、`.wasm.br` 主文件及校验信息。
                  </p>

                  <input
                    ref={orbitFileInputRef}
                    type="file"
                    accept=".orbit,application/zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setOrbitFile(file);
                      setError(null);
                      e.target.value = "";
                    }}
                  />

                  <div className={`w-full max-w-md rounded-2xl border border-dashed p-6 mb-4 ${subtleBorder} ${mutedBg}`}>
                    {orbitFile ? (
                      <div className="space-y-2">
                        <p className={`text-xs font-semibold ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
                          {orbitFile.name}
                        </p>
                        <p className={`text-[11px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                          {(orbitFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    ) : (
                      <p className={`text-[11px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                        尚未选择插件包
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => orbitFileInputRef.current?.click()}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold border ${subtleBorder} ${
                      isDark
                        ? "text-neutral-200 hover:bg-neutral-900/50"
                        : "text-neutral-700 hover:bg-white"
                    }`}
                  >
                    <Icon name="download" className="w-4 h-4" />
                    选择 .orbit 文件
                  </button>

                  {error ? <p className="text-xs text-rose-500 mt-4">{error}</p> : null}
                </div>
              </div>
            ) : viewMode === "form" ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-7">
                <div className="max-w-3xl mx-auto w-full">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-4 rounded-full bg-[#5856D6]" />
                    <h4 className="text-sm font-bold">核心配置</h4>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                          RSS 频道 (config.channels)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setChannels(prev => [
                              ...prev,
                              createChannelRow(
                                { label: `频道 ${prev.length + 1}` },
                                { idAuto: true },
                              ),
                            ])
                          }
                          className="text-[11px] font-semibold text-[#5856D6] hover:underline"
                        >
                          + 添加频道
                        </button>
                      </div>
                      <div className="space-y-3">
                        {channels.map((ch, index) => (
                          <div
                            key={ch._key}
                            className={`p-4 rounded-2xl border space-y-3 ${subtleBorder} ${mutedBg}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">频道 {index + 1}</span>
                              {channels.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChannels(prev => prev.filter((_, i) => i !== index))
                                  }
                                  className="text-[11px] text-rose-500 hover:underline"
                                >
                                  删除
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                value={ch.label}
                                onChange={e => {
                                  const v = e.target.value;
                                  setChannels(prev =>
                                    prev.map((row, i) => {
                                      if (i !== index) return row;
                                      const slug = slugifyChannelId(v);
                                      const synced = isChannelIdSyncedWithLabel(row);
                                      return {
                                        ...row,
                                        label: v,
                                        ...(synced && slug
                                          ? { id: slug, idAuto: true }
                                          : {}),
                                      };
                                    }),
                                  );
                                }}
                                placeholder="显示名称"
                                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                              />
                              <input
                                value={ch.id}
                                onChange={e => {
                                  const v = e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9_-]/g, "");
                                  setChannels(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, id: v, idAuto: false } : row,
                                    ),
                                  );
                                }}
                                placeholder="id（根据名称自动生成）"
                                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText} ${
                                  ch.idAuto ? (isDark ? "text-neutral-400" : "text-neutral-500") : ""
                                }`}
                              />
                            </div>
                            <input
                              value={ch.feedUrl}
                              onChange={e => {
                                const v = e.target.value;
                                setChannels(prev =>
                                  prev.map((row, i) =>
                                    i === index ? { ...row, feedUrl: v } : row,
                                  ),
                                );
                              }}
                              placeholder="https://example.com/feed.xml"
                              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                            />
                            <div className="space-y-1">
                              <label className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                                抓取数量上限 itemLimit（默认 100）
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={ch.itemLimit}
                                onChange={e => {
                                  const v = e.target.value;
                                  setChannels(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, itemLimit: v } : row,
                                    ),
                                  );
                                }}
                                placeholder="100"
                                className={`w-full sm:w-40 px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>插件名称</label>
                        <input
                          value={pluginName}
                          onChange={e => setPluginName(e.target.value)}
                          placeholder="e.g. 极客周报 RSS"
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>插件 ID（可选）</label>
                        <input
                          value={pluginId}
                          onChange={e => setPluginId(e.target.value)}
                          placeholder="verge-rss"
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>媒体类型 mediaType</label>
                        <StyledSelect
                          value={mediaType}
                          onChange={e =>
                            setMediaType(
                              e.target.value as NonNullable<InstallRSSPluginRequest["mediaType"]>,
                            )
                          }
                          className={`${inputBg} ${inputBorder} ${inputText}`}
                        >
                          <option value="article">article</option>
                          <option value="manga">manga</option>
                          <option value="video">video</option>
                          <option value="audio">audio</option>
                        </StyledSelect>
                      </div>
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>排版分类大区</label>
                        <StyledSelect
                          value={marketCategory}
                          onChange={e =>
                            setMarketCategory(
                              e.target.value as Exclude<PluginMarketCategory, "all">,
                            )
                          }
                          className={`${inputBg} ${inputBorder} ${inputText}`}
                        >
                          <option value="blog">个人博客</option>
                          <option value="news">新闻资讯</option>
                          <option value="manga">二次元漫画</option>
                          <option value="video">流媒体/视频</option>
                          <option value="audio">有声播客</option>
                        </StyledSelect>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>刷新间隔 refreshInterval（秒）</label>
                        <input
                          value={refreshInterval}
                          onChange={e => setRefreshInterval(e.target.value)}
                          placeholder="3600"
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>User-Agent（可选）</label>
                        <input
                          value={userAgent}
                          onChange={e => setUserAgent(e.target.value)}
                          placeholder="OrbitReader/0.1"
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                    </div>

                    <div className={`mt-8 p-6 rounded-[24px] border ${subtleBorder} ${isDark ? "bg-neutral-950/20" : "bg-neutral-50/60"}`}>
                      <div className="flex items-center gap-2 mb-5">
                        <div className="w-1 h-4 rounded-full bg-orange-500" />
                        <h4 className="text-sm font-bold">品牌与展示效果预览</h4>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-start gap-6">
                        <div className="shrink-0 w-full md:w-[240px]">
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-white text-2xl font-black shadow-lg ${isTailwindBg ? color : ""}`}
                              style={!isTailwindBg ? { backgroundColor: color } : undefined}
                            >
                              {logoImageUrl.trim() ? (
                                <img
                                  src={logoImageUrl.trim()}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span>{logoLetter}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold">Icon Preview</p>
                              <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>用于插件卡片与标签</p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-1.5">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>颜色</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={/^#([0-9a-fA-F]{6})$/.test(color.trim()) ? color.trim() : "#7c3aed"}
                                onChange={e => setColor(e.target.value)}
                                className="h-10 w-12 rounded-xl border border-neutral-200 p-1 bg-white"
                              />
                              <input
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                placeholder="#7c3aed"
                                className={`flex-1 px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-1.5 lg:col-span-2">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>图标类型</label>
                            <StyledSelect
                              value={icon}
                              onChange={e => setIcon(e.target.value as PluginContentType)}
                              className={`${inputBg} ${inputBorder} ${inputText}`}
                            >
                              <option value="text">文章适应排版</option>
                              <option value="image">漫画/图片</option>
                              <option value="video">视频</option>
                              <option value="audio">音频</option>
                            </StyledSelect>
                          </div>
                          <div className="space-y-1.5">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>分类标签</label>
                            <input
                              value={categoryTag}
                              onChange={e => setCategoryTag(e.target.value)}
                              className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                            />
                          </div>

                          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                            <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>图标图片 URL（可选）</label>
                            <div className="flex gap-2">
                              <input
                                value={logoSourceUrl}
                                onChange={e => setLogoSourceUrl(e.target.value)}
                                onPaste={handleLogoSourcePaste}
                                onBlur={() => applyDirectLogoUrl()}
                                placeholder="https://example.com/icon.png"
                                className={`min-w-0 flex-1 px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                              />
                              <button
                                type="button"
                                disabled={isUploadingLogo}
                                onClick={() => setShowLogoUploadModal(true)}
                                className={`shrink-0 px-4 py-3 rounded-2xl text-xs font-semibold text-white ${PRIMARY} disabled:opacity-60 disabled:cursor-not-allowed`}
                              >
                                {isUploadingLogo ? "上传中..." : "上传图标"}
                              </button>
                            </div>
                            <p className={`text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                              粘贴或输入图片链接后将直接使用；需托管上传请点击「上传图标」
                            </p>
                            <input
                              ref={logoFileInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                void uploadLogoFile(file);
                                e.currentTarget.value = "";
                              }}
                            />
                            {logoImageUrl.trim() && (
                              <p className={`text-[11px] mt-1 truncate ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
                                当前图标：{logoImageUrl.trim()}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 space-y-1.5">
                        <label className={`text-[11px] font-semibold ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>描述 description（可选）</label>
                        <input
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          placeholder="科技评论与前沿快讯"
                          className={`w-full px-4 py-3 text-xs rounded-2xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`}
                        />
                      </div>
                    </div>

                    {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden p-7">
                <div className={`h-full rounded-[22px] overflow-hidden border ${subtleBorder} ${isDark ? "bg-[#0b0f12]" : "bg-neutral-950"}`}>
                  <div className={`px-5 py-3 border-b ${isDark ? "border-neutral-800" : "border-neutral-900"} text-xs flex items-center justify-between`}>
                    <span className={isDark ? "text-neutral-400" : "text-neutral-400"}>manifest.json</span>
                    <span className="text-emerald-400">● RSS 配置</span>
                  </div>
                  <textarea
                    value={jsonText}
                    onFocus={() => setIsEditingJson(true)}
                    onChange={(e) => {
                      const next = e.target.value;
                      setJsonText(next);
                      applyJsonToForm(next);
                    }}
                    onBlur={() => {
                      setIsEditingJson(false);
                      if (applyJsonToForm(jsonText)) {
                        setJsonText(buildManifestJsonText());
                      }
                    }}
                    spellCheck={false}
                    className="w-full h-[calc(100%-48px)] bg-transparent p-5 text-[12px] leading-6 font-mono text-[#58f5d3] resize-none outline-none"
                  />
                </div>
                {error && <p className="text-xs text-rose-500 mt-3">{error}</p>}
              </div>
            )}
          </main>
        </div>

        <div className={`h-[68px] px-8 flex items-center justify-between border-t ${subtleBorder}`}>
          <div className={`text-[11px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
            {isWasmImport
              ? "安装后可在「已安装插件」中管理、编辑 manifest 配置。"
              : viewMode === "json"
                ? "提示：JSON 模式会绕过部分表单校验，保存前请确认语法正确。"
                : "保存后会立即同步到运行时插件目录。"}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border ${subtleBorder} ${
                isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              取消
            </button>
            {isWasmImport ? (
              <button
                type="button"
                disabled={!orbitFile || isInstallingOrbit}
                onClick={() => {
                  void handleOrbitInstall();
                }}
                className={`px-5 py-2 rounded-xl text-xs font-semibold text-white ${PRIMARY} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isInstallingOrbit ? "安装中…" : "安装插件"}
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} className={`px-5 py-2 rounded-xl text-xs font-semibold text-white ${PRIMARY}`}>
                保存并同步
              </button>
            )}
          </div>
        </div>
      </div>

      {showLogoUploadModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-6"
          onClick={(e) => {
            e.stopPropagation();
            if (!isUploadingLogo) setShowLogoUploadModal(false);
          }}
        >
          <div
            className={`w-full max-w-md rounded-[24px] border shadow-2xl p-6 ${panelBg} ${subtleBorder}`}
            onClick={e => e.stopPropagation()}
          >
            <h4 className="text-sm font-bold">上传插件图标</h4>
            <p className={`text-[11px] mt-1.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              选择上传方式。若已在上方输入框填写链接，URL 上传将使用该地址。
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isUploadingLogo}
                onClick={() => logoFileInputRef.current?.click()}
                className={`p-4 rounded-2xl border text-left transition-colors ${subtleBorder} ${
                  isDark ? "hover:bg-neutral-900/60" : "hover:bg-neutral-50"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                <p className="text-xs font-semibold">本地上传</p>
                <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                  从设备选择图片并上传至图床
                </p>
              </button>
              <button
                type="button"
                disabled={isUploadingLogo}
                onClick={() => void uploadLogoByURL()}
                className={`p-4 rounded-2xl border text-left transition-colors ${subtleBorder} ${
                  isDark ? "hover:bg-neutral-900/60" : "hover:bg-neutral-50"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                <p className="text-xs font-semibold">URL 上传</p>
                <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                  将输入框中的图片链接上传至图床
                </p>
              </button>
            </div>

            {logoSourceUrl.trim() && (
              <p className={`text-[11px] mt-4 truncate ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
                当前链接：{logoSourceUrl.trim()}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={isUploadingLogo}
                onClick={() => setShowLogoUploadModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border ${subtleBorder} ${
                  isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PluginGroupManagerModal({
  groups,
  panelBg,
  subtleBorder,
  mutedBg,
  inputBg,
  inputBorder,
  isDark,
  onClose,
  onAdd,
  onRename,
  onMove,
  onRemove,
}: {
  groups: PluginSidebarGroup[];
  panelBg: string;
  subtleBorder: string;
  mutedBg: string;
  inputBg: string;
  inputBorder: string;
  isDark: boolean;
  onClose: () => void;
  onAdd: (label: string) => void;
  onRename: (groupId: string, label: string) => void;
  onMove: (groupId: string, direction: "up" | "down") => void;
  onRemove: (groupId: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  const handleDropReorder = (targetGroupId: string) => {
    if (!draggingGroupId || draggingGroupId === targetGroupId) {
      setDragOverGroupId(null);
      return;
    }
    const fromIndex = groups.findIndex(g => g.id === draggingGroupId);
    const toIndex = groups.findIndex(g => g.id === targetGroupId);
    if (fromIndex < 0 || toIndex < 0) {
      setDragOverGroupId(null);
      return;
    }
    const direction: "up" | "down" = fromIndex < toIndex ? "down" : "up";
    const steps = Math.abs(fromIndex - toIndex);
    for (let i = 0; i < steps; i += 1) {
      onMove(draggingGroupId, direction);
    }
    setDragOverGroupId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg max-h-[min(640px,90vh)] flex flex-col rounded-[24px] border shadow-2xl overflow-hidden ${panelBg} ${subtleBorder}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-group-manager-title"
      >
        <div className={`shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b ${subtleBorder}`}>
          <div>
            <h4 id="plugin-group-manager-title" className="text-sm font-bold">
              分组管理
            </h4>
            <p className={`text-[11px] mt-1 leading-relaxed ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              创建、重命名与排序分组；侧栏将按此顺序展示。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 px-3 py-1.5 text-xs rounded-lg border ${subtleBorder} ${
              isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            关闭
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="新分组名称"
              className={`flex-1 px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder}`}
              onKeyDown={e => {
                if (e.key === "Enter" && newLabel.trim()) {
                  onAdd(newLabel);
                  setNewLabel("");
                }
              }}
            />
            <button
              type="button"
              disabled={!newLabel.trim()}
              onClick={() => {
                onAdd(newLabel);
                setNewLabel("");
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-[#5856D6] hover:bg-[#4a48c4] disabled:opacity-40"
            >
              添加
            </button>
          </div>

          <ul className="space-y-2">
            {groups.map((group, index) => {
              const canMoveUp = index > 0;
              const canMoveDown = index < groups.length - 1;

              return (
                <li
                  key={group.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${subtleBorder} ${inputBg} ${
                    dragOverGroupId === group.id ? "ring-2 ring-[#5856D6]/35" : ""
                  }`}
                  onDragOver={event => {
                    event.preventDefault();
                    setDragOverGroupId(group.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverGroupId === group.id) {
                      setDragOverGroupId(null);
                    }
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    handleDropReorder(group.id);
                  }}
                >
                  <div className="shrink-0 flex items-center gap-1.5 pr-2 border-r border-neutral-200/70 dark:border-neutral-800">
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDraggingGroupId(group.id)}
                      onDragEnd={() => {
                        setDraggingGroupId(null);
                        setDragOverGroupId(null);
                      }}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white cursor-grab active:cursor-grabbing dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      title="拖拽排序"
                      aria-label="拖拽排序"
                    >
                      <span aria-hidden className="text-[10px] leading-none">⋮⋮</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canMoveUp}
                      onClick={() => onMove(group.id, "up")}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      title="上移"
                      aria-label="上移"
                    >
                      <span aria-hidden className="text-[10px] leading-none">↑</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canMoveDown}
                      onClick={() => onMove(group.id, "down")}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      title="下移"
                      aria-label="下移"
                    >
                      <span aria-hidden className="text-[10px] leading-none">↓</span>
                    </button>
                  </div>

                  {editingId === group.id ? (
                    <>
                      <input
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        className={`flex-1 min-w-0 px-2 py-1 text-xs rounded-lg border ${inputBorder} ${inputBg}`}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter" && editLabel.trim()) {
                            onRename(group.id, editLabel);
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        type="button"
                        className="text-[11px] font-medium text-[#5856D6] shrink-0"
                        onClick={() => {
                          if (editLabel.trim()) {
                            onRename(group.id, editLabel);
                          }
                          setEditingId(null);
                        }}
                      >
                        保存
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 text-xs font-medium truncate">{group.label}</span>
                      {group.id === DEFAULT_PLUGIN_GROUP_ID && (
                        <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded ${mutedBg} text-neutral-500`}>
                          系统
                        </span>
                      )}
                      <button
                        type="button"
                        className="text-[11px] text-neutral-500 hover:text-[#5856D6] shrink-0"
                        onClick={() => {
                          setEditingId(group.id);
                          setEditLabel(group.label);
                        }}
                      >
                        重命名
                      </button>
                      {group.id !== DEFAULT_PLUGIN_GROUP_ID && (
                        <button
                          type="button"
                          className="text-[11px] text-rose-500 hover:underline shrink-0"
                          onClick={() => onRemove(group.id)}
                        >
                          删除
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`shrink-0 px-6 py-4 border-t flex justify-end ${subtleBorder}`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${PRIMARY}`}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

export function PluginManagerModal({
  theme,
  myPlugins,
  pluginGroups,
  groupedPluginsForManage,
  onClose,
  onInstall,
  onSaveManifest,
  onUninstall,
  onToggleActive,
  onMove,
  onReorder,
  onImport,
  onRefresh,
  onForceRefresh,
  onAssignPluginGroup,
  onAddPluginGroup,
  onRenamePluginGroup,
  onMovePluginGroup,
  onRemovePluginGroup,
  getPluginGroupId,
  embedded = false,
}: PluginManagerModalProps) {
  const [activeTab, setActiveTab] = useState<Extract<PluginManagerTab, "market" | "manage">>("market");
  const [marketCategory, setMarketCategory] = useState<PluginMarketCategory>("all");
  const [marketSearch, setMarketSearch] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  const [editingWasmPlugin, setEditingWasmPlugin] = useState<Plugin | null>(null);
  const [installingMarketId, setInstallingMarketId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [importTargetGroupId, setImportTargetGroupId] = useState<string | null>(null);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [activeManageGroupId, setActiveManageGroupId] = useState<string>(
    () => groupedPluginsForManage[0]?.group.id ?? DEFAULT_PLUGIN_GROUP_ID,
  );

  const activeManageGroup = useMemo(
    () =>
      groupedPluginsForManage.find(entry => entry.group.id === activeManageGroupId)
      ?? groupedPluginsForManage[0],
    [groupedPluginsForManage, activeManageGroupId],
  );

  useEffect(() => {
    if (
      groupedPluginsForManage.length > 0
      && !groupedPluginsForManage.some(entry => entry.group.id === activeManageGroupId)
    ) {
      setActiveManageGroupId(groupedPluginsForManage[0].group.id);
    }
  }, [groupedPluginsForManage, activeManageGroupId]);

  const openImportForGroup = (groupId: string) => {
    setEditingPlugin(null);
    setImportTargetGroupId(groupId);
    setShowImportModal(true);
  };

  const installedPlugins = myPlugins.filter(p => p.id !== "all");
  const runningCount = installedPlugins.filter(p => p.active !== false).length;

  const [marketPlugins, setMarketPlugins] = useState<MarketPluginItem[]>([]);
  const [marketTotal, setMarketTotal] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketSort, setMarketSort] = useState<MarketPluginSort>("rating");
  const [debouncedMarketSearch, setDebouncedMarketSearch] = useState("");
  const [marketGroups, setMarketGroups] = useState<{ id: string; label: string }[]>([
    { id: "all", label: "全部官方精选" },
  ]);
  const [marketGroupsLoading, setMarketGroupsLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "market") {
      return;
    }
    let cancelled = false;
    setMarketGroupsLoading(true);
    void fetchPluginTypeDicts()
      .then(items => {
        if (!cancelled) {
          setMarketGroups([
            { id: "all", label: "全部官方精选" },
            ...items.map(item => ({ id: item.value, label: item.label })),
          ]);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error("load plugin type groups failed", err);
          setMarketGroups([{ id: "all", label: "全部官方精选" }]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMarketGroupsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMarketSearch(marketSearch.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [marketSearch]);

  useEffect(() => {
    if (activeTab !== "market") {
      return;
    }
    let cancelled = false;
    setMarketLoading(true);
    void fetchMarketPlugins({
      category: marketCategory,
      sort: marketSort,
      search: debouncedMarketSearch,
      pageSize: 50,
    })
      .then(({ items, total }) => {
        if (!cancelled) {
          setMarketPlugins(items);
          setMarketTotal(total);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error("load market plugins failed", err);
          setMarketPlugins([]);
          setMarketTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMarketLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, marketCategory, marketSort, debouncedMarketSearch]);

  const marketCategoryLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of marketGroups) {
      if (group.id !== "all") {
        map.set(group.id, group.label);
      }
    }
    return map;
  }, [marketGroups]);

  const isDark = theme === "dark";
  const panelBg = isDark ? "bg-[#1c1d1f] text-white" : "bg-white text-neutral-900";
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-100";
  const mutedBg = isDark ? "bg-neutral-900/40" : "bg-neutral-50";
  const inputBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBorder = isDark ? "border-neutral-800" : "border-neutral-200";

  const resolveGroupId = getPluginGroupId;
  const wrapperClass = embedded
    ? "w-full h-full min-h-0"
    : "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 md:p-10";
  const panelClass = embedded
    ? `w-full h-full min-h-0 flex flex-col overflow-hidden ${panelBg} border-l border-r ${subtleBorder}`
    : `w-full max-w-6xl ${MODAL_HEIGHT} flex flex-col rounded-[28px] shadow-2xl overflow-hidden ${panelBg} border ${subtleBorder}`;

  return (
    <div className={wrapperClass} onClick={embedded ? undefined : onClose}>
      <div className={panelClass} onClick={embedded ? undefined : e => e.stopPropagation()}>
        <header className={`shrink-0 flex items-center justify-between gap-5 px-7 pt-4 pb-3 border-b ${subtleBorder}`}>
          <div className={`shrink-0 flex items-center gap-1 p-1 rounded-2xl ${mutedBg}`}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  activeTab === tab.id ? "bg-white dark:bg-neutral-800 text-[#5856D6] shadow-sm" : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
              >
                <Icon name={tab.icon} className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="w-8 h-8 shrink-0" />
        </header>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === "market" && (
            <div className="flex-1 min-h-0 flex">
              <aside className={`w-52 shrink-0 border-r ${subtleBorder} px-4 py-5 overflow-y-auto`}>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-3">插件分组</p>
                <nav className="space-y-0.5">
                  {marketGroupsLoading && marketGroups.length <= 1 ? (
                    <p className="px-3 py-2 text-xs text-neutral-400">加载分组…</p>
                  ) : (
                    marketGroups.map(group => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setMarketCategory(group.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                          marketCategory === group.id ? "bg-[#5856D6]/10 text-[#5856D6] font-medium" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                        }`}
                      >
                        {group.id === "all" && <Icon name="sparkles" className="w-4 h-4 shrink-0" />}
                        <span className="truncate text-left">{group.label}</span>
                      </button>
                    ))
                  )}
                </nav>
              </aside>

              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className={`shrink-0 px-6 py-4 border-b ${subtleBorder} ${isDark ? "bg-neutral-900/40" : "bg-white/80"}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative min-w-0">
                      <Icon name="search" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="search"
                        value={marketSearch}
                        onChange={e => setMarketSearch(e.target.value)}
                        placeholder="搜索官方应用、漫库、RSS或剧集频道..."
                        className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs outline-none border ${subtleBorder} ${mutedBg} focus:border-[#5856D6]/50`}
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <StyledSelect
                        value={marketSort}
                        onChange={e => setMarketSort(e.target.value as MarketPluginSort)}
                        className={`py-2 px-3 text-xs rounded-xl ${mutedBg} ${subtleBorder}`}
                      >
                        {MARKET_SORT_OPTIONS.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </StyledSelect>
                    </div>
                    <span className="text-[11px] text-neutral-400 whitespace-nowrap shrink-0">发现 {marketTotal} 个获取接口</span>
                  </div>
                  {installError ? (
                    <p className="mt-2 text-[11px] text-rose-500">{installError}</p>
                  ) : null}
                </div>
                <div className={`flex-1 overflow-y-auto px-6 py-5 ${isDark ? "bg-neutral-950/30" : "bg-neutral-100/80"}`}>
                  {marketLoading ? (
                    <p className="text-sm text-neutral-400 text-center py-16">加载官方插件…</p>
                  ) : marketPlugins.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-16">暂无匹配插件</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {marketPlugins.map(plugin => {
                        const installed = findInstalledMarketPlugin(plugin, installedPlugins);
                        return (
                          <MarketPluginCard
                            key={plugin.id}
                            plugin={plugin}
                            categoryLabel={marketCategoryLabels.get(String(plugin.categoryId))}
                            subtleBorder={subtleBorder}
                            installedPlugin={installed}
                            installing={installingMarketId === plugin.id}
                            onInstall={async (marketId) => {
                              setInstallError(null);
                              setInstallingMarketId(marketId);
                              try {
                                await onInstall(marketId);
                              } catch (err) {
                                setInstallError(err instanceof Error ? err.message : String(err));
                                throw err;
                              } finally {
                                setInstallingMarketId(null);
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "manage" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className={`shrink-0 flex items-start justify-between gap-4 px-8 py-5 border-b ${subtleBorder}`}>
                <div>
                  <h3 className="text-base font-bold">已安装插件</h3>
                  <p className="text-sm text-neutral-500 mt-1">调整顺序、启用状态，或管理自定义插件</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-3 py-1.5 rounded-lg shrink-0 ${mutedBg} text-neutral-500`}>运行中：{runningCount} 个</span>
                  <button
                    type="button"
                    onClick={onRefresh}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${subtleBorder} ${
                      isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    刷新
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGroupManager(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${subtleBorder} ${
                      isDark
                        ? "text-neutral-300 hover:bg-neutral-900/50"
                        : "text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    分组管理
                  </button>
                </div>
              </div>

              <div className={`shrink-0 px-8 py-3 border-b ${subtleBorder}`}>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex-1 min-w-0 flex items-center gap-1 p-1 rounded-2xl overflow-x-auto ${mutedBg}`}
                    role="tablist"
                    aria-label="插件分组"
                  >
                    {groupedPluginsForManage.map(({ group, plugins }) => (
                      <button
                        key={group.id}
                        type="button"
                        role="tab"
                        aria-selected={activeManageGroupId === group.id}
                        onClick={() => setActiveManageGroupId(group.id)}
                        className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          activeManageGroupId === group.id
                            ? "bg-white dark:bg-neutral-800 text-[#5856D6] shadow-sm"
                            : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                        }`}
                      >
                        <span className="truncate max-w-[8rem]">{group.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                            activeManageGroupId === group.id
                              ? "bg-[#5856D6]/10 text-[#5856D6]"
                              : "bg-neutral-200/80 dark:bg-neutral-700 text-neutral-500"
                          }`}
                        >
                          {plugins.length}
                        </span>
                      </button>
                    ))}
                  </div>
                  {activeManageGroup && (
                    <button
                      type="button"
                      onClick={() => openImportForGroup(activeManageGroup.group.id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#5856D6] hover:bg-[#4a48c4]"
                    >
                      导入插件
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-8 py-4">
                {activeManageGroup ? (
                  activeManageGroup.plugins.length > 0 ? (
                    <PluginSection
                      plugins={activeManageGroup.plugins}
                      installedPlugins={installedPlugins}
                      subtleBorder={subtleBorder}
                      mutedBg={mutedBg}
                      inputBg={inputBg}
                      inputBorder={inputBorder}
                      pluginGroups={pluginGroups}
                      onMove={onMove}
                      onReorder={onReorder}
                      onToggleActive={onToggleActive}
                      onUninstall={onUninstall}
                      onForceRefresh={onForceRefresh}
                      onAssignGroup={onAssignPluginGroup}
                      resolveGroupId={resolveGroupId}
                      onEdit={(plugin) => {
                        if (plugin.source === "wasm") {
                          setEditingWasmPlugin(plugin);
                          return;
                        }
                        setEditingPlugin(plugin);
                        setImportTargetGroupId(null);
                        setShowImportModal(true);
                      }}
                    />
                  ) : (
                    <p className="text-sm text-neutral-400 text-center py-16">
                      「{activeManageGroup.group.label}」暂无插件，点击「导入插件」将自动添加到此分组。
                    </p>
                  )
                ) : (
                  <p className="text-sm text-neutral-400 text-center py-16">暂无分组，请先在「分组管理」中创建。</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showGroupManager && (
        <PluginGroupManagerModal
          groups={pluginGroups}
          panelBg={panelBg}
          subtleBorder={subtleBorder}
          mutedBg={mutedBg}
          inputBg={inputBg}
          inputBorder={inputBorder}
          isDark={isDark}
          onClose={() => setShowGroupManager(false)}
          onAdd={onAddPluginGroup}
          onRename={onRenamePluginGroup}
          onMove={onMovePluginGroup}
          onRemove={onRemovePluginGroup}
        />
      )}

      {showImportModal && (
        <ImportPluginModal
          theme={theme}
          onClose={() => {
            setShowImportModal(false);
            setEditingPlugin(null);
            setImportTargetGroupId(null);
          }}
          onImport={(payload) => {
            onImport(payload, importTargetGroupId ?? undefined);
            setShowImportModal(false);
            setEditingPlugin(null);
            setImportTargetGroupId(null);
            setActiveTab("manage");
          }}
          onOrbitImport={async (file) => {
            const plugin = await installOrbitPackage(file);
            onRefresh();
            if (importTargetGroupId) {
              onAssignPluginGroup(plugin.id, importTargetGroupId);
            }
            setShowImportModal(false);
            setImportTargetGroupId(null);
            setActiveTab("manage");
          }}
          initialPlugin={editingPlugin}
        />
      )}

      {editingWasmPlugin && (
        <WasmManifestEditorModal
          theme={theme}
          plugin={editingWasmPlugin}
          onClose={() => setEditingWasmPlugin(null)}
          onSave={async (manifestText) => {
            await onSaveManifest(editingWasmPlugin.id, manifestText);
            setEditingWasmPlugin(null);
          }}
        />
      )}
    </div>
  );
}
