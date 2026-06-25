import { useMemo } from "react";
import { resolveComicArticleDisplay } from "@/lib/comicChapterContent";
import type { Article, ThemeMode } from "@/types";

export function useComicArticleDisplay(
  article: Article | null | undefined,
  runtimeBase: string | null,
  theme: ThemeMode,
) {
  return useMemo(() => {
    if (!article) {
      return {
        pageUrls: null as string[] | null,
        html: "",
        isComicPages: false,
        isComicHtml: false,
        isComicReader: false,
      };
    }

    const { pageUrls, html } = resolveComicArticleDisplay(article, runtimeBase, theme);
    const isComicPages = pageUrls !== null && pageUrls.length > 0;
    const isComicHtml = !isComicPages && html.includes("comic-reader");
    const isComicReader = isComicPages || isComicHtml;

    return { pageUrls, html, isComicPages, isComicHtml, isComicReader };
  }, [article, article?.content, article?.image, article?.type, runtimeBase, theme]);
}
