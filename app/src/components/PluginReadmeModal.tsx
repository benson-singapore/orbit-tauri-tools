import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import { Icon } from "@/components/Icon";
import { fetchPluginReadme } from "@/lib/feed";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import type { Plugin, ThemeMode } from "@/types";

marked.setOptions({ gfm: true, breaks: false });

interface PluginReadmeModalProps {
  theme: ThemeMode;
  plugin: Plugin;
  onClose: () => void;
}

export function PluginReadmeModal({ theme, plugin, onClose }: PluginReadmeModalProps) {
  const isDark = theme === "dark";
  const subtleBorder = isDark ? "border-neutral-800" : "border-neutral-200";
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
  const contentRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPluginReadme(plugin.id)
      .then(content => {
        if (!cancelled) {
          setMarkdown(content);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id]);

  const html = useMemo(() => {
    if (!markdown.trim()) {
      return "";
    }
    return marked.parse(markdown) as string;
  }, [markdown]);

  useEffect(() => {
    if (!loading && html) {
      highlightArticleCode(contentRef.current);
    }
  }, [loading, html]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-6xl h-[min(820px,88vh)] flex flex-col rounded-[28px] border shadow-2xl overflow-hidden ${panelBg} ${subtleBorder}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-readme-title"
      >
        <div className={`shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-b ${subtleBorder}`}>
          <div className="min-w-0">
            <h3 id="plugin-readme-title" className="text-sm font-semibold truncate">
              {plugin.name} — 使用说明
            </h3>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              插件配置与频道说明文档
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 p-2 rounded-xl transition-colors ${
              isDark ? "hover:bg-neutral-800 text-neutral-400" : "hover:bg-neutral-100 text-neutral-500"
            }`}
            aria-label="关闭"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-3 pb-6">
          {loading ? (
            <div className={`flex items-center justify-center gap-2 py-12 text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              <Icon name="refresh" className="w-4 h-4 animate-spin" />
              加载说明文档…
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              <p className={`text-[11px] mt-2 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                该插件可能未包含 README.md 说明文件
              </p>
            </div>
          ) : (
            <div
              ref={contentRef}
              data-theme={theme}
              className="article-content [&>:first-child]:mt-0"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
