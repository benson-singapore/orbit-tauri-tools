import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { isDarkTheme } from "@/lib/themeMode";
import { loadFavoriteVoices } from "@/lib/ttsVoiceStorage";
import type { TTSVoiceItem } from "@/lib/ttsApi";
import type { ThemeMode } from "@/types";

interface DefaultTTSVoiceModalProps {
  theme: ThemeMode;
  currentVoiceId?: string | null;
  onSelect: (voice: TTSVoiceItem) => void;
  onClose: () => void;
}

export function DefaultTTSVoiceModal({
  theme,
  currentVoiceId,
  onSelect,
  onClose,
}: DefaultTTSVoiceModalProps) {
  const isDark = isDarkTheme(theme);
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
  const cardBg = isDark ? "bg-neutral-900/50 hover:bg-neutral-900/80" : "bg-neutral-50 hover:bg-neutral-100";
  const [voices, setVoices] = useState<TTSVoiceItem[]>(() => loadFavoriteVoices());

  useEffect(() => {
    const refresh = () => setVoices(loadFavoriteVoices());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg max-h-[min(80vh,640px)] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${subtleBorder} ${panelBg}`}
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="default-tts-voice-title"
      >
        <div className={`shrink-0 px-5 py-4 border-b ${subtleBorder} flex items-center justify-between gap-3`}>
          <div>
            <h2 id="default-tts-voice-title" className="text-base font-bold">
              设置默认朗读者
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              从收藏列表中选择朗读时使用的朗读者
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${
              isDark ? "hover:bg-neutral-800 text-neutral-400" : "hover:bg-neutral-100 text-neutral-500"
            }`}
            aria-label="关闭"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {voices.length === 0 ? (
            <div className={`rounded-xl border p-6 text-sm text-center ${subtleBorder} ${
              isDark ? "text-neutral-400" : "text-neutral-500"
            }`}>
              暂无收藏的朗读者。请先在 TTS 设置的朗读者列表中收藏后再选择。
            </div>
          ) : (
            <div className="space-y-2">
              {voices.map(voice => {
                const selected = voice.id === currentVoiceId;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => onSelect(voice)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${subtleBorder} ${cardBg} ${
                      selected ? "ring-2 ring-[#5856D6]/40 border-[#5856D6]/30" : ""
                    }`}
                  >
                    <img
                      src={voice.icon || ""}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover shrink-0 bg-neutral-200 dark:bg-neutral-800"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{voice.title || voice.label}</p>
                      <p className={`text-xs mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                        {voice.language || "未知语言"}
                      </p>
                    </div>
                    {selected ? (
                      <Icon name="check" className="w-4 h-4 text-[#5856D6] shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
