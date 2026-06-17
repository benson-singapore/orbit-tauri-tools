import { useState, type ChangeEvent, type ReactNode } from "react";
import type { ChannelFeatures, ThemeMode } from "@/types";
import {
  type ChannelFeaturesForm,
  type PaginationForm,
  featuresFromChannel,
  featuresToChannel,
  validateFeaturesForm,
} from "@/lib/wasmManifestForm";

type FieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  isDark: boolean;
};

function Field({ label, hint, children, isDark }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className={`text-[10px] font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className={`text-[10px] leading-relaxed ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type ToggleRowProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  isDark: boolean;
};

function ToggleRow({ label, description, checked, onChange, isDark }: ToggleRowProps) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer">
      <div className="min-w-0">
        <span className="text-xs font-semibold">{label}</span>
        {description ? (
          <p className={`text-[10px] mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[#5856D6]" : isDark ? "bg-neutral-600" : "bg-neutral-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function PaginationFields({
  value,
  onChange,
  isDark,
  inputClass,
}: {
  value: PaginationForm;
  onChange: (next: PaginationForm) => void;
  isDark: boolean;
  inputClass: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="style" isDark={isDark}>
        <select
          value={value.style}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChange({ ...value, style: e.target.value as PaginationForm["style"] })
          }
          className={inputClass}
        >
          <option value="offset">offset</option>
          <option value="cursor">cursor</option>
          <option value="lastId">lastId</option>
        </select>
      </Field>
      <Field label="param" isDark={isDark}>
        <input
          value={value.param}
          onChange={e => onChange({ ...value, param: e.target.value })}
          placeholder="page"
          className={inputClass}
        />
      </Field>
      <Field label="default" isDark={isDark}>
        <input
          value={value.defaultValue}
          onChange={e => onChange({ ...value, defaultValue: e.target.value })}
          placeholder="1"
          className={inputClass}
        />
      </Field>
      <Field label="idFrom" isDark={isDark}>
        <input
          value={value.idFrom}
          onChange={e => onChange({ ...value, idFrom: e.target.value })}
          placeholder="item.id"
          className={inputClass}
        />
      </Field>
      <Field label="sizeParam" isDark={isDark}>
        <input
          value={value.sizeParam}
          onChange={e => onChange({ ...value, sizeParam: e.target.value })}
          placeholder="size"
          className={inputClass}
        />
      </Field>
      <Field label="defaultSize" isDark={isDark}>
        <input
          type="number"
          value={value.defaultSize}
          onChange={e => onChange({ ...value, defaultSize: e.target.value })}
          placeholder="20"
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function FeatureSection({
  title,
  enabled,
  onToggle,
  children,
  isDark,
  borderClass,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
  isDark: boolean;
  borderClass: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${borderClass}`}>
      <ToggleRow label={title} checked={enabled} onChange={onToggle} isDark={isDark} />
      {enabled ? children : null}
    </div>
  );
}

export function WasmChannelFeaturesEditor({
  theme,
  value,
  onChange,
}: {
  theme: ThemeMode;
  value: ChannelFeaturesForm;
  onChange: (next: ChannelFeaturesForm) => void;
}) {
  const isDark = theme === "dark";
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const inputBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const inputText = isDark
    ? "text-neutral-100 placeholder:text-neutral-500"
    : "text-neutral-900 placeholder:text-neutral-400";
  const inputClass = `w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 ${inputBg} ${inputBorder} ${inputText}`;
  const borderClass = isDark ? "border-neutral-800" : "border-neutral-200";

  const validationError = validateFeaturesForm(value);

  const patch = (partial: Partial<ChannelFeaturesForm>) => {
    const next = { ...value, ...partial };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <FeatureSection
        title="Feed 列表 (features.feed)"
        enabled={value.feedCustomized}
        onToggle={feedCustomized => patch({ feedCustomized })}
        isDark={isDark}
        borderClass={borderClass}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ToggleRow
            label="persist 持久化列表"
            description="关闭后为动态列表（不读数据库）"
            checked={value.feedPersist}
            onChange={feedPersist => patch({ feedPersist })}
            isDark={isDark}
          />
          <ToggleRow
            label="refresh 支持刷新"
            checked={value.feedRefresh}
            onChange={feedRefresh => patch({ feedRefresh })}
            isDark={isDark}
          />
          <Field label="limit 抓取数量上限" isDark={isDark}>
            <input
              type="number"
              value={value.feedLimit}
              onChange={e => patch({ feedLimit: e.target.value })}
              placeholder="100"
              className={inputClass}
            />
          </Field>
        </div>
      </FeatureSection>

      <FeatureSection
        title="分页 (features.pagination)"
        enabled={value.paginationEnabled}
        onToggle={paginationEnabled => patch({ paginationEnabled })}
        isDark={isDark}
        borderClass={borderClass}
      >
        <PaginationFields
          value={value.pagination}
          onChange={pagination => patch({ pagination })}
          isDark={isDark}
          inputClass={inputClass}
        />
      </FeatureSection>

      <FeatureSection
        title="搜索 (features.search)"
        enabled={value.searchEnabled}
        onToggle={searchEnabled => patch({ searchEnabled })}
        isDark={isDark}
        borderClass={borderClass}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="param" isDark={isDark}>
            <input
              value={value.searchParam}
              onChange={e => patch({ searchParam: e.target.value })}
              placeholder="query"
              className={inputClass}
            />
          </Field>
          <ToggleRow
            label="required 必填"
            checked={value.searchRequired}
            onChange={searchRequired => patch({ searchRequired })}
            isDark={isDark}
          />
        </div>
      </FeatureSection>

      <FeatureSection
        title="详情 (features.detail)"
        enabled={value.detailEnabled}
        onToggle={detailEnabled => patch({ detailEnabled })}
        isDark={isDark}
        borderClass={borderClass}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="route *" isDark={isDark}>
            <input
              value={value.detailRoute}
              onChange={e => patch({ detailRoute: e.target.value })}
              placeholder="/detail/:id"
              className={inputClass}
            />
          </Field>
          <Field label="idParam" isDark={isDark}>
            <input
              value={value.detailIdParam}
              onChange={e => patch({ detailIdParam: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="idFrom" isDark={isDark}>
            <input
              value={value.detailIdFrom}
              onChange={e => patch({ detailIdFrom: e.target.value })}
              placeholder="item.id"
              className={inputClass}
            />
          </Field>
          <ToggleRow
            label="persist 持久化详情"
            checked={value.detailPersist}
            onChange={detailPersist => patch({ detailPersist })}
            isDark={isDark}
          />
        </div>
      </FeatureSection>

      <FeatureSection
        title="章节 (features.chapters)"
        enabled={value.chaptersEnabled}
        onToggle={chaptersEnabled => patch({ chaptersEnabled })}
        isDark={isDark}
        borderClass={borderClass}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="route *" isDark={isDark}>
              <input
                value={value.chapters.route}
                onChange={e =>
                  patch({ chapters: { ...value.chapters, route: e.target.value } })
                }
                className={inputClass}
              />
            </Field>
            <Field label="limit" isDark={isDark}>
              <input
                type="number"
                value={value.chapters.limit}
                onChange={e =>
                  patch({ chapters: { ...value.chapters, limit: e.target.value } })
                }
                placeholder="500"
                className={inputClass}
              />
            </Field>
            <Field label="label" isDark={isDark}>
              <input
                value={value.chapters.label}
                onChange={e =>
                  patch({ chapters: { ...value.chapters, label: e.target.value } })
                }
                className={inputClass}
              />
            </Field>
            <Field label="itemLabel" isDark={isDark}>
              <input
                value={value.chapters.itemLabel}
                onChange={e =>
                  patch({ chapters: { ...value.chapters, itemLabel: e.target.value } })
                }
                className={inputClass}
              />
            </Field>
            <Field label="idParam" isDark={isDark}>
              <input
                value={value.chapters.idParam}
                onChange={e =>
                  patch({ chapters: { ...value.chapters, idParam: e.target.value } })
                }
                className={inputClass}
              />
            </Field>
            <Field label="idFrom" isDark={isDark}>
              <input
                value={value.chapters.idFrom}
                onChange={e =>
                  patch({ chapters: { ...value.chapters, idFrom: e.target.value } })
                }
                className={inputClass}
              />
            </Field>
          </div>

          <div className={`rounded-xl border p-3 space-y-3 ${borderClass}`}>
            <ToggleRow
              label="章节分页 (chapters.pagination)"
              checked={value.chapters.paginationEnabled}
              onChange={paginationEnabled =>
                patch({ chapters: { ...value.chapters, paginationEnabled } })
              }
              isDark={isDark}
            />
            {value.chapters.paginationEnabled ? (
              <PaginationFields
                value={value.chapters.pagination}
                onChange={pagination =>
                  patch({ chapters: { ...value.chapters, pagination } })
                }
                isDark={isDark}
                inputClass={inputClass}
              />
            ) : null}
          </div>

          <div className={`rounded-xl border p-3 space-y-3 ${borderClass}`}>
            <ToggleRow
              label="章节详情 (chapters.detail)"
              checked={value.chapters.detailEnabled}
              onChange={detailEnabled =>
                patch({ chapters: { ...value.chapters, detailEnabled } })
              }
              isDark={isDark}
            />
            {value.chapters.detailEnabled ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="route *" isDark={isDark}>
                  <input
                    value={value.chapters.detail.route}
                    onChange={e =>
                      patch({
                        chapters: {
                          ...value.chapters,
                          detail: { ...value.chapters.detail, route: e.target.value },
                        },
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="idParam" isDark={isDark}>
                  <input
                    value={value.chapters.detail.idParam}
                    onChange={e =>
                      patch({
                        chapters: {
                          ...value.chapters,
                          detail: { ...value.chapters.detail, idParam: e.target.value },
                        },
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="parentParam" isDark={isDark}>
                  <input
                    value={value.chapters.detail.parentParam}
                    onChange={e =>
                      patch({
                        chapters: {
                          ...value.chapters,
                          detail: { ...value.chapters.detail, parentParam: e.target.value },
                        },
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="parentFrom" isDark={isDark}>
                  <input
                    value={value.chapters.detail.parentFrom}
                    onChange={e =>
                      patch({
                        chapters: {
                          ...value.chapters,
                          detail: { ...value.chapters.detail, parentFrom: e.target.value },
                        },
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        </div>
      </FeatureSection>

      <div className={`rounded-2xl border p-4 ${borderClass}`}>
        <ToggleRow
          label="高级：直接编辑 JSON"
          checked={showJson}
          onChange={next => {
            if (next) {
              setJsonDraft(JSON.stringify(featuresToChannel(value) ?? {}, null, 2));
              setJsonError(null);
            }
            setShowJson(next);
          }}
          isDark={isDark}
        />
        {showJson ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={jsonDraft}
              onChange={e => {
                setJsonDraft(e.target.value);
                try {
                  const parsed = JSON.parse(e.target.value) as ChannelFeatures;
                  onChange(featuresFromChannel(parsed));
                  setJsonError(null);
                } catch (err) {
                  setJsonError(err instanceof Error ? err.message : String(err));
                }
              }}
              rows={8}
              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[#5856D6]/50 font-mono ${inputBg} ${inputBorder} ${inputText}`}
            />
            {jsonError ? <p className="text-xs text-rose-500">{jsonError}</p> : null}
          </div>
        ) : null}
      </div>

      {validationError ? <p className="text-xs text-rose-500">{validationError}</p> : null}
    </div>
  );
}
