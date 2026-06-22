import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import {
  EXPERIENCE_MODE_LABELS,
  type ExperienceMode,
} from "@/lib/experienceMode";
import { Icon } from "@/components/Icon";
import {
  detectBuildModeLabel,
  detectPlatformLabel,
  loadAppInfo,
  resolveBrowserFrontendUrl,
  type AppInfo,
} from "@/lib/appInfo";
import { fetchHealth, fetchStatus, waitForRuntimeReady } from "@/lib/runtime";
import type { HealthResponse, RuntimeStatusResponse, ThemeMode } from "@/types";

type SystemInfoSection = "overview" | "application" | "runtime" | "updates";

const SECTIONS: { id: SystemInfoSection; label: string; icon: string }[] = [
  { id: "overview", label: "概览", icon: "layers" },
  { id: "application", label: "应用信息", icon: "info" },
  { id: "runtime", label: "运行环境", icon: "terminal" },
  { id: "updates", label: "软件更新", icon: "download" },
];

function InfoRow({
  label,
  value,
  mono = false,
  isDark,
}: {
  label: string;
  value: string;
  mono?: boolean;
  isDark: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-6 py-3 border-b last:border-b-0 ${
        isDark ? "border-neutral-800" : "border-neutral-100"
      }`}
    >
      <span className={`shrink-0 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
        {label}
      </span>
      <span
        className={`text-xs text-right break-all ${
          mono ? "font-mono" : ""
        } ${isDark ? "text-neutral-200" : "text-neutral-800"}`}
      >
        {value}
      </span>
    </div>
  );
}

function LinkRow({
  label,
  href,
  isDark,
  onOpen,
}: {
  label: string;
  href: string;
  isDark: boolean;
  onOpen: () => void | Promise<void>;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-6 py-3 border-b last:border-b-0 ${
        isDark ? "border-neutral-800" : "border-neutral-100"
      }`}
    >
      <span className={`shrink-0 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
        {label}
      </span>
      <div className="min-w-0 flex-1 flex items-start justify-end gap-2">
        <button
          type="button"
          onClick={() => void onOpen()}
          className={`min-w-0 text-xs text-right break-all font-mono underline underline-offset-2 ${
            isDark ? "text-neutral-200 hover:text-white" : "text-neutral-800 hover:text-black"
          }`}
          title="点击打开"
        >
          {href}
        </button>
        <button
          type="button"
          onClick={() => void onOpen()}
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
            isDark
              ? "border-neutral-800 text-neutral-300 hover:bg-neutral-900/50"
              : "border-neutral-100 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          <Icon name="share" className="w-3.5 h-3.5" />
          打开
        </button>
      </div>
    </div>
  );
}

function ExperienceModeRow({
  value,
  isDark,
  onChange,
}: {
  value: ExperienceMode;
  isDark: boolean;
  onChange?: (mode: ExperienceMode) => void;
}) {
  const modes: ExperienceMode[] = ["safe", "full"];

  return (
    <div
      className={`flex items-start justify-between gap-6 py-3 border-b last:border-b-0 ${
        isDark ? "border-neutral-800" : "border-neutral-100"
      }`}
    >
      <span className={`shrink-0 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
        系统级别
      </span>
      {onChange ? (
        <div
          className={`inline-flex rounded-lg border p-0.5 ${
            isDark ? "border-neutral-800 bg-neutral-900/50" : "border-neutral-200 bg-neutral-50"
          }`}
          role="radiogroup"
          aria-label="系统级别"
        >
          {modes.map(mode => {
            const selected = value === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(mode)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  selected
                    ? "bg-[#5856D6] text-white shadow-sm"
                    : isDark
                      ? "text-neutral-400 hover:text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {EXPERIENCE_MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      ) : (
        <span className={`text-xs ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
          {EXPERIENCE_MODE_LABELS[value]}
        </span>
      )}
    </div>
  );
}

function StatusBadge({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
        ok
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
        aria-hidden
      />
      {label}
    </span>
  );
}

