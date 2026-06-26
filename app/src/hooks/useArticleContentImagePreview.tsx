import { useCallback, useState } from "react";
import { ArticleContentImageLightbox } from "@/components/ArticleContentImageLightbox";

interface ArticleImagePreviewState {
  urls: string[];
  index: number;
}

export function useArticleContentImagePreview(runtimeBase: string | null) {
  const [preview, setPreview] = useState<ArticleImagePreviewState | null>(null);

  const openImagePreview = useCallback((urls: string[], index: number) => {
    if (!urls.length) return;
    setPreview({
      urls,
      index: Math.max(0, Math.min(index, urls.length - 1)),
    });
  }, []);

  const closeImagePreview = useCallback(() => {
    setPreview(null);
  }, []);

  const previewLightbox = preview ? (
    <ArticleContentImageLightbox
      runtimeBase={runtimeBase}
      urls={preview.urls}
      initialIndex={preview.index}
      onClose={closeImagePreview}
    />
  ) : null;

  return {
    openImagePreview,
    previewLightbox,
  };
}
