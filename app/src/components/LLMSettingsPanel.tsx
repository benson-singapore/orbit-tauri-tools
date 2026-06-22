import { useEffect, useMemo, useRef, useState } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import { Icon } from "@/components/Icon";
import type { ThemeMode } from "@/types";
import {
  fetchLLMProvidersConfig,
  saveLLMProvidersConfig,
  streamLLMChat,
  type LLMChatMessage,
  type LLMProvider,
  type LLMProviderModel,
} from "@/lib/llmApi";

type LLMSettingsPane = "providers" | "chat" | "prompts";

type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type PromptProfile = {
  id: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
};

function slugifyProviderId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureModelLabel(model: LLMProviderModel): string {
  const id = model.id.trim();
  const label = (model.label ?? "").trim();
  return label || id;
}

function makePromptProfileId(): string {
  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function LLMSettingsPanel({ theme }: { theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-100";
  const panelBg = isDark ? "bg-neutral-950/30" : "bg-neutral-100/80";
  const cardBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBg = isDark ? "bg-neutral-900/40" : "bg-white";
  const inputBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const inputText = isDark ? "text-neutral-100 placeholder:text-neutral-500" : "text-neutral-900 placeholder:text-neutral-400";

  const [pane, setPane] = useState<LLMSettingsPane>("providers");

  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof fetchLLMProvidersConfig>> | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [cfgError, setCfgError] = useState<string | null>(null);

  const providers = cfg?.providers ?? [];

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const selectedProvider = useMemo(() => {
    return providers.find(p => p.id === selectedProviderId) ?? null;
  }, [providers, selectedProviderId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCfg(true);
    setCfgError(null);
    void (async () => {
      try {
        const next = await fetchLLMProvidersConfig();
        if (cancelled) return;
        setCfg(next);
        if (next.providers.length > 0 && !selectedProviderId) {
          setSelectedProviderId(next.providers[0].id);
        }
      } catch (e) {
        if (cancelled) return;
        setCfgError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingCfg(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  // Provider editor state
  const [editName, setEditName] = useState("");
  const [editApiUrl, setEditApiUrl] = useState("");
  const [editApiKeyInput, setEditApiKeyInput] = useState(""); // empty means "keep existing"
  const [editModels, setEditModels] = useState<Array<{ id: string; label: string }>>([]);

  const [providerEditorDirty, setProviderEditorDirty] = useState(false);
  const [providerEditorStatus, setProviderEditorStatus] = useState<string | null>(null);
  const [promptProfiles, setPromptProfiles] = useState<PromptProfile[]>([]);
  const [activePromptProfileId, setActivePromptProfileId] = useState("");
  const [promptDirty, setPromptDirty] = useState(false);
  const [promptStatus, setPromptStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProvider) {
      setEditName("");
      setEditApiUrl("");
      setEditApiKeyInput("");
      setEditModels([]);
      setProviderEditorDirty(false);
      return;
    }

    setEditName(selectedProvider.name);
    setEditApiUrl(selectedProvider.api_url);
    setEditApiKeyInput(""); // keep blank; user may replace via input
    setEditModels(
      (selectedProvider.models ?? []).map(m => ({
        id: m.id,
        label: ensureModelLabel(m),
      })),
    );
    setProviderEditorDirty(false);
    setProviderEditorStatus(null);
  }, [selectedProviderId, selectedProvider]);

  useEffect(() => {
    const profilesFromCfg = (cfg?.promptProfiles ?? []).map(item => ({
      id: item.id,
      name: item.name,
      systemPrompt: item.systemPrompt ?? "",
      userPromptTemplate: item.userPromptTemplate ?? "",
    }));
    const migratedFromLegacy =
      profilesFromCfg.length > 0
        ? profilesFromCfg
        : (cfg?.promptDefaults?.systemPrompt ?? "").trim() || (cfg?.promptDefaults?.userPromptTemplate ?? "").trim()
          ? [
              {
                id: "default",
                name: "默认 Prompt",
                systemPrompt: cfg?.promptDefaults?.systemPrompt ?? "",
                userPromptTemplate: cfg?.promptDefaults?.userPromptTemplate ?? "",
              },
            ]
          : [];
    setPromptProfiles(migratedFromLegacy);
    const nextActiveId =
      (cfg?.activePromptProfileId &&
      migratedFromLegacy.some(p => p.id === cfg.activePromptProfileId)
        ? cfg.activePromptProfileId
        : migratedFromLegacy[0]?.id) ?? "";
    setActivePromptProfileId(nextActiveId);
    setPromptDirty(false);
    setPromptStatus(null);
  }, [cfg]);

  const activePromptProfile = useMemo(() => {
    return promptProfiles.find(p => p.id === activePromptProfileId) ?? null;
  }, [promptProfiles, activePromptProfileId]);

  const canSaveProvider = useMemo(() => {
    if (!selectedProvider) return false;
    const nameOk = editName.trim().length > 0;
    const apiUrlOk = editApiUrl.trim().length > 0;
    const modelsOk = editModels.some(m => m.id.trim().length > 0);
    return nameOk && apiUrlOk && modelsOk;
  }, [selectedProvider, editApiUrl, editModels, editName]);

  const handleSaveProvider = async () => {
    if (!cfg || !selectedProvider) return;
    if (!canSaveProvider) {
      setProviderEditorStatus("请检查提供商名称/Api URL/模型是否填写完整。");
      return;
    }

    const nextProviders: LLMProvider[] = cfg.providers.map(p => {
      if (p.id !== selectedProvider.id) return p;

      const nextModels: LLMProviderModel[] = editModels
        .map(m => ({
          id: m.id.trim(),
          label: m.label.trim() || m.id.trim(),
        }))
        .filter(m => m.id !== "");

      const nextApiKey =
        editApiKeyInput.trim() === "" ? p.api_key : editApiKeyInput.trim();

      return {
        ...p,
        name: editName.trim(),
        api_url: editApiUrl.trim(),
        api_key: nextApiKey,
        models: nextModels,
      };
    });

    const nextCfg = { ...cfg, providers: nextProviders };
    await saveLLMProvidersConfig(nextCfg);
    setCfg(nextCfg);
    setProviderEditorStatus("已保存。");
    setProviderEditorDirty(false);
  };

  const handleRemoveProvider = async () => {
    if (!cfg || !selectedProvider) return;
    const ok = window.confirm(`确定删除提供商「${selectedProvider.name || selectedProvider.id}」吗？`);
    if (!ok) return;

    const nextProviders = cfg.providers.filter(p => p.id !== selectedProvider.id);
    const nextCfg = { ...cfg, providers: nextProviders };
    await saveLLMProvidersConfig(nextCfg);
    setCfg(nextCfg);
    setSelectedProviderId(nextProviders[0]?.id ?? "");
    setProviderEditorStatus("已删除。");
    setProviderEditorDirty(false);
  };

  const handleAddProvider = async (payload: {
    id: string;
    name: string;
    apiUrl: string;
    apiKey: string;
    firstModel: { id: string; label?: string };
  }) => {
    if (!cfg) return;
    const newId = payload.id.trim();
    if (!newId) return;
    if (cfg.providers.some(p => p.id === newId)) {
      setProviderEditorStatus("该 providerId 已存在，请换一个。");
      return;
    }

    const nextProviders: LLMProvider[] = [
      ...cfg.providers,
      {
        id: newId,
        name: payload.name.trim() || newId,
        api_url: payload.apiUrl.trim(),
        api_key: payload.apiKey.trim(),
        models: [
          {
            id: payload.firstModel.id.trim(),
            label: payload.firstModel.label?.trim() || payload.firstModel.id.trim(),
          },
        ],
      },
    ];
    const nextCfg = { ...cfg, providers: nextProviders };
    await saveLLMProvidersConfig(nextCfg);
    setCfg(nextCfg);
    setSelectedProviderId(newId);
    setProviderEditorStatus("已添加。");
  };

  const [addingProviderInline, setAddingProviderInline] = useState(false);
  const [providerIdInput, setProviderIdInput] = useState("");
  const [newProviderNameInput, setNewProviderNameInput] = useState("");
  const [newProviderApiUrlInput, setNewProviderApiUrlInput] = useState("");
  const [newProviderApiKeyInput, setNewProviderApiKeyInput] = useState("");
  const [newProviderModelIdInput, setNewProviderModelIdInput] = useState("");
  const [newProviderModelLabelInput, setNewProviderModelLabelInput] = useState("");

  const resetInlineProviderForm = () => {
    setProviderIdInput("");
    setNewProviderNameInput("");
    setNewProviderApiUrlInput("");
    setNewProviderApiKeyInput("");
    setNewProviderModelIdInput("");
    setNewProviderModelLabelInput("");
  };

  const handleInlineAddProvider = async () => {
    const id = slugifyProviderId(providerIdInput);
    if (!id) {
      setProviderEditorStatus("请填写有效的 providerId（仅支持字母、数字、-、_）。");
      return;
    }
    if (!newProviderApiUrlInput.trim()) {
      setProviderEditorStatus("请填写 api_url。");
      return;
    }
    if (!newProviderModelIdInput.trim()) {
      setProviderEditorStatus("请至少填写一个模型 ID。");
      return;
    }

    await handleAddProvider({
      id,
      name: newProviderNameInput || id,
      apiUrl: newProviderApiUrlInput,
      apiKey: newProviderApiKeyInput,
      firstModel: {
        id: newProviderModelIdInput,
        label: newProviderModelLabelInput,
      },
    });
    resetInlineProviderForm();
    setAddingProviderInline(false);
  };

  const handleSavePromptDefaults = async () => {
    if (!cfg) return;
    const nextCfg = {
      ...cfg,
      // Keep legacy field for compatibility with older runtime readers.
      promptDefaults: {
        systemPrompt: activePromptProfile?.systemPrompt.trim() ?? "",
        userPromptTemplate: activePromptProfile?.userPromptTemplate.trim() ?? "",
      },
      promptProfiles: promptProfiles.map(p => ({
        id: p.id,
        name: p.name.trim() || "未命名 Prompt",
        systemPrompt: p.systemPrompt.trim(),
        userPromptTemplate: p.userPromptTemplate.trim(),
      })),
      activePromptProfileId: activePromptProfile?.id,
    };
    await saveLLMProvidersConfig(nextCfg);
    setCfg(nextCfg);
    setPromptDirty(false);
    setPromptStatus("Prompt 配置已保存。");
  };

  // Chat UI state
  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const selectedProviderModels = selectedProvider?.models ?? [];
  const [chatModelId, setChatModelId] = useState<string>("");
  const [chatPromptProfileId, setChatPromptProfileId] = useState<string>("");

  useEffect(() => {
    if (selectedProviderModels.length === 0) {
      setChatModelId("");
      return;
    }
    if (selectedProviderModels.some(m => m.id === chatModelId)) return;
    setChatModelId(selectedProviderModels[0].id);
  }, [selectedProviderId, selectedProviderModels, chatModelId]);

  useEffect(() => {
    const ids = (cfg?.promptProfiles ?? []).map(p => p.id);
    if (ids.length === 0) {
      setChatPromptProfileId("");
      return;
    }
    const preferred = cfg?.activePromptProfileId ?? "";
    if (preferred && ids.includes(preferred)) {
      setChatPromptProfileId(preferred);
      return;
    }
    if (chatPromptProfileId && ids.includes(chatPromptProfileId)) return;
    setChatPromptProfileId(ids[0]);
  }, [cfg?.activePromptProfileId, cfg?.promptProfiles, chatPromptProfileId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatSending]);

  const requestMessages = useMemo(() => {
    return chatMessages.map(m => ({
      role: m.role,
      content: m.content,
    })) as LLMChatMessage[];
  }, [chatMessages]);

  const handleSendChat = async () => {
    if (chatSending) return;
    if (!cfg) return;
    if (!selectedProviderId) return;
    if (!chatModelId) return;
    const content = chatInput.trim();
    if (!content) return;
    const activeProfile =
      (cfg.promptProfiles ?? []).find(p => p.id === (chatPromptProfileId || cfg.activePromptProfileId)) ??
      null;
    const trimmedUserTemplate = (
      activeProfile?.userPromptTemplate ?? cfg.promptDefaults?.userPromptTemplate ?? ""
    ).trim();
    const trimmedSystemPrompt = (
      activeProfile?.systemPrompt ?? cfg.promptDefaults?.systemPrompt ?? ""
    ).trim();
    const userContent = trimmedUserTemplate
      ? trimmedUserTemplate.replace(/\{\{\s*input\s*\}\}/gi, content)
      : content;

    const userMessage: ChatMessageRow = {
      id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: "user",
      content: userContent,
    };
    const assistantMessageId = `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const assistantMessage: ChatMessageRow = { id: assistantMessageId, role: "assistant", content: "" };

    const nextRequestMessages: LLMChatMessage[] = [
      ...(trimmedSystemPrompt ? [{ role: "system", content: trimmedSystemPrompt } as const] : []),
      ...requestMessages,
      { role: "user", content: userMessage.content },
    ];

    setChatInput("");
    setChatStatus(null);
    setChatMessages(prev => [...prev, userMessage, assistantMessage]);

    setChatSending(true);
    abortRef.current = new AbortController();

    try {
      await streamLLMChat({
        providerId: selectedProviderId,
        modelId: chatModelId,
        messages: nextRequestMessages,
        signal: abortRef.current.signal,
        onDelta: delta => {
          setChatMessages(prev =>
            prev.map(m => (m.id === assistantMessageId ? { ...m, content: m.content + delta } : m)),
          );
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setChatStatus(msg);
      setChatMessages(prev =>
        prev.map(m => (m.id === assistantMessageId ? { ...m, content: m.content + `\n[错误] ${msg}` } : m)),
      );
    } finally {
      setChatSending(false);
      abortRef.current = null;
    }
  };

  const handleStopChat = () => {
    abortRef.current?.abort();
  };

  const handleClearChat = () => {
    setChatMessages([]);
    setChatInput("");
    setChatStatus(null);
    abortRef.current?.abort();
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <aside className={`w-52 shrink-0 h-full border-r ${subtleBorder} px-4 py-5 overflow-y-auto flex flex-col bg-white`}>
        <div className="flex items-center justify-between px-3 mb-3">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">LLM设置</p>
        </div>
        <nav className="space-y-0.5 flex-1 min-h-0">
          <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setPane("providers")}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              pane === "providers" ? "bg-[#5856D6]/10 text-[#5856D6]" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
            }`}
          >
            <Icon name="brain" className="w-4 h-4" />
            API 提供商
          </button>
          <button
            type="button"
            onClick={() => setPane("prompts")}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              pane === "prompts" ? "bg-[#5856D6]/10 text-[#5856D6]" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
            }`}
          >
            <Icon name="text" className="w-4 h-4" />
            Prompt 管理
          </button>
          <button
            type="button"
            onClick={() => setPane("chat")}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              pane === "chat" ? "bg-[#5856D6]/10 text-[#5856D6]" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
            }`}
          >
            <Icon name="terminal" className="w-4 h-4" />
            LLM测试
          </button>
          </div>
        </nav>

        <div className={`mt-5 rounded-2xl border p-4 ${cardBg} ${subtleBorder}`}>
          <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">当前状态</p>
          {loadingCfg ? (
            <p className="text-[12px] text-neutral-500 mt-2">加载配置中…</p>
          ) : cfgError ? (
            <p className="text-[12px] text-rose-500 mt-2">{cfgError}</p>
          ) : providers.length === 0 ? (
            <p className="text-[12px] text-neutral-500 mt-2">暂无提供商配置</p>
          ) : (
            <p className="text-[12px] text-neutral-500 mt-2">提供商数：{providers.length}</p>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className={`shrink-0 px-6 py-4 border-b ${subtleBorder} flex items-start justify-between gap-4`}>
          <div>
            <h3 className="text-base font-bold">
              {pane === "providers" ? "API 提供商" : pane === "chat" ? "测试" : "Prompt 管理"}
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              {pane === "providers"
                ? "配置 API 提供商与模型参数"
                : pane === "chat"
                  ? "使用当前配置进行对话测试"
                  : "配置并管理多组 Prompt 模板"}
            </p>
          </div>
        </div>

        <div className={`flex-1 min-h-0 overflow-hidden ${panelBg}`}>
          <div className="flex-1 min-h-0 flex flex-row overflow-hidden h-full">
            <main className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
              {pane === "providers" && (
                <div className={`rounded-2xl border p-5 ${subtleBorder} ${cardBg}`}>
                  {loadingCfg ? (
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">加载中…</p>
                  ) : providers.length === 0 ? (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wider">
                          提供商列表
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingProviderInline(v => !v);
                            setProviderEditorStatus(null);
                          }}
                          className="text-[11px] text-[#5856D6] hover:underline flex items-center gap-1"
                        >
                          <Icon name="sparkles" className="w-3.5 h-3.5" />
                          添加
                        </button>
                      </div>
                      <div className="text-sm text-neutral-500 space-y-2">
                        <p>暂无提供商，点击上方「添加」创建。</p>
                        <p className="text-xs text-neutral-400">
                          添加后可在「测试」页签选择模型进行对话；Prompt 可在「Prompt 管理」里配置。
                        </p>
                      </div>
                      {addingProviderInline && (
                        <div className="mt-4 rounded-2xl border border-neutral-200 p-4 bg-neutral-50/60 space-y-3">
                          <label className="block">
                            <span className="text-[11px] text-neutral-500">providerId</span>
                            <input
                              className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={providerIdInput}
                              onChange={e => setProviderIdInput(e.target.value)}
                              placeholder="例如: openai"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] text-neutral-500">名称</span>
                            <input
                              className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={newProviderNameInput}
                              onChange={e => setNewProviderNameInput(e.target.value)}
                              placeholder="例如: OpenAI"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] text-neutral-500">api_url</span>
                            <input
                              className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={newProviderApiUrlInput}
                              onChange={e => setNewProviderApiUrlInput(e.target.value)}
                              placeholder="例如: https://api.openai.com/v1"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] text-neutral-500">api_key（可选）</span>
                            <input
                              className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={newProviderApiKeyInput}
                              onChange={e => setNewProviderApiKeyInput(e.target.value)}
                              placeholder="输入 API Key"
                              type="password"
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="text-[11px] text-neutral-500">modelId</span>
                              <input
                                className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                value={newProviderModelIdInput}
                                onChange={e => setNewProviderModelIdInput(e.target.value)}
                                placeholder="例如: gpt-4o-mini"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] text-neutral-500">模型名（可选）</span>
                              <input
                                className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                value={newProviderModelLabelInput}
                                onChange={e => setNewProviderModelLabelInput(e.target.value)}
                                placeholder="留空则=modelId"
                              />
                            </label>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAddingProviderInline(false);
                                resetInlineProviderForm();
                                setProviderEditorStatus(null);
                              }}
                              className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleInlineAddProvider()}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#5856D6] hover:bg-[#4a48c4]"
                            >
                              确认添加
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-6">
                      <div className="col-span-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wider">提供商列表</p>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingProviderInline(v => !v);
                              setProviderEditorStatus(null);
                            }}
                            className="text-[11px] text-[#5856D6] hover:underline flex items-center gap-1"
                          >
                            <Icon name="sparkles" className="w-3.5 h-3.5" />
                            添加
                          </button>
                        </div>

                        <div className="space-y-1">
                          {providers.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedProviderId(p.id)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                selectedProviderId === p.id
                                  ? "bg-[#5856D6]/10 text-[#5856D6]"
                                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                              }`}
                            >
                              <span className="truncate">{p.name || p.id}</span>
                              <span className="ml-2 text-[10px] text-neutral-400 shrink-0">
                                {p.models.length} 模型
                              </span>
                            </button>
                          ))}
                        </div>
                        {addingProviderInline && (
                          <div className="mt-3 rounded-2xl border border-neutral-200 p-3 bg-neutral-50/60 space-y-2">
                            <input
                              className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={providerIdInput}
                              onChange={e => setProviderIdInput(e.target.value)}
                              placeholder="providerId（例如 openai）"
                            />
                            <input
                              className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={newProviderNameInput}
                              onChange={e => setNewProviderNameInput(e.target.value)}
                              placeholder="名称（可选）"
                            />
                            <input
                              className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={newProviderApiUrlInput}
                              onChange={e => setNewProviderApiUrlInput(e.target.value)}
                              placeholder="api_url"
                            />
                            <input
                              className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                              value={newProviderApiKeyInput}
                              onChange={e => setNewProviderApiKeyInput(e.target.value)}
                              placeholder="api_key（可选）"
                              type="password"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                value={newProviderModelIdInput}
                                onChange={e => setNewProviderModelIdInput(e.target.value)}
                                placeholder="modelId"
                              />
                              <input
                                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                value={newProviderModelLabelInput}
                                onChange={e => setNewProviderModelLabelInput(e.target.value)}
                                placeholder="模型名（可选）"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingProviderInline(false);
                                  resetInlineProviderForm();
                                  setProviderEditorStatus(null);
                                }}
                                className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleInlineAddProvider()}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#5856D6] hover:bg-[#4a48c4]"
                              >
                                确认
                              </button>
                            </div>
                          </div>
                        )}

                      </div>

                      <div className="col-span-8">
                        {selectedProvider ? (
                          <div>
                            <div className="flex items-start justify-between gap-4 mb-4">
                              <div>
                                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                                  配置：{selectedProvider.name || selectedProvider.id}
                                </p>
                                <p className="text-xs text-neutral-500 mt-1">providerId: {selectedProvider.id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveProvider()}
                                  className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                >
                                  删除
                                </button>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <label className="block">
                                <span className="text-[11px] text-neutral-500">名称</span>
                                <input
                                  className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                  value={editName}
                                  onChange={e => {
                                    setEditName(e.target.value);
                                    setProviderEditorDirty(true);
                                  }}
                                  placeholder="例如: OpenAI"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] text-neutral-500">api_url</span>
                                <input
                                  className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                  value={editApiUrl}
                                  onChange={e => {
                                    setEditApiUrl(e.target.value);
                                    setProviderEditorDirty(true);
                                  }}
                                  placeholder="例如: https://api.openai.com/v1"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] text-neutral-500">api_key（留空不修改）</span>
                                <input
                                  className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                  value={editApiKeyInput}
                                  onChange={e => {
                                    setEditApiKeyInput(e.target.value);
                                    setProviderEditorDirty(true);
                                  }}
                                  placeholder={selectedProvider.api_key ? "已设置，留空保持不变" : "未设置"}
                                  type="password"
                                />
                              </label>

                              <div className="rounded-2xl border p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">模型列表</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditModels(prev => [...prev, { id: "", label: "" }]);
                                      setProviderEditorDirty(true);
                                    }}
                                    className="text-[11px] text-[#5856D6] hover:underline flex items-center gap-1"
                                  >
                                    <Icon name="sparkles" className="w-3.5 h-3.5" />
                                    添加模型
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {editModels.map((m, idx) => (
                                    <div key={`${m.id}-${idx}`} className="flex gap-2">
                                      <input
                                        className={`flex-1 px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                        value={m.id}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setEditModels(prev =>
                                            prev.map((x, i) => (i === idx ? { ...x, id: v } : x)),
                                          );
                                          setProviderEditorDirty(true);
                                        }}
                                        placeholder="modelId"
                                      />
                                      <input
                                        className={`flex-1 px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                        value={m.label}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setEditModels(prev =>
                                            prev.map((x, i) => (i === idx ? { ...x, label: v } : x)),
                                          );
                                          setProviderEditorDirty(true);
                                        }}
                                        placeholder="显示名（可选）"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditModels(prev => prev.filter((_, i) => i !== idx));
                                          setProviderEditorDirty(true);
                                        }}
                                        className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                        aria-label="删除模型"
                                      >
                                        <Icon name="close" className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-4 pt-1">
                                <div className="text-xs text-neutral-500">
                                  默认对话测试使用 `stream` 模式（SSE）。
                                </div>
                                <div className="flex items-center gap-2">
                                  {providerEditorStatus && (
                                    <span className="text-xs text-neutral-500">{providerEditorStatus}</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveProvider()}
                                    disabled={!providerEditorDirty || !canSaveProvider}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${
                                      !providerEditorDirty || !canSaveProvider
                                        ? "bg-neutral-300 dark:bg-neutral-800 cursor-not-allowed"
                                        : "bg-[#5856D6] hover:bg-[#4a48c4]"
                                    }`}
                                  >
                                    保存提供商
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-400">请选择一个提供商。</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {pane === "chat" && (
                <div className={`rounded-2xl border p-5 ${subtleBorder} ${cardBg} flex flex-col h-full`}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">对话测试（Stream）</p>
                      <p className="text-xs text-neutral-500 mt-1">选择提供商/模型后即可聊天</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClearChat}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                        disabled={chatSending}
                      >
                        清空对话
                      </button>
                      {chatSending ? (
                        <button
                          type="button"
                          onClick={handleStopChat}
                          className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600"
                        >
                          停止
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 w-[260px]">
                      <span className="text-[11px] text-neutral-500 shrink-0">提供商</span>
                      <select
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                        value={selectedProviderId}
                        onChange={e => setSelectedProviderId(e.target.value)}
                        disabled={providers.length === 0 || chatSending}
                      >
                        {providers.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name || p.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2 w-[260px]">
                      <span className="text-[11px] text-neutral-500 shrink-0">模型</span>
                      <select
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                        value={chatModelId}
                        onChange={e => setChatModelId(e.target.value)}
                        disabled={!selectedProvider || selectedProviderModels.length === 0 || chatSending}
                      >
                        {selectedProviderModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.label || m.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2 w-[320px]">
                      <span className="text-[11px] text-neutral-500 shrink-0">Prompt</span>
                      <select
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                        value={chatPromptProfileId}
                        onChange={e => {
                          const nextId = e.target.value;
                          setChatPromptProfileId(nextId);
                          if (!cfg) return;
                          const nextCfg = { ...cfg, activePromptProfileId: nextId || undefined };
                          setCfg(nextCfg);
                          void saveLLMProvidersConfig(nextCfg).catch(err => {
                            setChatStatus(err instanceof Error ? err.message : String(err));
                          });
                        }}
                        disabled={chatSending || (cfg?.promptProfiles?.length ?? 0) === 0}
                      >
                        {(cfg?.promptProfiles ?? []).length === 0 ? (
                          <option value="">暂无 Prompt</option>
                        ) : (
                          (cfg?.promptProfiles ?? []).map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name || p.id}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border p-4 bg-neutral-50/30 dark:bg-neutral-950/20">
                    {chatMessages.length === 0 ? (
                      <div className="text-sm text-neutral-400 text-center py-10">
                        请输入问题开始对话。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {chatMessages.map(m => (
                          <div key={m.id} className={`rounded-2xl px-4 py-3 border ${m.role === "user" ? "bg-white dark:bg-neutral-900/60 border-neutral-200 dark:border-neutral-800" : "bg-neutral-50 dark:bg-neutral-950/30 border-neutral-200 dark:border-neutral-800"}`}>
                            <div className="text-[11px] text-neutral-500 mb-1">
                              {m.role === "user" ? "用户" : "助手"}
                            </div>
                            <pre className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100 font-sans leading-relaxed">
                              {m.content || (m.role === "assistant" && chatSending ? "正在生成..." : "")}
                            </pre>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 mt-4 flex items-end gap-3">
                    <textarea
                      className={`flex-1 min-h-[44px] max-h-[140px] px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder={chatSending ? "生成中…" : "输入消息…"}
                      disabled={chatSending || providers.length === 0 || !selectedProviderId || !chatModelId}
                      onKeyDown={e => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          void handleSendChat();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendChat()}
                      disabled={
                        chatSending ||
                        providers.length === 0 ||
                        !selectedProviderId ||
                        !chatModelId ||
                        chatInput.trim().length === 0
                      }
                      className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${
                        chatSending || chatInput.trim().length === 0
                          ? "bg-neutral-300 dark:bg-neutral-800 cursor-not-allowed"
                          : "bg-[#5856D6] hover:bg-[#4a48c4]"
                      }`}
                    >
                      发送
                    </button>
                  </div>

                  {chatStatus && <p className="text-xs text-rose-500 mt-3">{chatStatus}</p>}
                </div>
              )}

              {pane === "prompts" && (
                <div className={`rounded-2xl border p-4 ${subtleBorder} ${cardBg}`}>
                  <div className="rounded-2xl bg-white/70 p-[5px]">
                    <div className="grid grid-cols-12 gap-5 min-h-[420px]">
                      <div className="col-span-4 border-r border-neutral-200/80 pr-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wider">
                            Prompt 列表
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const created: PromptProfile = {
                                id: makePromptProfileId(),
                                name: `Prompt ${promptProfiles.length + 1}`,
                                systemPrompt: "",
                                userPromptTemplate: "",
                              };
                              setPromptProfiles(prev => [...prev, created]);
                              setActivePromptProfileId(created.id);
                              setPromptDirty(true);
                              setPromptStatus(null);
                            }}
                            className="text-[11px] text-[#5856D6] hover:underline flex items-center gap-1 font-semibold"
                          >
                            <Icon name="sparkles" className="w-3.5 h-3.5" />
                            新增
                          </button>
                        </div>
                        <div className="space-y-1">
                          {promptProfiles.map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setActivePromptProfileId(item.id)}
                              className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                activePromptProfileId === item.id
                                  ? "bg-[#5856D6]/10 text-[#5856D6]"
                                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                              }`}
                            >
                              <span className="truncate">{item.name || "未命名 Prompt"}</span>
                            </button>
                          ))}
                          {promptProfiles.length === 0 && (
                            <p className="text-xs text-neutral-400 px-1 py-2">
                              暂无 Prompt，点击上方「新增」创建。
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="col-span-8 flex flex-col min-h-0">
                        {activePromptProfile ? (
                          <div className="space-y-4 flex-1 min-h-0">
                            <label className="block">
                              <span className="text-[11px] text-neutral-500">名称</span>
                              <input
                                className={`mt-1 w-full px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                value={activePromptProfile.name}
                                onChange={e => {
                                  const v = e.target.value;
                                  setPromptProfiles(prev =>
                                    prev.map(p => (p.id === activePromptProfile.id ? { ...p, name: v } : p)),
                                  );
                                  setPromptDirty(true);
                                  setPromptStatus(null);
                                }}
                                placeholder="例如：代码评审助手"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] text-neutral-500">System Prompt</span>
                              <textarea
                                className={`mt-1 w-full min-h-[140px] px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                value={activePromptProfile.systemPrompt}
                                onChange={e => {
                                  const v = e.target.value;
                                  setPromptProfiles(prev =>
                                    prev.map(p =>
                                      p.id === activePromptProfile.id ? { ...p, systemPrompt: v } : p,
                                    ),
                                  );
                                  setPromptDirty(true);
                                  setPromptStatus(null);
                                }}
                                placeholder="例如：你是一个严谨、简洁、偏工程化的中文助手。"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] text-neutral-500">用户 Prompt 模板（可选）</span>
                              <textarea
                                className={`mt-1 w-full min-h-[120px] px-3 py-2 rounded-xl text-xs border outline-none ${inputBg} ${inputBorder} ${inputText}`}
                                value={activePromptProfile.userPromptTemplate}
                                onChange={e => {
                                  const v = e.target.value;
                                  setPromptProfiles(prev =>
                                    prev.map(p =>
                                      p.id === activePromptProfile.id ? { ...p, userPromptTemplate: v } : p,
                                    ),
                                  );
                                  setPromptDirty(true);
                                  setPromptStatus(null);
                                }}
                                placeholder={"例如：请你按下面格式回答：\n问题：{{input}}\n答案："}
                              />
                              <p className="mt-1 text-[11px] text-neutral-500">
                                模板支持 {"{{input}}"} 占位符，发送消息时会自动替换为你输入的问题。
                              </p>
                            </label>
                            <div className="flex items-center justify-between gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = promptProfiles.filter(p => p.id !== activePromptProfile.id);
                                  setPromptProfiles(next);
                                  setActivePromptProfileId(next[0]?.id ?? "");
                                  setPromptDirty(true);
                                  setPromptStatus(null);
                                }}
                                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                              >
                                删除当前 Prompt
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSavePromptDefaults()}
                                disabled={!promptDirty || !cfg}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${
                                  !promptDirty || !cfg
                                    ? "bg-neutral-300 dark:bg-neutral-800 cursor-not-allowed"
                                    : "bg-[#5856D6] hover:bg-[#4a48c4]"
                                }`}
                              >
                                保存 Prompt 配置
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-neutral-400 py-6">
                            请选择或新增一个 Prompt 配置。
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-neutral-200/70 dark:border-neutral-800 text-[11px] text-neutral-500">
                      发送测试消息时，将自动使用当前选中的 Prompt。
                    </div>
                    <div className="flex items-center justify-end mt-2">
                      {promptStatus ? <span className="text-xs text-neutral-500">{promptStatus}</span> : null}
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

