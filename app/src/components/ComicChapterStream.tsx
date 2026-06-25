import type { RefObject } from "react";
import { ComicPagesView } from "@/components/ComicPagesView";
import { articleContentTheme } from "@/lib/themeMode";
import type { ComicStreamSlot } from "@/hooks/useComicChapterStream";
import type { ThemeMode } from "@/types";

interface ComicChapterStreamProps {
  slots: ComicStreamSlot[];
  streamContainerRef: RefObject<HTMLDivElement | null>;
  theme: ThemeMode;
  runtimeBase: string | null;
  reachedEnd: boolean;
  className?: string;
}

export function ComicChapterStream({
  slots,
  streamContainerRef,
  theme,
  runtimeBase,
  reachedEnd,
  className,
}: ComicChapterStreamProps) {
  return (
    <div
      ref={streamContainerRef}
      className={className ? `comic-chapter-stream ${className}` : "comic-chapter-stream"}
      data-comic-stream="true"
    >
      {slots.map(slot => (
        <section
          key={slot.chapter.id}
          data-comic-chapter={slot.chapter.id}
          className="comic-chapter-block"
          aria-label={slot.chapter.title}
        >
          {slot.status === "loading" ? (
            <div className="flex items-center justify-center py-16 text-sm text-neutral-400">
              <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : slot.status === "error" || (!slot.pageUrls?.length && !slot.contentHtml) ? (
            <p className="py-6 text-sm text-neutral-400">本话内容加载失败</p>
          ) : slot.pageUrls?.length ? (
            <ComicPagesView
              pages={slot.pageUrls}
              runtimeBase={runtimeBase}
              theme={theme}
              className="article-content comic-chapter-pages comic-pages-json"
            />
          ) : (
            <div
              data-theme={articleContentTheme(theme)}
              className="article-content comic-chapter-pages"
              dangerouslySetInnerHTML={{ __html: slot.contentHtml }}
            />
          )}
        </section>
      ))}

      {reachedEnd && slots.length > 0 && slots[slots.length - 1].status === "ready" ? (
        <p className="py-8 text-center text-xs text-neutral-400">已读到最新一话</p>
      ) : null}
    </div>
  );
}
