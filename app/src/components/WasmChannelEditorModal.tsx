import { useState, type ChangeEvent } from "react";
import type { ThemeMode } from "@/types";
import { slugifyChannelId } from "@/lib/channelId";
import { normalizeChannelStatus, type ChannelStatus } from "@/lib/channelStatus";
import {
  type ChannelFeaturesForm,
  type ChannelParamRow,
  createDefaultFeaturesForm,
  createParamRow,
  paramsToRecord,
  validateFeaturesForm,
} from "@/lib/wasmManifestForm";
import { WasmChannelFeaturesEditor } from "@/components/WasmChannelFeaturesEditor";

export type WasmChannelFormRow = {
  _key: string;
  id: string;
  label: string;
  route: string;
  paramRows: ChannelParamRow[];
  features: ChannelFeaturesForm;
  status: ChannelStatus;
  idAuto: boolean;
};

export function createWasmChannelRow(
  partial: Partial<
    Pick<WasmChannelFormRow, "id" | "label" | "route" | "paramRows" | "features" | "status">
  > = {},
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
    paramRows: partial.paramRows ?? [],
    features: partial.features ?? createDefaultFeaturesForm(),
    status: partial.status ?? "enabled",
    idAuto,
  };
}

export function isWasmChannelIdSyncedWithLabel(row: WasmChannelFormRow): boolean {
  if (row.idAuto) return true;
  const slug = slugifyChannelId(row.label);
  if (slug && row.id === slug) return true;
  return row.id === "main" && row.label === "默认";
}

function StyledSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={`w-full appearance-none pr-8 ${className}`}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[10px]">
        ▾
      </span>
    </div>
  );
}

type ChannelEditorTab = "basic" | "params" | "features";

const CHANNEL_EDITOR_TABS: { id: ChannelEditorTab; label: string }[] = [
  { id: "basic", label: "基本信息" },
  { id: "params", label: "路由参数" },
  { id: "features", label: "功能特性" },
];

export type WasmChannelEditorState =
  | { mode: "add" }
  | { mode: "edit"; key: string };

