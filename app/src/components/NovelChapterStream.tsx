import type { RefObject } from "react";
import { articleContentTheme } from "@/lib/themeMode";
import type { NovelStreamSlot } from "@/hooks/useNovelChapterStream";
import type { ThemeMode } from "@/types";

interface NovelChapterStreamProps {
  slots: NovelStreamSlot[];
  streamContainerRef: RefObject<HTMLDivElement | null>;
  theme: ThemeMode;
  reachedEnd: boolean;
  className?: string;
}

export function NovelChapterStream({
  slots,
  streamContainerRef,
  theme,
  reachedEnd,
  className,
}: NovelChapterStreamProps) {
  return (
    <div
      ref={streamContainerRef}
      className={className ? `novel-chapter-stream ${className}` : "novel-chapter-stream"}
      data-novel-stream="true"
    >
      {slots.map((slot, index) => (
        <section
          key={slot.chapter.id}
          data-novel-chapter={slot.chapter.id}
          className={`novel-chapter-block${index > 0 ? " novel-chapter-block--continued" : ""}`}
          aria-label={slot.chapter.title}
        >
          {index > 0 ? (
            <div className="novel-chapter-separator" role="separator" aria-label={slot.chapter.title}>
              <span className="novel-chapter-separator__line" aria-hidden />
              <span className="novel-chapter-separator__label">{slot.chapter.title}</span>
              <span className="novel-chapter-separator__line" aria-hidden />
            </div>
          ) : null}
          {slot.status === "loading" ? (
            <div className="flex items-center justify-center py-16 text-sm text-neutral-400">
              <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : slot.status === "error" || !slot.contentHtml ? (
            <p className="py-6 text-sm text-neutral-400">本章内容加载失败</p>
          ) : (
            <div
              data-theme={articleContentTheme(theme)}
              className="article-content novel-chapter-pages mt-6"
              dangerouslySetInnerHTML={{ __html: slot.contentHtml }}
            />
          )}
        </section>
      ))}

      {reachedEnd && slots.length > 0 && slots[slots.length - 1].status === "ready" ? (
        <p className="py-8 text-center text-xs text-neutral-400">已读到最新一章</p>
      ) : null}
    </div>
  );
}
