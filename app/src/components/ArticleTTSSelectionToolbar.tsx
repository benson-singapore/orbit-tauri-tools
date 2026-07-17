import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { isDarkTheme } from "@/lib/themeMode";
import type { TTSVoiceItem } from "@/lib/ttsApi";
import type { ThemeMode } from "@/types";

interface ArticleTTSSelectionToolbarProps {
  theme: ThemeMode;
  expanded: boolean;
  visible: boolean;
  selectedText: string | null;
  defaultVoice: TTSVoiceItem | null;
  reading: boolean;
  readError: string | null;
  hasReadMark: boolean;
  onToggleExpanded: () => void;
  onSetDefaultVoice: () => void;
  onReadAloud: () => void;
  onStopReading: () => void;
}

function truncateText(text: string, max = 48): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

export function ArticleTTSSelectionToolbar({
  theme,
  expanded,
  visible,
  selectedText,
  defaultVoice,
  reading,
  readError,
  hasReadMark,
  onToggleExpanded,
  onSetDefaultVoice,
  onReadAloud,
  onStopReading,
}: ArticleTTSSelectionToolbarProps) {
  const isDark = isDarkTheme(theme);
  const defaultVoiceLabel = defaultVoice?.title || defaultVoice?.label;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && expanded) {
        onToggleExpanded();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, onToggleExpanded]);

  if (!visible) return null;

  const panelBg = isDark ? "bg-[#1c1c1e] border-neutral-700 text-neutral-100" : "bg-white border-neutral-200 text-neutral-900";
  const subtleText = isDark ? "text-neutral-400" : "text-neutral-500";

  const toolbar = (
    <div
      className="fixed z-[105] right-5 top-24 flex flex-col items-end gap-2"
      onMouseDown={event => event.preventDefault()}
    >
      {expanded ? (
        <div className={`w-[min(92vw,300px)] rounded-2xl border shadow-2xl overflow-hidden ${panelBg}`}>
          <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${
            isDark ? "border-neutral-700" : "border-neutral-100"
          }`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold">朗读助手</p>
              <p className={`text-[11px] mt-0.5 ${subtleText}`}>
                {hasReadMark ? "紫色为已朗读，闪烁为正在朗读" : "选中文字后可朗读"}
              </p>
            </div>
        <button
          type="button"
          onClick={onToggleExpanded}
          className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg ${
            isDark ? "hover:bg-neutral-800 text-neutral-400" : "hover:bg-neutral-100 text-neutral-500"
          }`}
          aria-label="收起"
        >
          <Icon name="collapse" className="w-4 h-4" />
        </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            {selectedText ? (
              <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                isDark ? "bg-neutral-900/70 text-neutral-300" : "bg-neutral-50 text-neutral-600"
              }`}>
                {truncateText(selectedText, 80)}
              </div>
            ) : (
              <p className={`text-xs ${subtleText}`}>选中文本后，这里会显示待朗读内容</p>
            )}

            <button
              type="button"
              onClick={onSetDefaultVoice}
              className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs ${
                isDark ? "border-neutral-700 hover:bg-neutral-900/60" : "border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <Icon name="audio" className="w-3.5 h-3.5 opacity-70 shrink-0" />
                <span className="truncate">{defaultVoiceLabel || "设置默认朗读者"}</span>
              </span>
              <Icon name="sliders" className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={reading || !selectedText}
                onClick={() => void onReadAloud()}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50 ${
                  reading ? "bg-neutral-500" : "bg-[#5856D6] hover:bg-[#4a48c4]"
                }`}
              >
                {reading ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Icon name="play" className="w-3.5 h-3.5" />
                )}
                {reading ? "朗读中…" : "朗读选中"}
              </button>
              {reading ? (
                <button
                  type="button"
                  onClick={onStopReading}
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border ${
                    isDark ? "border-neutral-700 hover:bg-neutral-900/60" : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                  aria-label="停止朗读"
                >
                  <Icon name="pause" className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            {readError ? (
              <p className="text-[11px] text-rose-500">{readError}</p>
            ) : !defaultVoice ? (
              <p className={`text-[11px] ${subtleText}`}>朗读前请先设置默认朗读者</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggleExpanded}
        className={`relative inline-flex items-center justify-center w-12 h-12 rounded-full border shadow-lg transition-transform ${
          expanded ? "scale-95" : "hover:scale-105"
        } ${isDark ? "bg-[#1c1c1e] border-neutral-700 text-neutral-100" : "bg-white border-neutral-200 text-neutral-900"}`}
        aria-label={expanded ? "收起朗读助手" : "展开朗读助手"}
        title="朗读助手"
      >
        {reading ? (
          <span className="absolute inset-0 rounded-full border-2 border-[#5856D6]/30 border-t-[#5856D6] animate-spin" />
        ) : null}
        <Icon name="audio" className="w-5 h-5" />
        {selectedText && !expanded ? (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#5856D6]" />
        ) : null}
      </button>
    </div>
  );

  return createPortal(toolbar, document.body);
}
