import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { isDarkTheme } from "@/lib/themeMode";
import {
  buildVoicePreviewUrl,
  createTTSVoice,
  fetchTTSConfig,
  fetchTTSVoiceList,
  saveTTSConfig,
  type TTSConfig,
  type TTSVoiceCreateResult,
  type TTSVoiceFilter,
  type TTSVoiceItem,
} from "@/lib/ttsApi";
import {
  dedupeVoicesById,
  loadFavoriteVoiceIds,
  loadFavoriteVoices,
  persistFavoriteVoiceIds,
  persistFavoriteVoices,
} from "@/lib/ttsVoiceStorage";
import type { ThemeMode } from "@/types";

type TTSSettingsPane = "config" | "voices" | "create";

type PaneMeta = {
  id: TTSSettingsPane;
  label: string;
  icon: string;
  description: string;
};

const PANES: PaneMeta[] = [
  { id: "config", label: "服务配置", icon: "sliders", description: "配置 TTS 服务地址与鉴权信息" },
  { id: "voices", label: "朗读者列表", icon: "audio", description: "按类型拉取并展示可用朗读者" },
  { id: "create", label: "音频创建", icon: "terminal", description: "输入文本与朗读者，调用接口生成音频并试听" },
];

type VoiceFilterTab = TTSVoiceFilter | "favorites";

const VOICE_FILTERS: Array<{ id: VoiceFilterTab; label: string; icon?: string }> = [
  { id: "favorites", label: "收藏", icon: "heart" },
  { id: "recommend", label: "推荐" },
  { id: "women", label: "女声" },
  { id: "men", label: "男声" },
  { id: "role", label: "角色" },
  { id: "accent", label: "方言" },
];

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "未设置";
  if (trimmed.length <= 8) return "已设置";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function parseVoiceTags(value?: string): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(tag => typeof tag === "string") : [];
  } catch {
    return value
      .split(/[、,]/)
      .map(tag => tag.trim())
      .filter(Boolean);
  }
}

function buildCreateCurlExample(apiUrl: string, speaker: string, text: string): string {
  const base = (apiUrl || "http://localhost:8800").replace(/\/+$/, "");
  return `curl -X 'POST' \\\n  '${base}/api/voice/create' \\\n  -H 'accept: application/json' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\n  "cache": false,\n  "speaker": "${speaker}",\n  "text_content": "${text}"\n}'`;
}

