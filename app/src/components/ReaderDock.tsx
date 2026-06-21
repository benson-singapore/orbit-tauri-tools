import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import type { ReaderSession } from "@/lib/readerSessions";
import type { ThemeMode } from "@/types";

interface ReaderDockProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  sessions: ReaderSession[];
  onExpand: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}

function sessionTypeIcon(type: ReaderSession["article"]["type"]): string {
  switch (type) {
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "image":
      return "image";
    default:
      return "text";
  }
}

function DockItem({
  theme,
  runtimeBase,
  session,
  onExpand,
  onClose,
}: {
  theme: ThemeMode;
  runtimeBase: string | null;
  session: ReaderSession;
  onExpand: () => void;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isDark = theme === "dark";
  const { article } = session;
  const cover = article.image?.trim();

  return (
    <div
      className="relative flex justify-end"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`absolute right-full top-1/2 mr-2 -translate-y-1/2 w-64 rounded-xl border shadow-xl overflow-hidden transition-all duration-200 origin-right ${
          hovered
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        } ${
          isDark
            ? "bg-[#1c1c1e] border-neutral-700/80 text-white"
            : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        <button
          type="button"
          onClick={onExpand}
          className="w-full text-left p-3 space-y-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 truncate">
            {article.pluginName}
          </p>
          <p className="text-sm font-semibold leading-snug line-clamp-2">{article.title}</p>
          {cover ? (
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-neutral-900/40">
              <ProxiedImage
                runtimeBase={runtimeBase}
                src={cover}
                alt={article.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className={`aspect-video w-full rounded-lg flex items-center justify-center ${
                isDark ? "bg-neutral-800" : "bg-neutral-100"
              }`}
            >
              <Icon name={sessionTypeIcon(article.type)} className="w-8 h-8 text-neutral-400" />
            </div>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400">
            <Icon name="expand" className="w-3.5 h-3.5" />
            点击展开
          </span>
        </button>
        <div className={`flex border-t ${isDark ? "border-neutral-700/80" : "border-neutral-200"}`}>
          <button
            type="button"
            onClick={onExpand}
            className="flex-1 py-2 text-xs font-medium text-indigo-500 dark:text-indigo-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            展开
          </button>
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onClose();
            }}
            className={`flex-1 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
              isDark ? "text-neutral-400" : "text-neutral-500"
            }`}
          >
            关闭
          </button>
        </div>
      </div>

      <div
        className={`group relative w-11 h-11 rounded-xl border shadow-lg overflow-hidden transition-transform hover:scale-105 ${
          isDark
            ? "border-neutral-700/80 bg-[#1c1c1e] hover:border-neutral-600"
            : "border-neutral-200 bg-white hover:border-neutral-300"
        }`}
      >
        <button
          type="button"
          onClick={onExpand}
          title={article.title}
          className="w-full h-full"
        >
          {cover ? (
            <ProxiedImage
              runtimeBase={runtimeBase}
              src={cover}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon name={sessionTypeIcon(article.type)} className="w-5 h-5 text-neutral-400" />
            </div>
          )}
        </button>
        <span
          className={`absolute bottom-0 inset-x-0 h-1 pointer-events-none ${
            article.type === "video" ? "bg-red-500/80" : "bg-indigo-500/80"
          }`}
        />
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onClose();
          }}
          className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
            isDark ? "bg-neutral-700 text-white" : "bg-neutral-200 text-neutral-600"
          }`}
          aria-label="关闭"
        >
          <Icon name="close" className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

export function ReaderDock({
  theme,
  runtimeBase,
  sessions,
  onExpand,
  onClose,
}: ReaderDockProps) {
  const dockedSessions = sessions.filter(session => session.mode === "docked");
  if (dockedSessions.length === 0) return null;

  const isDark = theme === "dark";

  const dock = (
    <div
      className="fixed right-3 top-1/2 z-[110] flex flex-col gap-2 -translate-y-1/2 max-h-[min(70vh,520px)] overflow-y-auto overflow-x-visible py-1 pr-0.5"
      aria-label="挂起的阅读窗口"
    >
      {dockedSessions.length > 1 ? (
        <div
          className={`self-end px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
            isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {dockedSessions.length}
        </div>
      ) : null}
      {dockedSessions.map(session => (
        <DockItem
          key={session.id}
          theme={theme}
          runtimeBase={runtimeBase}
          session={session}
          onExpand={() => onExpand(session.id)}
          onClose={() => onClose(session.id)}
        />
      ))}
    </div>
  );

  return createPortal(dock, document.body);
}
