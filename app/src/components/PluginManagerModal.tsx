import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { PLUGIN_MARKET_GROUPS } from "@/data/plugins";
import { fetchMarketPlugins } from "@/lib/feed";
import { slugifyChannelId } from "@/lib/channelId";
import { waitForRuntimeReady } from "@/lib/runtime";
import type { PluginSidebarGroup } from "@/lib/pluginGroups";
import { DEFAULT_PLUGIN_GROUP_ID } from "@/lib/pluginGroups";
import type {
  InstallRSSPluginRequest,
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

interface PluginManagerModalProps {
  theme: ThemeMode;
  myPlugins: Plugin[];
  pluginGroups: PluginSidebarGroup[];
  groupedPluginsForManage: { group: PluginSidebarGroup; plugins: Plugin[] }[];
  onClose: () => void;
  onInstall: (plugin: Plugin) => void;
  onUninstall: (id: string) => void;
  onToggleActive: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
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

function filterMarketPlugins(
  plugins: Plugin[],
  category: PluginMarketCategory,
  query: string,
): Plugin[] {
  let list = plugins;
  if (category !== "all") list = list.filter(p => p.marketCategory === category);
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
    onAssignGroup,
    resolveGroupId,
    onEdit,
    onForceRefresh,
  } = props;
  const [draggingPluginId, setDraggingPluginId] = useState<string | null>(null);
  const [dragOverPluginId, setDragOverPluginId] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<Plugin | null>(null);
  const [forceRefreshingId, setForceRefreshingId] = useState<string | null>(null);

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

    const direction: "up" | "down" = fromIndex < toIndex ? "down" : "up";
    const steps = Math.abs(fromIndex - toIndex);
    for (let i = 0; i < steps; i += 1) {
      onMove(draggingPluginId, direction);
    }
    setDragOverPluginId(null);
  };

  return (
    <div className="space-y-3">
      {plugins.map((plugin) => {
        const index = installedPlugins.findIndex(p => p.id === plugin.id);
        const isEnabled = plugin.active !== false;
        const canMoveUp = index > 0;
        const canMoveDown = index < installedPlugins.length - 1;
        const isCustom = !plugin.official;
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
                <div
                  className={`w-10 h-10 shrink-0 rounded-xl overflow-hidden flex items-center justify-center font-bold text-white text-xs ${
                    plugin.color?.trim?.().startsWith("bg-") ? plugin.color : ""
                  }`}
                  style={plugin.color?.trim?.().startsWith("bg-") ? undefined : { backgroundColor: plugin.color || "#7c3aed" }}
                >
                  {plugin.logoImageUrl ? (
                    <img
                      src={plugin.logoImageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{(plugin.name || "").trim().slice(0, 1) || "★"}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold">{plugin.name}</span>
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
                    {isCustom && (
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
                      setForceRefreshingId(plugin.id);
                      void onForceRefresh(plugin.id)
                        .catch(console.error)
                        .finally(() => setForceRefreshingId(null));
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title="清空本地缓存并重新抓取最新内容"
                  >
                    <Icon
                      name="refresh"
                      className={`w-3 h-3 ${forceRefreshingId === plugin.id ? "animate-spin" : ""}`}
                    />
                    {forceRefreshingId === plugin.id ? "刷新中…" : "强制刷新"}
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

function ImportPluginModal({
  theme,
  onClose,
  onImport,
  initialPlugin,
}: {
  theme: ThemeMode;
  onClose: () => void;
  onImport: (payload: InstallRSSPluginRequest) => void;
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

  return (
    <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className={`w-full max-w-6xl h-[690px] rounded-[28px] overflow-hidden border shadow-2xl ${panelBg} ${subtleBorder}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`h-[72px] px-6 flex items-center justify-between border-b ${subtleBorder}`}>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">
              {initialPlugin ? "编辑 RSS 插件" : "导入插件"}
            </h3>
            <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              参考 manifest 结构配置 source/config/meta（当前仅支持 RSS）
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
          {/* Left: Source selector (Phase 1 RSS only) */}
          <aside className={`w-72 shrink-0 border-r ${subtleBorder} p-5 flex flex-col ${isDark ? "bg-neutral-950/10" : "bg-white"}`}>
            <nav className="space-y-2">
              <button
                type="button"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
                  isDark
                    ? "border-[#5856D6]/25 bg-[#5856D6]/10 text-neutral-100"
                    : "border-[#5856D6]/25 bg-[#5856D6]/5 text-neutral-900"
                }`}
              >
                <div className={`p-2.5 rounded-xl ${isDark ? "bg-[#5856D6]/25" : "bg-[#5856D6]"} `}>
                  <Icon name="rss" className={`w-4 h-4 ${isDark ? "text-[#B7B5FF]" : "text-white"}`} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">RSS 订阅源</p>
                  <p className={`text-[11px] mt-0.5 truncate ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>通过 `config.channels` 拉取</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${isDark ? "bg-neutral-900/60 text-neutral-300" : "bg-white text-neutral-600 border border-neutral-200"}`}>
                  已启用
                </span>
              </button>

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
                右侧 JSON 会随表单实时生成；你也可以切到 JSON 模式直接编辑，失焦后会自动回填并格式化。
              </p>
            </div>
          </aside>

          {/* Right: Main workspace */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col">
            {viewMode === "form" ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-7">
                <div className="max-w-3xl">
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
            {viewMode === "json" ? "提示：JSON 模式会绕过部分表单校验，保存前请确认语法正确。" : "保存后会立即同步到运行时插件目录。"}
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
            <button type="button" onClick={handleSubmit} className={`px-5 py-2 rounded-xl text-xs font-semibold text-white ${PRIMARY}`}>
              保存并同步
            </button>
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
  onUninstall,
  onToggleActive,
  onMove,
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

  const [marketPlugins, setMarketPlugins] = useState<Plugin[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "market") {
      return;
    }
    let cancelled = false;
    setMarketLoading(true);
    void fetchMarketPlugins()
      .then(plugins => {
        if (!cancelled) {
          setMarketPlugins(plugins);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error("load market plugins failed", err);
          setMarketPlugins([]);
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
  }, [activeTab, myPlugins]);

  const filteredMarketPlugins = useMemo(
    () => filterMarketPlugins(marketPlugins, marketCategory, marketSearch),
    [marketPlugins, marketCategory, marketSearch],
  );

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
                  {PLUGIN_MARKET_GROUPS.map(group => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setMarketCategory(group.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        marketCategory === group.id ? "bg-[#5856D6]/10 text-[#5856D6] font-medium" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                      }`}
                    >
                      <Icon name={group.icon} className="w-4 h-4 shrink-0" />
                      <span className="truncate text-left">{group.label}</span>
                    </button>
                  ))}
                </nav>
              </aside>

              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className={`shrink-0 px-6 py-4 border-b ${subtleBorder} ${isDark ? "bg-neutral-900/40" : "bg-neutral-50/80"}`}>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                      <Icon name="search" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="search"
                        value={marketSearch}
                        onChange={e => setMarketSearch(e.target.value)}
                        placeholder="搜索官方应用、漫库、RSS或剧集频道..."
                        className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs outline-none border ${subtleBorder} ${mutedBg} focus:border-[#5856D6]/50`}
                      />
                    </div>
                    <span className="text-[11px] text-neutral-400 whitespace-nowrap shrink-0">发现 {filteredMarketPlugins.length} 个获取接口</span>
                  </div>
                </div>
                <div className={`flex-1 overflow-y-auto px-6 py-5 ${isDark ? "bg-neutral-950/30" : "bg-neutral-100/80"}`}>
                  {marketLoading ? (
                    <p className="text-sm text-neutral-400 text-center py-16">加载官方插件…</p>
                  ) : filteredMarketPlugins.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-16">暂无匹配插件</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredMarketPlugins.map(plugin => (
                        <article key={plugin.id} className={`relative flex flex-col p-4 rounded-2xl border ${subtleBorder} bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md hover:border-[#5856D6]/30 transition-colors`}>
                          {plugin.official && <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-600">官方推荐</span>}
                          <div className="flex items-start gap-3 mb-3 pr-16">
                            <div
                              className={`w-11 h-11 shrink-0 rounded-xl overflow-hidden flex items-center justify-center font-bold text-white text-sm ${
                                plugin.color?.trim?.().startsWith("bg-") ? plugin.color : ""
                              }`}
                              style={plugin.color?.trim?.().startsWith("bg-") ? undefined : { backgroundColor: plugin.color || "#7c3aed" }}
                            >
                              {plugin.logoImageUrl ? (
                                <img
                                  src={plugin.logoImageUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span>{(plugin.name || "").trim().slice(0, 1) || "★"}</span>
                              )}
                            </div>
                            <div className="min-w-0 pt-0.5">
                              <h3 className="text-xs font-bold leading-snug">{plugin.name}</h3>
                              <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{plugin.desc}</p>
                            </div>
                          </div>
                          <div className="mt-auto flex items-center justify-between pt-3 border-t border-dashed border-neutral-100">
                            <span className="text-[10px] font-semibold text-neutral-400 tracking-wider">{plugin.categoryTag ?? "FEED"}</span>
                            <button type="button" onClick={() => onInstall(plugin)} className={`text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg ${PRIMARY}`}>
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
                      onToggleActive={onToggleActive}
                      onUninstall={onUninstall}
                      onForceRefresh={onForceRefresh}
                      onAssignGroup={onAssignPluginGroup}
                      resolveGroupId={resolveGroupId}
                      onEdit={(plugin) => {
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
          initialPlugin={editingPlugin}
        />
      )}
    </div>
  );
}