export function TTSSettingsPanel({ theme }: { theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-100";
  const panelBg = isDark ? "bg-neutral-950/30" : "bg-neutral-100/80";
  const cardBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const inputText = isDark
    ? "text-neutral-100 placeholder:text-neutral-500"
    : "text-neutral-900 placeholder:text-neutral-400";
  const navActive = "bg-[#5856D6]/10 text-[#5856D6] font-medium";
  const navIdle = isDark
    ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
    : "text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100";

  const [pane, setPane] = useState<TTSSettingsPane>("config");
  const [config, setConfig] = useState<TTSConfig>({ api_url: "", api_key: "" });
  const [savedConfig, setSavedConfig] = useState<TTSConfig>({ api_url: "", api_key: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingVoices, setRefreshingVoices] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<VoiceFilterTab>("recommend");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavoriteVoiceIds());
  const [favoriteVoices, setFavoriteVoices] = useState<TTSVoiceItem[]>(() => loadFavoriteVoices());
  const [voices, setVoices] = useState<TTSVoiceItem[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [createSpeaker, setCreateSpeaker] = useState("");
  const [createText, setCreateText] = useState("");
  const [createCache, setCreateCache] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<TTSVoiceCreateResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPlaying, setCreatePlaying] = useState(false);

  const loadVoices = useCallback(async (cfg: TTSConfig, filter: TTSVoiceFilter) => {
    if (!cfg.api_url.trim()) {
      setVoices([]);
      return;
    }
    setRefreshingVoices(true);
    setVoiceError(null);
    try {
      const items = await fetchTTSVoiceList(cfg, filter);
      setVoices(items);
    } catch (err) {
      setVoices([]);
      setVoiceError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingVoices(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const next = await fetchTTSConfig();
        if (cancelled) return;
        setConfig(next);
        setSavedConfig(next);
        if (next.api_url.trim()) {
          setConnected(true);
          void loadVoices(next, "recommend");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [loadVoices]);

  useEffect(() => {
    if (!savedConfig.api_url.trim() || selectedFilter === "favorites") return;
    void loadVoices(savedConfig, selectedFilter);
  }, [loadVoices, savedConfig, selectedFilter]);

  const paneMeta = PANES.find(item => item.id === pane) ?? PANES[0];
  const hasSavedConfig = savedConfig.api_url.trim().length > 0;
  const configDirty = config.api_url !== savedConfig.api_url || config.api_key !== savedConfig.api_key;
  const canSave = config.api_url.trim().length > 0;
  const suggestedVoices = favoriteVoices.length > 0 ? favoriteVoices : voices.slice(0, 8);

  const handleCreateVoice = async () => {
    if (!hasSavedConfig || creating || !createSpeaker.trim() || !createText.trim()) return;
    setCreating(true);
    setCreateError(null);
    setCreateResult(null);
    try {
      const result = await createTTSVoice(savedConfig, {
        cache: createCache,
        speaker: createSpeaker.trim(),
        text_content: createText.trim(),
      });
      setCreateResult(result);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handlePlayCreateResult = () => {
    if (!createResult || !savedConfig.api_url.trim()) return;
    const previewUrl = buildVoicePreviewUrl(savedConfig.api_url, createResult.file_path);
    if (createPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCreatePlaying(false);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    audio.onended = () => setCreatePlaying(false);
    audio.onerror = () => {
      setCreatePlaying(false);
      setCreateError("音频播放失败");
    };
    setCreatePlaying(true);
    void audio.play().catch(() => setCreatePlaying(false));
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);

    try {
      const next = {
        api_url: config.api_url.trim(),
        api_key: config.api_key.trim(),
      };
      await saveTTSConfig(next);
      await fetchTTSVoiceList(next, "recommend");
      setSavedConfig(next);
      setConnected(true);
      setPane("voices");
      setSelectedFilter("recommend");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePlayVoice = async (voice: TTSVoiceItem) => {
    if (!voice.voice?.trim()) return;
    if (playingVoiceId === voice.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlayingVoiceId(null);
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(voice.voice);
    audioRef.current = audio;
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => {
      setPlayingVoiceId(null);
      setVoiceError(`试听失败：${voice.title || voice.label}`);
    };
    setPlayingVoiceId(voice.id);
    try {
      await audio.play();
    } catch (err) {
      setPlayingVoiceId(null);
      setVoiceError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleFavorite = (voice: TTSVoiceItem) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (next.has(voice.id)) {
        next.delete(voice.id);
        const updated = favoriteVoices.filter(v => v.id !== voice.id);
        setFavoriteVoices(updated);
        persistFavoriteVoices(updated);
      } else {
        next.add(voice.id);
        const updated = dedupeVoicesById([...favoriteVoices, voice]);
        setFavoriteVoices(updated);
        persistFavoriteVoices(updated);
      }
      persistFavoriteVoiceIds(next);
      return next;
    });
  };

  const displayedVoices = selectedFilter === "favorites" ? favoriteVoices : voices;

  const renderConfigPane = () => (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${subtleBorder} ${cardBg}`}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <label className="block">
            <span className="text-[11px] text-neutral-500">api_url</span>
            <input
              className={`mt-1 w-full px-3 py-2.5 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
              value={config.api_url}
              onChange={e => setConfig(prev => ({ ...prev, api_url: e.target.value }))}
              placeholder="例如: http://localhost:8800"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-neutral-500">api_key</span>
            <input
              className={`mt-1 w-full px-3 py-2.5 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
              value={config.api_key}
              onChange={e => setConfig(prev => ({ ...prev, api_key: e.target.value }))}
              placeholder="输入 API Key"
              type="password"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            保存时会立即请求推荐朗读者接口，校验配置是否可用。
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || saving || !configDirty}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${
              !canSave || saving || !configDirty
                ? "bg-neutral-300 dark:bg-neutral-800 cursor-not-allowed"
                : "bg-[#5856D6] hover:bg-[#4a48c4]"
            }`}
          >
            {saving ? "保存中…" : "保存并验证"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`rounded-2xl border p-4 ${subtleBorder} ${cardBg}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">当前状态</p>
          <p className="text-lg font-bold mt-2">{hasSavedConfig ? "已配置" : "未配置"}</p>
          <p className="text-xs mt-1 text-neutral-500">保存成功后可直接获取朗读者列表。</p>
        </div>
        <div className={`rounded-2xl border p-4 ${subtleBorder} ${cardBg}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">服务地址</p>
          <p className="text-sm font-mono mt-2 break-all">{savedConfig.api_url || "—"}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${subtleBorder} ${cardBg}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">鉴权信息</p>
          <p className="text-sm mt-2">{maskApiKey(savedConfig.api_key)}</p>
        </div>
      </div>
    </div>
  );


  const renderVoicesPane = () => (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-4 ${subtleBorder} ${cardBg}`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {VOICE_FILTERS.map(filter => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSelectedFilter(filter.id)}
                disabled={filter.id !== "favorites" && !hasSavedConfig}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1 ${
                  selectedFilter === filter.id ? navActive : navIdle
                }`}
              >
                {filter.icon && <Icon name={filter.icon} className="w-3 h-3" />}
                {filter.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { if (selectedFilter !== "favorites") void loadVoices(savedConfig, selectedFilter); }}
            disabled={!hasSavedConfig || refreshingVoices || selectedFilter === "favorites"}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${subtleBorder} ${
              isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
            } disabled:opacity-50`}
          >
            <Icon name="refresh" className={`w-3.5 h-3.5 ${refreshingVoices ? "animate-spin" : ""}`} />
            刷新列表
          </button>
        </div>
      </div>

      {!hasSavedConfig ? (
        <div className={`rounded-2xl border p-6 text-sm text-neutral-500 ${subtleBorder} ${cardBg}`}>
          请先在「服务配置」中保存可用的 TTS 服务地址，然后再获取朗读者列表。
        </div>
      ) : selectedFilter !== "favorites" && refreshingVoices && voices.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-16">加载朗读者列表…</p>
      ) : displayedVoices.length === 0 ? (
        <div className={`rounded-2xl border p-6 text-sm text-neutral-500 ${subtleBorder} ${cardBg}`}>
          {selectedFilter === "favorites" ? "暂无收藏的朗读者。" : "当前分类暂无朗读者数据。"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayedVoices.map(voice => {
            const tags = parseVoiceTags(voice.tag);
            const isFav = favoriteIds.has(voice.id);
            return (
              <div
                key={voice.id}
                className={`rounded-2xl border p-4 ${subtleBorder} ${cardBg} flex items-center gap-4`}
              >
                <img
                  src={voice.icon || ""}
                  alt={voice.title || voice.label}
                  className="w-14 h-14 rounded-full object-cover shrink-0 bg-neutral-200 dark:bg-neutral-800"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{voice.title || voice.label}</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        {voice.language || "未知语言"}
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(voice)}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                          isFav
                            ? "text-rose-500 hover:text-rose-400"
                            : isDark
                              ? "text-neutral-600 hover:text-neutral-400"
                              : "text-neutral-300 hover:text-neutral-500"
                        }`}
                        aria-label={isFav ? "取消收藏" : "收藏"}
                      >
                        <Icon name={isFav ? "heart" : "heart-outline"} className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePlayVoice(voice)}
                        disabled={!voice.voice}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border ${subtleBorder} ${
                          isDark ? "hover:bg-neutral-800/60" : "hover:bg-neutral-100"
                        } disabled:opacity-40`}
                        aria-label={playingVoiceId === voice.id ? "停止试听" : "试听"}
                      >
                        <Icon name={playingVoiceId === voice.id ? "pause" : "play"} className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] ${
                          isDark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderCreatePane = () => (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${subtleBorder} ${cardBg}`}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-[11px] text-neutral-500">朗读者 (speaker)</span>
            <input
              className={`mt-1 w-full px-3 py-2.5 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
              value={createSpeaker}
              onChange={e => setCreateSpeaker(e.target.value)}
              placeholder="例如: zh_female_wenroutaozi_uranus_bigtts"
            />
            {suggestedVoices.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestedVoices.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setCreateSpeaker(v.value)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] transition-colors ${
                      createSpeaker === v.value
                        ? "bg-[#5856D6]/15 text-[#5856D6]"
                        : isDark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {v.icon ? (
                      <img
                        src={v.icon}
                        alt={v.title || v.label}
                        className="w-4 h-4 rounded-full object-cover shrink-0 bg-neutral-200 dark:bg-neutral-800"
                      />
                    ) : (
                      <span className="w-4 h-4 rounded-full shrink-0 bg-neutral-200 dark:bg-neutral-700" />
                    )}
                    {v.title || v.label}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="block">
            <span className="text-[11px] text-neutral-500">文本内容 (text_content)</span>
            <textarea
              className={`mt-1 w-full min-h-[100px] px-3 py-2.5 rounded-xl text-xs border outline-none resize-y ${inputBg} ${inputBorder} ${inputText}`}
              value={createText}
              onChange={e => setCreateText(e.target.value)}
              placeholder="输入要朗读的文本…"
            />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createCache}
              onChange={e => setCreateCache(e.target.checked)}
              className="w-4 h-4 rounded accent-[#5856D6]"
            />
            <span className="text-xs text-neutral-500">使用缓存 (cache)</span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            调用 POST /api/voice/create 生成音频文件。
          </div>
          <button
            type="button"
            onClick={() => void handleCreateVoice()}
            disabled={!hasSavedConfig || creating || !createSpeaker.trim() || !createText.trim()}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${
              !hasSavedConfig || creating || !createSpeaker.trim() || !createText.trim()
                ? "bg-neutral-300 dark:bg-neutral-800 cursor-not-allowed"
                : "bg-[#5856D6] hover:bg-[#4a48c4]"
            }`}
          >
            {creating ? "生成中…" : "生成音频"}
          </button>
        </div>
      </div>

      {createError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs text-rose-500">
          {createError}
        </div>
      ) : null}

      {createResult ? (
        <div className={`rounded-2xl border p-5 ${subtleBorder} ${cardBg} space-y-4`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">生成成功</p>
              <p className="text-xs text-neutral-500 mt-1">{createResult.file_name}</p>
            </div>
            <button
              type="button"
              onClick={handlePlayCreateResult}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white ${
                createPlaying ? "bg-rose-500 hover:bg-rose-600" : "bg-[#5856D6] hover:bg-[#4a48c4]"
              }`}
            >
              <Icon name={createPlaying ? "pause" : "play"} className="w-3.5 h-3.5" />
              {createPlaying ? "停止" : "试听"}
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-neutral-400">平台</p>
              <p className="text-xs mt-0.5">{createResult.platform}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400">格式</p>
              <p className="text-xs mt-0.5">{createResult.audio_format}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400">文件大小</p>
              <p className="text-xs mt-0.5">{(createResult.file_size / 1024).toFixed(1)} KB</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400">创建时间</p>
              <p className="text-xs mt-0.5">{createResult.created_at}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-neutral-400 mb-1">预览地址</p>
            <p className={`text-xs font-mono break-all rounded-xl p-3 ${isDark ? "bg-neutral-950/50 text-neutral-200" : "bg-neutral-50 text-neutral-700"}`}>
              {buildVoicePreviewUrl(savedConfig.api_url, createResult.file_path)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-400 mb-1">curl 示例</p>
            <pre className={`text-xs whitespace-pre-wrap break-all rounded-xl p-3 overflow-x-auto ${isDark ? "bg-neutral-950/50 text-neutral-200" : "bg-neutral-50 text-neutral-700"}`}>
              {buildCreateCurlExample(savedConfig.api_url, createResult.speaker, createResult.text_content.slice(0, 50))}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex">
      <aside className={`w-52 shrink-0 border-r ${subtleBorder} px-4 py-5 overflow-y-auto flex flex-col`}>
        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-3">
          TTS设置
        </p>
        <nav className="space-y-0.5 flex-1 min-h-0">
          {PANES.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPane(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                pane === item.id ? navActive : navIdle
              }`}
            >
              <Icon name={item.icon} className="w-4 h-4 shrink-0" />
              <span className="truncate text-left">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className={`mt-5 rounded-2xl border p-4 ${cardBg} ${subtleBorder}`}>
          <p className="text-[12px] font-semibold">服务状态</p>
          <p className={`text-[12px] mt-2 ${hasSavedConfig ? "text-emerald-500" : "text-neutral-500"}`}>
            {hasSavedConfig ? "已保存可用配置" : "尚未完成配置"}
          </p>
          <p className="text-[11px] mt-1 text-neutral-500">
            {voices.length > 0 ? `当前已加载 ${voices.length} 个朗读者` : "保存成功后即可拉取列表"}
          </p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className={`shrink-0 px-6 py-4 border-b ${subtleBorder} flex items-center justify-between gap-4`}>
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              {paneMeta.label}
              {connected && (
                <span className="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-500" title="已连接 TTS 服务">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                </span>
              )}
            </h3>
            <p className={`text-sm mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              {paneMeta.description}
            </p>
          </div>
          {pane === "voices" ? (
            <button
              type="button"
              onClick={() => { if (selectedFilter !== "favorites") void loadVoices(savedConfig, selectedFilter); }}
              disabled={!hasSavedConfig || refreshingVoices || selectedFilter === "favorites"}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${subtleBorder} ${
                isDark ? "text-neutral-300 hover:bg-neutral-900/50" : "text-neutral-600 hover:bg-neutral-50"
              } disabled:opacity-50`}
            >
              <Icon name="refresh" className={`w-3.5 h-3.5 ${refreshingVoices ? "animate-spin" : ""}`} />
              刷新
            </button>
          ) : null}
        </div>

        <div className={`flex-1 overflow-y-auto px-6 py-5 ${panelBg}`}>
          {loading ? (
            <p className="text-sm text-neutral-400 text-center py-16">加载 TTS 配置…</p>
          ) : (
            <>
              
              {error ? (
                <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs text-rose-500">
                  {error}
                </div>
              ) : null}
              {voiceError ? (
                <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-600 dark:text-amber-300">
                  {voiceError}
                </div>
              ) : null}

              {pane === "config" && renderConfigPane()}
              {pane === "voices" && renderVoicesPane()}
              {pane === "create" && renderCreatePane()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
