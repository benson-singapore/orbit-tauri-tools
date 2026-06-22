import Hls from "hls.js";
import { isHlsVideoUrl } from "@/lib/articleVideoUrl";
import {
  bindEmbeddedVideoTheater,
  destroyEmbeddedVideoTheater,
  exitEmbeddedVideoTheater,
} from "@/lib/articleContentVideoTheater";
import type { Article } from "@/types";

const hlsByVideo = new WeakMap<HTMLVideoElement, Hls>();
const SOURCE_SWITCH_RE = /rycjSwitchSource\s*\(\s*(\d+)\s*\)/i;
const RYCJ_SOURCES_RE = /rycjSources\s*=\s*(\[[\s\S]*?\])/;

export const CONTENT_SOURCE_BTN_CLASS = "orbit-content-source-btn";
export const CONTENT_SOURCE_BTN_ACTIVE_CLASS = "orbit-content-source-btn--active";

export function parseRycjSourcesFromText(scriptText: string): string[] {
  const match = scriptText.match(RYCJ_SOURCES_RE);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch {
    return [];
  }
}

function parseRycjSourcesFromJson(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch {
    return [];
  }
}

/** Read `rycjSources` from raw chapter HTML (scripts or processed `data-rycj-sources`). */
export function parseRycjSourcesFromHtml(html: string): string[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];

  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const article of doc.querySelectorAll("article.rycjapi-player")) {
    const fromData = article.getAttribute("data-rycj-sources");
    if (fromData) {
      const sources = parseRycjSourcesFromJson(fromData);
      if (sources.length > 0) return sources;
    }
  }

  for (const script of doc.querySelectorAll("script")) {
    const sources = parseRycjSourcesFromText(script.textContent ?? "");
    if (sources.length > 0) return sources;
  }

  return [];
}

export function extractRycjVideoUrlFromContent(html: string): string | null {
  const sources = parseRycjSourcesFromHtml(html);
  return sources[0] ?? null;
}

function readRycjSourcesFromPlayer(player: HTMLElement): string[] {
  const fromData = player.dataset.rycjSources;
  if (fromData) {
    const sources = parseRycjSourcesFromJson(fromData);
    if (sources.length > 0) return sources;
  }

  const siblingScript = player.nextElementSibling;
  if (siblingScript?.tagName === "SCRIPT") {
    const sources = parseRycjSourcesFromText(siblingScript.textContent ?? "");
    if (sources.length > 0) return sources;
  }

  const parentScript = player.parentElement?.querySelector("script");
  if (parentScript) {
    const sources = parseRycjSourcesFromText(parentScript.textContent ?? "");
    if (sources.length > 0) return sources;
  }

  return [];
}

/** Active rycj source from a mounted article-content player (respects line switch). */
export function extractActiveRycjVideoUrlFromDom(root: HTMLElement | null): string | null {
  if (!root) return null;

  const player = root.querySelector<HTMLElement>("article.rycjapi-player");
  if (!player) return null;

  const sources = readRycjSourcesFromPlayer(player);
  if (sources.length === 0) return null;

  const activeIndex = resolveActiveSourceIndex(player);
  return sources[activeIndex] ?? sources[0] ?? null;
}

function isActiveSourceButton(btn: HTMLElement): boolean {
  const styleAttr = btn.getAttribute("style")?.toLowerCase() ?? "";
  if (styleAttr.includes("e11d48") || styleAttr.includes("fff1f2") || styleAttr.includes("be123c")) {
    return true;
  }

  const style = btn.style;
  const border = `${style.borderColor} ${style.border}`.toLowerCase();
  const background = `${style.backgroundColor} ${style.background}`.toLowerCase();
  return (
    border.includes("225") ||
    border.includes("e11d48") ||
    background.includes("255, 241, 242") ||
    background.includes("fff1f2")
  );
}

export function isInlineSourceSwitchButton(el: HTMLElement): boolean {
  if (el.tagName !== "BUTTON") return false;
  const onclick = el.getAttribute("onclick") ?? "";
  return SOURCE_SWITCH_RE.test(onclick);
}

function normalizeInlineSourceButton(btn: HTMLButtonElement): void {
  const match = btn.getAttribute("onclick")?.match(SOURCE_SWITCH_RE);
  const index = match?.[1] ?? "0";

  btn.classList.add(CONTENT_SOURCE_BTN_CLASS);
  if (isActiveSourceButton(btn)) {
    btn.classList.add(CONTENT_SOURCE_BTN_ACTIVE_CLASS);
  }

  btn.dataset.sourceIndex = index;
  btn.removeAttribute("onclick");
  btn.style.removeProperty("border");
  btn.style.removeProperty("border-color");
  btn.style.removeProperty("background");
  btn.style.removeProperty("background-color");
  btn.style.removeProperty("color");
  if (!btn.style.cssText.trim()) {
    btn.removeAttribute("style");
  }
}

export function hasInlineArticleContentPlayer(
  article: Pick<Article, "content">,
): boolean {
  const content = article.content?.trim();
  if (!content) return false;
  return content.includes("rycjapi-player");
}

