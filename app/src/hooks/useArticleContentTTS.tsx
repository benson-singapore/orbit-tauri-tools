import { useCallback, useEffect, useRef, useState } from "react";
import { ArticleTTSSelectionToolbar } from "@/components/ArticleTTSSelectionToolbar";
import { DefaultTTSVoiceModal } from "@/components/DefaultTTSVoiceModal";
import {
  applyMarkToRange,
  bindArticleContentTTSSelection,
  clearMarksByClass,
  promoteMarksClass,
  scrollMarksIntoView,
  TTS_ACTIVE_MARK_CLASS,
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

type UseArticleContentTTSOptions = {
  experienceUnlocked?: boolean;
};

export function useArticleContentTTS(
  theme: ThemeMode,
  options: UseArticleContentTTSOptions = {},
) {
  const experienceUnlocked = options.experienceUnlocked ?? false;
  const [ttsConfigured, setTtsConfigured] = useState(false);
  const featureEnabled = experienceUnlocked && ttsConfigured;
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
  const activeMarksRef = useRef<HTMLElement[]>([]);
  const readMarksRef = useRef<HTMLElement[]>([]);
  const lastSnapshotRef = useRef<SelectionSnapshot | null>(null);

  const clearPendingMarks = useCallback((root?: HTMLElement | null) => {
    const target = root ?? contentRootRef.current;
    if (target) {
      clearMarksByClass(target, TTS_PENDING_MARK_CLASS);
    }
    pendingMarksRef.current = [];
  }, []);

  const clearActiveMarks = useCallback((root?: HTMLElement | null) => {
    const target = root ?? contentRootRef.current;
    if (target) {
      clearMarksByClass(target, TTS_ACTIVE_MARK_CLASS);
    }
    activeMarksRef.current = [];
  }, []);

  const clearReadMarks = useCallback((root?: HTMLElement | null) => {
    const target = root ?? contentRootRef.current;
    if (target) {
      clearMarksByClass(target, TTS_READ_MARK_CLASS);
      clearMarksByClass(target, TTS_ACTIVE_MARK_CLASS);
    }
    readMarksRef.current = [];
    activeMarksRef.current = [];
    setHasReadMark(false);
  }, []);

  const applyPendingHighlight = useCallback((range: Range) => {
    const root = contentRootRef.current;
    if (!root) return;

    clearPendingMarks(root);
    pendingMarksRef.current = applyMarkToRange(range, TTS_PENDING_MARK_CLASS);
  }, [clearPendingMarks]);

  const handleSelection = useCallback((payload: ArticleTTSSelectionPayload) => {
    const snapshot: SelectionSnapshot = {
      text: payload.text,
      range: payload.range,
    };
    lastSnapshotRef.current = snapshot;
    setSelectionSnapshot(snapshot);
    setHasActivated(true);
    setReadError(null);
    applyPendingHighlight(payload.range);
  }, [applyPendingHighlight]);

  useEffect(() => {
    if (!experienceUnlocked) {
      setTtsConfigured(false);
      return;
    }
    let cancelled = false;
    void fetchTTSConfig().then(config => {
      if (!cancelled) {
        setTtsConfigured(Boolean(config.api_url.trim()));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [experienceUnlocked]);

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
      if (!root || !featureEnabled || options?.enabled === false) return () => {};

      contentRootRef.current = root;
      clearPendingMarks(root);
      clearActiveMarks(root);
      clearReadMarks(root);
      setSelectionSnapshot(null);
      lastSnapshotRef.current = null;
      setHasReadMark(false);
      setHasActivated(false);
      setToolbarExpanded(false);
      setReadError(null);

      return bindArticleContentTTSSelection(root, {
        onSelection: handleSelection,
      });
    },
    [clearActiveMarks, clearPendingMarks, clearReadMarks, featureEnabled, handleSelection],
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

  const promotePendingToActive = useCallback(() => {
    const root = contentRootRef.current;
    if (!root) return [];

    clearReadMarks(root);

    if (pendingMarksRef.current.length > 0) {
      promoteMarksClass(
        pendingMarksRef.current,
        TTS_PENDING_MARK_CLASS,
        TTS_ACTIVE_MARK_CLASS,
      );
      activeMarksRef.current = [...pendingMarksRef.current];
      pendingMarksRef.current = [];
      scrollMarksIntoView(activeMarksRef.current);
      return activeMarksRef.current;
    }

    const snapshot = selectionSnapshot ?? lastSnapshotRef.current;
    if (!snapshot) return [];

    const marks = applyMarkToRange(snapshot.range, TTS_ACTIVE_MARK_CLASS);
    activeMarksRef.current = marks;
    pendingMarksRef.current = [];
    scrollMarksIntoView(marks);
    window.getSelection()?.removeAllRanges();
    return marks;
  }, [clearReadMarks, selectionSnapshot]);

  const finalizeActiveToRead = useCallback(() => {
    if (activeMarksRef.current.length === 0) return;

    promoteMarksClass(
      activeMarksRef.current,
      TTS_ACTIVE_MARK_CLASS,
      TTS_READ_MARK_CLASS,
    );
    readMarksRef.current = [...activeMarksRef.current];
    activeMarksRef.current = [];
    setHasReadMark(readMarksRef.current.length > 0);
  }, []);

  const handleReadAloud = useCallback(async () => {
    const snapshot = selectionSnapshot ?? lastSnapshotRef.current;
    const text = snapshot?.text?.trim();
    if (!text) return;

    if (!defaultVoice) {
      pendingReadTextRef.current = text;
      setShowVoiceModal(true);
      return;
    }

    setReadError(null);
    promotePendingToActive();
    setReading(true);
    try {
      await playText(text, defaultVoice);
      finalizeActiveToRead();
    } catch (err) {
      setReadError(err instanceof Error ? err.message : String(err));
      finalizeActiveToRead();
    } finally {
      setReading(false);
    }
  }, [defaultVoice, finalizeActiveToRead, playText, promotePendingToActive, selectionSnapshot]);

  const handleSelectDefaultVoice = useCallback((voice: TTSVoiceItem) => {
    persistDefaultTTSVoice(voice);
    setDefaultVoice(voice);
    setShowVoiceModal(false);

    const pendingText = pendingReadTextRef.current;
    if (!pendingText) return;

    pendingReadTextRef.current = null;
    void (async () => {
      setReadError(null);
      promotePendingToActive();
      setReading(true);
      try {
        await playText(pendingText, voice);
        finalizeActiveToRead();
      } catch (err) {
        setReadError(err instanceof Error ? err.message : String(err));
        finalizeActiveToRead();
      } finally {
        setReading(false);
      }
    })();
  }, [finalizeActiveToRead, playText, promotePendingToActive]);

  const handleStopReading = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    finalizeActiveToRead();
    setReading(false);
  }, [finalizeActiveToRead]);

  const toolbarVisible = featureEnabled && Boolean(
    hasActivated
    || selectionSnapshot
    || hasReadMark
    || reading,
  );

  const ttsOverlays = featureEnabled ? (
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
  ) : null;

  return {
    bindTTS,
    ttsOverlays,
  };
}
