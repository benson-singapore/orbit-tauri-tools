/** Text-to-speech is for HTML article bodies only — not comic/manga readers. */
export function shouldEnableArticleTTS(options: {
  isComicReaderContent: boolean;
  comicChapterStreamActive?: boolean;
  pluginMediaType?: string;
}): boolean {
  if (options.isComicReaderContent) return false;
  if (options.comicChapterStreamActive) return false;
  if (options.pluginMediaType === "manga") return false;
  return true;
}

export const TTS_PENDING_MARK_CLASS = "orbit-tts-pending-mark";
export const TTS_ACTIVE_MARK_CLASS = "orbit-tts-active-mark";
export const TTS_READ_MARK_CLASS = "orbit-tts-read-mark";

function isNodeInsideRoot(node: Node, root: HTMLElement): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest(".article-content") && root.contains(element));
}

export function getArticleContentSelectionRange(root: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!isNodeInsideRoot(range.commonAncestorContainer, root)) return null;

  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;

  return range.cloneRange();
}

export function getRangeText(range: Range): string {
  return range.toString().replace(/\s+/g, " ").trim();
}

function unwrapMark(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
  parent.normalize();
}

export function clearMarksByClass(root: HTMLElement, className: string) {
  root.querySelectorAll(`.${className}`).forEach(unwrapMark);
}

function collectTextNodesInRange(range: Range): Text[] {
  const root = range.commonAncestorContainer;
  const nodes: Text[] = [];

  if (root.nodeType === Node.TEXT_NODE) {
    nodes.push(root as Text);
    return nodes;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    if (range.intersectsNode(textNode) && textNode.textContent?.trim()) {
      nodes.push(textNode);
    }
    current = walker.nextNode();
  }

  return nodes;
}

export function applyMarkToRange(range: Range, className: string): HTMLElement[] {
  if (range.collapsed) return [];

  const workingRange = range.cloneRange();
  const mark = document.createElement("mark");
  mark.className = className;

  try {
    const fragment = workingRange.extractContents();
    if (!fragment.textContent?.replace(/\s+/g, "").trim()) {
      return [];
    }
    mark.appendChild(fragment);
    workingRange.insertNode(mark);
    return [mark];
  } catch {
    // Fall through to per-text-node wrapping.
  }

  const marks: HTMLElement[] = [];
  const textNodes = collectTextNodesInRange(range);

  for (const textNode of [...textNodes].reverse()) {
    const nodeRange = document.createRange();
    const start = textNode === range.startContainer ? range.startOffset : 0;
    const end = textNode === range.endContainer
      ? range.endOffset
      : (textNode.textContent?.length ?? 0);
    if (start >= end) continue;

    nodeRange.setStart(textNode, start);
    nodeRange.setEnd(textNode, end);

    const nodeMark = document.createElement("mark");
    nodeMark.className = className;
    try {
      nodeRange.surroundContents(nodeMark);
      marks.push(nodeMark);
    } catch {
      // Skip nodes that cannot be wrapped safely.
    }
  }

  return marks;
}

export function scrollMarksIntoView(marks: HTMLElement[]) {
  const first = marks.find(mark => mark.isConnected);
  first?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function promoteMarksClass(marks: HTMLElement[], fromClass: string, toClass: string) {
  for (const mark of marks) {
    mark.classList.remove(fromClass);
    mark.classList.add(toClass);
  }
}

export type ArticleTTSSelectionPayload = {
  text: string;
  range: Range;
};

export function bindArticleContentTTSSelection(
  root: HTMLElement,
  options: {
    enabled?: boolean;
    onSelection: (payload: ArticleTTSSelectionPayload) => void;
  },
): () => void {
  if (options.enabled === false) return () => {};

  const controller = new AbortController();
  const { signal } = controller;
  let rafId = 0;
  let pointerSelecting = false;

  const finalizeSelection = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const range = getArticleContentSelectionRange(root);
      if (!range) return;
      options.onSelection({
        text: getRangeText(range),
        range,
      });
    });
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Node) || !root.contains(event.target)) return;
    pointerSelecting = true;
  };

  const handlePointerUp = () => {
    if (!pointerSelecting) return;
    pointerSelecting = false;
    finalizeSelection();
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (
      event.key === "Shift"
      || event.key === "ArrowLeft"
      || event.key === "ArrowRight"
      || event.key === "ArrowUp"
      || event.key === "ArrowDown"
    ) {
      finalizeSelection();
    }
  };

  root.addEventListener("pointerdown", handlePointerDown, { signal });
  document.addEventListener("pointerup", handlePointerUp, { signal });
  document.addEventListener("keyup", handleKeyUp, { signal });

  return () => {
    cancelAnimationFrame(rafId);
    controller.abort();
  };
}