export function extractRycjPlayerScripts(root: ParentNode): boolean {
  let changed = false;

  for (const script of Array.from(root.querySelectorAll("script"))) {
    const text = script.textContent ?? "";
    if (!text.includes("rycjSources")) continue;

    const sources = parseRycjSourcesFromText(text);
    if (sources.length === 0) continue;

    const article =
      script.previousElementSibling?.classList.contains("rycjapi-player")
        ? script.previousElementSibling
        : script.parentElement?.querySelector("article.rycjapi-player");

    if (article instanceof HTMLElement) {
      article.dataset.rycjSources = JSON.stringify(sources);
    }

    script.remove();
    changed = true;
  }

  return changed;
}

export function normalizeContentSourceButtons(root: ParentNode): boolean {
  let changed = false;

  for (const el of root.querySelectorAll("button[onclick]")) {
    const btn = el as HTMLButtonElement;
    if (!isInlineSourceSwitchButton(btn)) continue;
    normalizeInlineSourceButton(btn);
    changed = true;
  }

  return changed;
}

export function destroyEmbeddedVideoHls(video: HTMLVideoElement): void {
  const hls = hlsByVideo.get(video);
  if (!hls) return;
  hls.destroy();
  hlsByVideo.delete(video);
}

export function setEmbeddedVideoSource(video: HTMLVideoElement, url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;

  const wasPlaying = !video.paused;
  const currentTime = video.currentTime;

  destroyEmbeddedVideoHls(video);
  video.removeAttribute("src");
  for (const source of Array.from(video.querySelectorAll("source"))) {
    source.remove();
  }

  const resumePlayback = () => {
    if (currentTime > 0.5) {
      try {
        video.currentTime = currentTime;
      } catch {
        // Ignore seek failures before metadata is ready.
      }
    }
    if (wasPlaying) {
      void video.play().catch(() => {});
    }
  };

  if (isHlsVideoUrl(trimmed) && Hls.isSupported()) {
    const hls = new Hls();
    hlsByVideo.set(video, hls);
    hls.loadSource(trimmed);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, resumePlayback, { once: true });
    return;
  }

  video.src = trimmed;
  if (video.readyState >= 1) {
    resumePlayback();
    return;
  }
  video.addEventListener("loadedmetadata", resumePlayback, { once: true });
}

function resolveActiveSourceIndex(article: HTMLElement): number {
  const buttons = article.querySelectorAll<HTMLButtonElement>(`button.${CONTENT_SOURCE_BTN_CLASS}`);
  for (const [index, button] of Array.from(buttons).entries()) {
    if (button.classList.contains(CONTENT_SOURCE_BTN_ACTIVE_CLASS)) {
      const parsed = Number.parseInt(button.dataset.sourceIndex ?? String(index), 10);
      return Number.isFinite(parsed) ? parsed : index;
    }
  }
  return 0;
}

function bindRycjPlayer(article: HTMLElement): void {
  const sourcesJson = article.dataset.rycjSources;
  if (!sourcesJson) return;

  let sources: string[] = [];
  try {
    const parsed = JSON.parse(sourcesJson) as unknown;
    if (Array.isArray(parsed)) {
      sources = parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    }
  } catch {
    return;
  }
  if (sources.length === 0) return;

  const video = article.querySelector<HTMLVideoElement>("video");
  if (!video) return;

  const buttons = article.querySelectorAll<HTMLButtonElement>(`button.${CONTENT_SOURCE_BTN_CLASS}`);
  const activeIndex = resolveActiveSourceIndex(article);
  const initialUrl = sources[activeIndex] ?? sources[0];
  if (initialUrl) {
    setEmbeddedVideoSource(video, initialUrl);
  }

  bindEmbeddedVideoTheater(video);

  buttons.forEach((button, index) => {
    if (!button.classList.contains(CONTENT_SOURCE_BTN_ACTIVE_CLASS) && index === activeIndex) {
      button.classList.add(CONTENT_SOURCE_BTN_ACTIVE_CLASS);
    }

    button.addEventListener("click", () => {
      const sourceIndex = Number.parseInt(button.dataset.sourceIndex ?? String(index), 10);
      const nextUrl = sources[sourceIndex];
      if (!nextUrl) return;

      setEmbeddedVideoSource(video, nextUrl);
      buttons.forEach(item => {
        item.classList.toggle(CONTENT_SOURCE_BTN_ACTIVE_CLASS, item === button);
      });
    });
  });
}

export function bindArticleContentPlayers(root: HTMLElement | null): void {
  if (!root) return;

  for (const article of root.querySelectorAll<HTMLElement>("article.rycjapi-player")) {
    if (article.dataset.orbitPlayerBound === "1") continue;
    article.dataset.orbitPlayerBound = "1";
    bindRycjPlayer(article);
  }
}

export function destroyArticleContentPlayers(root: HTMLElement | null): void {
  if (!root) return;

  for (const video of root.querySelectorAll("video")) {
    exitEmbeddedVideoTheater(video);
    destroyEmbeddedVideoTheater(video);
    destroyEmbeddedVideoHls(video);
  }
}
