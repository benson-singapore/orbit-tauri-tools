const NOVEL_CHAPTER_TITLE_PATTERNS = [
  /^第\s*[\d０-９零一二三四五六七八九十百千万]+\s*章/u,
  /^Chapter\s+\d+/iu,
  /^(序章|楔子|前言|引子|后记|尾声|番外)/u,
];

function looksLikeNovelChapterTitle(text: string, chapterTitle?: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (chapterTitle && trimmed === chapterTitle.trim()) return true;
  return NOVEL_CHAPTER_TITLE_PATTERNS.some(pattern => pattern.test(trimmed));
}

function markNovelChapterTitle(root: ParentNode, chapterTitle?: string): boolean {
  const scopedRoots = Array.from(root.querySelectorAll<HTMLElement>(".chapter-content"));
  const searchRoots = scopedRoots.length > 0 ? scopedRoots : [root];

  for (const searchRoot of searchRoots) {
    const candidates = Array.from(
      searchRoot.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4"),
    ).slice(0, 4);

    for (const candidate of candidates) {
      const text = candidate.textContent?.trim() ?? "";
      if (!looksLikeNovelChapterTitle(text, chapterTitle)) continue;
      candidate.classList.add("novel-chapter-title");
      return true;
    }
  }

  return false;
}

/** Mark detected chapter headings and normalize novel chapter HTML for reader styling. */
export function enhanceNovelChapterDisplayContent(
  html: string,
  chapterTitle?: string,
): string {
  if (!html.trim() || typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (body.querySelector(".novel-chapter-title")) return html;

  markNovelChapterTitle(body, chapterTitle);
  return body.innerHTML;
}
