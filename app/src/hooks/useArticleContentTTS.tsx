import { useCallback, useEffect, useRef, useState } from "react";
import { ArticleTTSSelectionToolbar } from "@/components/ArticleTTSSelectionToolbar";
import { DefaultTTSVoiceModal } from "@/components/DefaultTTSVoiceModal";
import {
  applyMarkToRange,
  bindArticleContentTTSSelection,
  clearMarksByClass,
  promoteMarksClass,
  TTS_PENDING_MARK_CLASS,
  TTS_READ_MARK_CLASS,
  type ArticleTTSSelectionPayload,
} from "@/lib/articleContentTTS";
import {
  buildVoicePreviewUrl,
  createTTSVoice,
  fetchTTSConfig,
  type TTSConfig,
  type TTSVoiceItem,
} from "@/lib/ttsApi";
import {
  loadDefaultTTSVoice,
  persistDefaultTTSVoice,
  TTS_VOICE_STORAGE_KEYS,
} from "@/lib/ttsVoiceStorage";
import type { ThemeMode } from "@/types";

type SelectionSnapshot = {
  text: string;
  range: Range;
};

export function useArticleContentTTS(theme: ThemeMode) {
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [selectionSnapshot, setSelectionSnapshot] = useState<SelectionSnapshot | null>(null);
  const [defaultVoice, setDefaultVoice] = useState<TTSVoiceItem | null>(() => loadDefaultTTSVoice());
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [hasReadMark, setHasReadMark] = useState(false);
  const [hasActivated, setHasActivated] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsConfigRef = useRef<TTSConfig | null>(null);
  const pendingReadTextRef = useRef<string | null>(null);
  const contentRootRef = useRef<HTMLElement | null>(null);
  const pendingMarksRef = useRef<HTMLElement[]>([]);
  const readMarksRef = useRef<HTMLElement[]>([]);
  const lastSnapshotRef = useRef<SelectionSnapshot | null>(null);

  const clearPendingMarks = useCallback((root?: HTMLElement | null) => {
    const target = root ?? contentRootRef.current;
    if (target) {
      clearMarksByClass(target, TTS_PENDING_MARK_CLASS);
    }
    pendingMarksRef.current = [];
  }, []);

  const clearReadMarks = useCallback((root?: HTMLElement | null) => {
    const target = root ?? contentRootRef.current;
    if (target) {
      clearMarksByClass(target, TTS_READ_MARK_CLASS);
    }
    readMarksRef.current = [];
    setHasReadMark(false);
  }, []);

  const applyPendingHighlight = useCallback((range: Range) => {
    const root = contentRootRef.current;
    if (!root) return;

    clearPendingMarks(root);
    pendingMarksRef.current = applyMarkToRange(range, TTS_PENDING_MARK_CLASS);
    window.getSelection()?.removeAllRanges();
  }, [clearPendingMarks]);

  const handleSelection = useCallback((payload: ArticleTTSSelectionPayload | null) => {
    if (!payload) {
      if (lastSnapshotRef.current) {
        setSelectionSnapshot(lastSnapshotRef.current);
      }
      return;
    }

    const snapshot: SelectionSnapshot = {
      text: payload.text,
      range: payload.range,
    };
    lastSnapshotRef.current = snapshot;
    setSelectionSnapshot(snapshot);
    setHasActivated(true);
    setReadError(null);
    applyPendingHighlight(payload.range);
    setToolbarExpanded(true);
  }, [applyPendingHighlight]);

  useEffect(() => {
    const syncDefaultVoice = () => setDefaultVoice(loadDefaultTTSVoice());
    const onStorage = (event: StorageEvent) => {
      if (event.key === TTS_VOICE_STORAGE_KEYS.defaultVoice) {
        syncDefaultVoice();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      audioRef.current?.pause();
    };
  }, []);

  const bindTTS = useCallback(
    (root: HTMLElement | null, options?: { enabled?: boolean }) => {
      if (!root) return () => {};

      contentRootRef.current = root;
      clearPendingMarks(root);
      clearReadMarks(root);
      setSelectionSnapshot(null);
      lastSnapshotRef.current = null;
      setHasReadMark(false);
      setHasActivated(false);
      setToolbarExpanded(false);
      setReadError(null);

      return bindArticleContentTTSSelection(root, {
        enabled: options?.enabled,
        onSelection: handleSelection,
      });
    },
    [clearPendingMarks, clearReadMarks, handleSelection],
  );

  const ensureTTSConfig = useCallback(async (): Promise<TTSConfig> => {
    if (ttsConfigRef.current?.api_url.trim()) {
      return ttsConfigRef.current;
    }
    const config = await fetchTTSConfig();
    ttsConfigRef.current = config;
    return config;
  }, []);

  const playText = useCallback(async (text: string, voice: TTSVoiceItem) => {
    const config = await ensureTTSConfig();
    if (!config.api_url.trim()) {
      throw new Error("请先在 TTS 设置中配置服务地址");
    }

    const result = await createTTSVoice(config, {
      cache: true,
      speaker: voice.value,
      text_content: text,
    });

    audioRef.current?.pause();
    const audio = new Audio(buildVoicePreviewUrl(config.api_url, result.file_path));
    audioRef.current = audio;

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("音频播放失败"));
      void audio.play().catch(reject);
    });
  }, [ensureTTSConfig]);

  const promotePendingToRead = useCallback(() => {
    const root = contentRootRef.current;
    if (!root) return;

    clearReadMarks(root);

    if (pendingMarksRef.current.length > 0) {
      promoteMarksClass(pendingMarksRef.current, TTS_PENDING_MARK_CLASS, TTS_READ_MARK_CLASS);
      readMarksRef.current = [...pendingMarksRef.current];
      pendingMarksRef.current = [];
      setHasReadMark(true);
      return;
    }

    const snapshot = selectionSnapshot ?? lastSnapshotRef.current;
    if (!snapshot) return;

    const marks = applyMarkToRange(snapshot.range, TTS_READ_MARK_CLASS);
    readMarksRef.current = marks;
    pendingMarksRef.current = [];
    setHasReadMark(marks.length > 0);
    window.getSelection()?.removeAllRanges();
  }, [clearReadMarks, selectionSnapshot]);

  const handleReadAloud = useCallback(async () => {
    const snapshot = selectionSnapshot ?? lastSnapshotRef.current;
    const text = snapshot?.text?.trim();
    if (!text) return;

    if (!defaultVoice) {
      pendingReadTextRef.current = text;
      setShowVoiceModal(true);
      return;
    }

    setReading(true);
    setReadError(null);
    try {
      promotePendingToRead();
      await playText(text, defaultVoice);
    } catch (err) {
      setReadError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
    }
  }, [defaultVoice, playText, promotePendingToRead, selectionSnapshot]);

  const handleSelectDefaultVoice = useCallback((voice: TTSVoiceItem) => {
    persistDefaultTTSVoice(voice);
    setDefaultVoice(voice);
    setShowVoiceModal(false);

    const pendingText = pendingReadTextRef.current;
    if (!pendingText) return;

    pendingReadTextRef.current = null;
    void (async () => {
      setReading(true);
      setReadError(null);
      try {
        promotePendingToRead();
        await playText(pendingText, voice);
      } catch (err) {
        setReadError(err instanceof Error ? err.message : String(err));
      } finally {
        setReading(false);
      }
    })();
  }, [playText, promotePendingToRead]);

  const handleStopReading = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setReading(false);
  }, []);

  const toolbarVisible = Boolean(
    hasActivated
    || selectionSnapshot
    || hasReadMark
    || reading,
  );

  const ttsOverlays = (
    <>
      <ArticleTTSSelectionToolbar
        theme={theme}
        expanded={toolbarExpanded}
        visible={toolbarVisible}
        selectedText={selectionSnapshot?.text ?? lastSnapshotRef.current?.text ?? null}
        defaultVoice={defaultVoice}
        reading={reading}
        readError={readError}
        hasReadMark={hasReadMark}
        onToggleExpanded={() => setToolbarExpanded(open => !open)}
        onSetDefaultVoice={() => setShowVoiceModal(true)}
        onReadAloud={() => void handleReadAloud()}
        onStopReading={handleStopReading}
      />
      {showVoiceModal ? (
        <DefaultTTSVoiceModal
          theme={theme}
          currentVoiceId={defaultVoice?.id}
          onSelect={handleSelectDefaultVoice}
          onClose={() => {
            pendingReadTextRef.current = null;
            setShowVoiceModal(false);
          }}
        />
      ) : null}
    </>
  );

  return {
    bindTTS,
    ttsOverlays,
  };
}