function SectionCard({
  title,
  description,
  children,
  isDark,
  subtleBorder,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  isDark: boolean;
  subtleBorder: string;
}) {
  return (
    <div className={`rounded-2xl border ${subtleBorder} overflow-hidden`}>
      <div className={`px-5 py-4 border-b ${subtleBorder}`}>
        <h4 className="text-sm font-semibold">{title}</h4>
        {description ? (
          <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            {description}
          </p>
        ) : null}
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

interface SystemInfoPanelProps {
  theme: ThemeMode;
  experienceMode?: ExperienceMode;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
  installedPluginCount: number;
  runningPluginCount: number;
}

export function SystemInfoPanel({
  theme,
  experienceMode = "safe",
  onExperienceModeChange,
  installedPluginCount,
  runningPluginCount,
}: SystemInfoPanelProps) {
  const [activeSection, setActiveSection] = useState<SystemInfoSection>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusResponse | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeBaseUrl, setRuntimeBaseUrl] = useState<string | null>(null);

  const isDark = isDarkTheme(theme);
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-100";
  const mutedBg = isDark ? "bg-neutral-900/40" : "bg-neutral-50";

  const openExternalUrl = useCallback(async (url: string) => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch {
      // ignore
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const loadData = useCallback(async () => {
    const info = await loadAppInfo();
    setAppInfo(info);

    try {
      const baseUrl = await waitForRuntimeReady();
      setRuntimeBaseUrl(baseUrl);
      const [h, status] = await Promise.all([
        fetchHealth(baseUrl),
        fetchStatus(baseUrl),
      ]);
      setHealth(h);
      setRuntimeStatus(status);
      setRuntimeError(null);
    } catch (err) {
      setHealth(null);
      setRuntimeStatus(null);
      setRuntimeBaseUrl(null);
      setRuntimeError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadData();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const runtimeOk = runtimeStatus?.ok ?? false;
  const dbOk = runtimeStatus?.db === "ready";
  const swaggerUrl = runtimeBaseUrl ? `${runtimeBaseUrl.replace(/\/+$/, "")}/swagger/` : null;
  const frontendWebUrl = resolveBrowserFrontendUrl();

  const renderOverview = () => (
    <div className="space-y-5">
      <div
        className={`rounded-2xl border ${subtleBorder} p-6 ${
          isDark ? "bg-gradient-to-br from-[#5856D6]/10 to-transparent" : "bg-gradient-to-br from-[#5856D6]/5 to-white"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5856D6]">
              ORBIT Reader
            </p>
            <h3 className="text-2xl font-bold mt-1">{appInfo?.name ?? "Orbit Reader"}</h3>
            <p className={`text-sm mt-2 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              版本 {appInfo?.version ?? "—"} · {detectPlatformLabel()} · {detectBuildModeLabel()}
            </p>
          </div>
          <div className="shrink-0 w-12 h-12 rounded-2xl bg-[#5856D6]/10 flex items-center justify-center">
            <Icon name="info" className="w-6 h-6 text-[#5856D6]" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`rounded-2xl border ${subtleBorder} p-4`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            运行状态
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge ok={runtimeOk} label={runtimeOk ? "Runtime 正常" : "Runtime 异常"} />
            <StatusBadge ok={dbOk} label={dbOk ? "数据库就绪" : "数据库异常"} />
          </div>
        </div>
        <div className={`rounded-2xl border ${subtleBorder} p-4`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            插件
          </p>
          <p className="text-lg font-bold mt-2">{installedPluginCount} 个已安装</p>
          <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            运行中 {runningPluginCount} 个
          </p>
        </div>
      </div>

      <SectionCard
        title="快速信息"
        isDark={isDark}
        subtleBorder={subtleBorder}
      >
        <InfoRow label="应用版本" value={appInfo?.version ?? "—"} isDark={isDark} />
        <InfoRow label="Runtime 版本" value={runtimeStatus?.runtime ?? health?.version ?? "—"} isDark={isDark} />
        <InfoRow label="Tauri 版本" value={appInfo?.tauriVersion ?? "—"} isDark={isDark} />
        <InfoRow label="运行平台" value={detectPlatformLabel()} isDark={isDark} />
      </SectionCard>
    </div>
  );

  const renderApplication = () => (
    <SectionCard
      title="应用信息"
      description="桌面壳与打包标识"
      isDark={isDark}
      subtleBorder={subtleBorder}
    >
      <InfoRow label="产品名称" value={appInfo?.name ?? "—"} isDark={isDark} />
      <InfoRow label="版本号" value={appInfo?.version ?? "—"} isDark={isDark} />
      <InfoRow label="Bundle ID" value={appInfo?.identifier ?? "—"} mono isDark={isDark} />
      <InfoRow label="Tauri 版本" value={appInfo?.tauriVersion ?? "—"} isDark={isDark} />
      <InfoRow label="运行环境" value={appInfo?.isTauri ? "Tauri 桌面应用" : "浏览器预览"} isDark={isDark} />
      <InfoRow label="构建模式" value={detectBuildModeLabel()} isDark={isDark} />
      <InfoRow label="运行平台" value={detectPlatformLabel()} isDark={isDark} />
    </SectionCard>
  );

  const renderRuntime = () => (
    <div className="space-y-5">
      {runtimeError ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          无法连接 Runtime：{runtimeError}
        </div>
      ) : null}

      <SectionCard
        title="Runtime 服务"
        description="Go 侧本地服务与健康检查"
        isDark={isDark}
        subtleBorder={subtleBorder}
      >
        <InfoRow
          label="服务状态"
          value={runtimeOk ? "正常运行" : runtimeError ? "未连接" : "异常"}
          isDark={isDark}
        />
        <InfoRow label="Runtime 版本" value={runtimeStatus?.runtime ?? health?.version ?? "—"} isDark={isDark} />
        <InfoRow label="Health 检查" value={health?.ok ? "通过" : "失败"} isDark={isDark} />
        {swaggerUrl ? (
          <LinkRow
            label="Swagger"
            href={swaggerUrl}
            isDark={isDark}
            onOpen={() => openExternalUrl(swaggerUrl)}
          />
        ) : (
          <InfoRow label="Swagger" value="—" isDark={isDark} />
        )}
        {frontendWebUrl ? (
          <LinkRow
            label="前端地址"
            href={frontendWebUrl}
            isDark={isDark}
            onOpen={() => openExternalUrl(frontendWebUrl)}
          />
        ) : (
          <InfoRow label="前端地址" value="—" isDark={isDark} />
        )}
        <ExperienceModeRow
          value={experienceMode}
          isDark={isDark}
          onChange={onExperienceModeChange}
        />
      </SectionCard>

      <SectionCard
        title="数据存储"
        description="SQLite 本地数据库"
        isDark={isDark}
        subtleBorder={subtleBorder}
      >
        <InfoRow
          label="数据库状态"
          value={
            runtimeStatus?.db === "ready"
              ? "就绪"
              : runtimeStatus?.db === "unavailable"
                ? "不可用"
                : runtimeStatus?.db === "error"
                  ? "错误"
                  : "—"
          }
          isDark={isDark}
        />
        <InfoRow
          label="SQLite 路径"
          value={runtimeStatus?.sqlite_path?.trim() || "—"}
          mono
          isDark={isDark}
        />
      </SectionCard>
    </div>
  );

  const renderUpdates = () => (
    <div className="space-y-5">
      <div
        className={`rounded-2xl border ${subtleBorder} p-6 flex flex-col sm:flex-row sm:items-center gap-4`}
      >
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold">当前版本</h4>
          <p className="text-2xl font-bold mt-2 text-[#5856D6]">v{appInfo?.version ?? "—"}</p>
          <p className={`text-xs mt-2 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            发布渠道：稳定版
          </p>
        </div>
        <div className="shrink-0">
          <StatusBadge ok label="已是最新版本" />
        </div>
      </div>

      <SectionCard
        title="更新说明"
        description="自动更新功能即将推出"
        isDark={isDark}
        subtleBorder={subtleBorder}
      >
        <div className={`px-0 py-3 text-xs leading-relaxed ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
          <p>当前版本暂无可用更新。后续将支持自动检测新版本、查看更新日志与一键升级。</p>
          <ul className="mt-3 space-y-1.5 list-disc list-inside">
            <li>应用版本：{appInfo?.version ?? "—"}</li>
            <li>Runtime 版本：{runtimeStatus?.runtime ?? "—"}</li>
            <li>上次检查：{loading ? "—" : "刚刚"}</li>
          </ul>
        </div>
      </SectionCard>

      <SectionCard
        title="版本历史"
        isDark={isDark}
        subtleBorder={subtleBorder}
      >
        <div className="py-3 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">v0.1.0</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${mutedBg} text-neutral-500`}>
                当前
              </span>
            </div>
            <p className={`text-xs mt-1.5 leading-relaxed ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              首个公开测试版本，包含插件市场、RSS/WASM 插件支持与本地 Runtime 服务。
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const sectionContent: Record<SystemInfoSection, () => ReactNode> = {
    overview: renderOverview,
    application: renderApplication,
    runtime: renderRuntime,
    updates: renderUpdates,
  };

  const activeMeta = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="flex-1 min-h-0 flex">
      <aside className={`w-52 shrink-0 border-r ${subtleBorder} px-4 py-5 overflow-y-auto flex flex-col`}>
        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-3">
          系统信息
        </p>
        <nav className="space-y-0.5 flex-1 min-h-0">
          {SECTIONS.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                activeSection === section.id
                  ? "bg-[#5856D6]/10 text-[#5856D6] font-medium"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
              }`}
            >
              <Icon name={section.icon} className="w-4 h-4 shrink-0" />
              <span className="truncate text-left">{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className={`shrink-0 px-6 py-4 border-b ${subtleBorder} flex items-center justify-between gap-4`}>
          <div>
            <h3 className="text-base font-bold">{activeMeta?.label ?? "系统信息"}</h3>
            <p className={`text-sm mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              {activeSection === "overview" && "应用与服务的整体状态概览"}
              {activeSection === "application" && "桌面应用标识与构建信息"}
              {activeSection === "runtime" && "本地 Runtime 与数据库详情"}
              {activeSection === "updates" && "版本检查与更新记录"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${subtleBorder} ${
              isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
            } disabled:opacity-50`}
          >
            <Icon name="refresh" className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto px-6 py-5 ${isDark ? "bg-neutral-950/30" : "bg-neutral-100/80"}`}>
          {loading ? (
            <p className="text-sm text-neutral-400 text-center py-16">加载系统信息…</p>
          ) : (
            sectionContent[activeSection]()
          )}
        </div>
      </div>
    </div>
  );
}