export function WasmChannelEditorModal({
  theme,
  mode,
  initialRow,
  onClose,
  onSave,
}: {
  theme: ThemeMode;
  mode: "add" | "edit";
  initialRow: WasmChannelFormRow;
  onClose: () => void;
  onSave: (row: WasmChannelFormRow) => void;
}) {
  const isDark = theme === "dark";
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const mutedBg = isDark ? "bg-neutral-900/50" : "bg-neutral-50";
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
  const inputBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const inputText = isDark
    ? "text-neutral-100 placeholder:text-neutral-500"
    : "text-neutral-900 placeholder:text-neutral-400";
  const inputClass = `w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`;

  const [draft, setDraft] = useState<WasmChannelFormRow>(initialRow);
  const [activeTab, setActiveTab] = useState<ChannelEditorTab>("basic");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const id = draft.id.trim();
    const label = draft.label.trim();
    const route = draft.route.trim();

    if (!id || !label || !route) {
      setError("请填写 ID、名称与 route");
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
      setError(`频道 ID「${id}」格式无效`);
      return;
    }

    const featureError = validateFeaturesForm(draft.features);
    if (featureError) {
      setError(featureError);
      setActiveTab("features");
      return;
    }

    try {
      paramsToRecord(draft.paramRows);
    } catch (e) {
      setError(`params 无效：${e instanceof Error ? e.message : String(e)}`);
      setActiveTab("params");
      return;
    }

    onSave({
      ...draft,
      id,
      label,
      route,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={e => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`w-full max-w-2xl rounded-[24px] overflow-hidden border shadow-2xl ${panelBg} ${subtleBorder}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`px-6 py-4 border-b ${subtleBorder}`}>
          <h4 className="text-sm font-semibold">{mode === "add" ? "添加频道" : "编辑频道"}</h4>
          <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
            配置频道基本信息、路由参数与 features 能力声明
          </p>
        </div>

        <div className={`px-6 pt-4 flex gap-1 border-b ${subtleBorder}`}>
          {CHANNEL_EDITOR_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-colors ${
                activeTab === tab.id
                  ? isDark
                    ? "bg-neutral-800 text-[#B7B5FF]"
                    : "bg-neutral-100 text-[#5856D6]"
                  : isDark
                    ? "text-neutral-400 hover:text-neutral-200"
                    : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 max-h-[min(520px,70vh)] overflow-y-auto">
          {activeTab === "basic" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
                  >
                    显示名称 label
                  </label>
                  <input
                    value={draft.label}
                    onChange={e => {
                      const v = e.target.value;
                      setDraft(prev => {
                        const slug = slugifyChannelId(v);
                        const synced = isWasmChannelIdSyncedWithLabel(prev);
                        return {
                          ...prev,
                          label: v,
                          ...(synced && slug ? { id: slug, idAuto: true } : {}),
                        };
                      });
                    }}
                    placeholder="显示名称"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
                  >
                    ID
                  </label>
                  <input
                    value={draft.id}
                    onChange={e => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
                      setDraft(prev => ({ ...prev, id: v, idAuto: false }));
                    }}
                    placeholder="id（根据名称自动生成）"
                    className={`${inputClass} ${
                      draft.idAuto ? (isDark ? "text-neutral-400" : "text-neutral-500") : ""
                    }`}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
                >
                  route
                </label>
                <input
                  value={draft.route}
                  onChange={e => setDraft(prev => ({ ...prev, route: e.target.value }))}
                  placeholder="/plugin/route"
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div className="space-y-1">
                <label
                  className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
                >
                  状态 status
                </label>
                <StyledSelect
                  value={draft.status}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      status: normalizeChannelStatus(e.target.value),
                    }))
                  }
                  className={`${inputBg} ${inputBorder} ${inputText} px-3 py-2 text-xs rounded-xl border`}
                >
                  <option value="enabled">enabled — 启用</option>
                  <option value="disabled">disabled — 停用</option>
                </StyledSelect>
              </div>
            </div>
          ) : null}

          {activeTab === "params" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className={`text-[11px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                  路由占位符参数 (params)，键值对会写入 manifest.config.channels[].params
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDraft(prev => ({
                      ...prev,
                      paramRows: [...prev.paramRows, createParamRow()],
                    }))
                  }
                  className="text-[11px] font-semibold text-[#5856D6] hover:underline"
                >
                  + 添加参数
                </button>
              </div>
              {draft.paramRows.length === 0 ? (
                <p className={`text-xs text-center py-8 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                  暂无参数，点击「添加参数」配置 route 占位符
                </p>
              ) : (
                <div className="space-y-2">
                  {draft.paramRows.map((row, index) => (
                    <div key={row._key} className="flex items-center gap-2">
                      <input
                        value={row.key}
                        onChange={e =>
                          setDraft(prev => ({
                            ...prev,
                            paramRows: prev.paramRows.map((r, i) =>
                              i === index ? { ...r, key: e.target.value } : r,
                            ),
                          }))
                        }
                        placeholder="key"
                        className={`flex-1 ${inputClass} font-mono`}
                      />
                      <input
                        value={row.value}
                        onChange={e =>
                          setDraft(prev => ({
                            ...prev,
                            paramRows: prev.paramRows.map((r, i) =>
                              i === index ? { ...r, value: e.target.value } : r,
                            ),
                          }))
                        }
                        placeholder="value"
                        className={`flex-[2] ${inputClass} font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft(prev => ({
                            ...prev,
                            paramRows: prev.paramRows.filter((_, i) => i !== index),
                          }))
                        }
                        className="px-2 py-2 text-xs text-rose-500 hover:underline shrink-0"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "features" ? (
            <WasmChannelFeaturesEditor
              theme={theme}
              value={draft.features}
              onChange={features => setDraft(prev => ({ ...prev, features }))}
            />
          ) : null}

          {error ? <p className="text-xs text-rose-500 mt-4">{error}</p> : null}
        </div>

        <div className={`px-6 py-4 flex items-center justify-end gap-3 border-t ${subtleBorder} ${mutedBg}`}>
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
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#5856D6] hover:bg-[#4a48c4]"
          >
            {mode === "add" ? "添加" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
