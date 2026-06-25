import { useRef, type Ref } from "react";
import { COMIC_LAZY_PLACEHOLDER_SRC } from "@/lib/comicChapterContent";
import { articleContentTheme } from "@/lib/themeMode";
import type { ThemeMode } from "@/types";

interface ComicPagesViewProps {
  pages: string[];
  runtimeBase: string | null;
  theme: ThemeMode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function ComicPagesView({
  pages,
  runtimeBase: _runtimeBase,
  theme,
  className,
  ref,
}: ComicPagesViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const setRef = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  return (
    <div
      ref={setRef}
      data-comic-pages="true"
      data-theme={articleContentTheme(theme)}
      className={className ?? "article-content comic-chapter-pages comic-pages-json mt-6"}
    >
      {pages.map((url, index) => (
        <img
          key={`${index}-${url}`}
          src={COMIC_LAZY_PLACEHOLDER_SRC}
          data-src={url}
          alt={`第 ${index + 1} 页`}
          decoding="async"
          referrerPolicy="no-referrer"
          data-comic-page={index + 1}
          data-comic-lazy="true"
          className="comic-page-lazy"
        />
      ))}
    </div>
  );
}
