const LRC_TIMESTAMP_PATTERN = /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/;

export interface ParsedLrcLine {
  time: number;
  text: string;
}

export function isLrcLyrics(text: string): boolean {
  return LRC_TIMESTAMP_PATTERN.test(text);
}

export function extractLyricsFromSummary(summary?: string | null): string | undefined {
  const trimmed = summary?.trim();
  if (!trimmed || !isLrcLyrics(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function parseLrcLines(lrc: string): ParsedLrcLine[] {
  const lines: ParsedLrcLine[] = [];

  for (const rawLine of lrc.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/);
    if (!match) continue;

    const minutes = Number.parseInt(match[1], 10);
    const seconds = Number.parseInt(match[2], 10);
    const fractionRaw = match[3] ?? "";
    const fraction = fractionRaw
      ? Number.parseInt(fractionRaw.padEnd(3, "0").slice(0, 3), 10) / 1000
      : 0;

    lines.push({
      time: minutes * 60 + seconds + fraction,
      text: match[4].trim(),
    });
  }

  return lines.sort((left, right) => left.time - right.time);
}

export function stripLrcTimestamps(lrc: string): string {
  return lrc
    .split("\n")
    .map(line => line.replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function isMeaningfulLyricLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^(男|女|合)[：:]$/.test(trimmed)) return false;
  if (/^(词|曲|编曲|制作人|监制|混音|母带|出品)[：:]/.test(trimmed)) return false;
  if (/^.+\s[-–—]\s.+$/.test(trimmed) && trimmed.length <= 48) return false;
  return true;
}

function getDisplayLyricLines(lrc: string): ParsedLrcLine[] {
  return parseLrcLines(lrc).filter(line => isMeaningfulLyricLine(line.text));
}

function getActiveDisplayLyricIndex(lines: ParsedLrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;

  let activeIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= currentTime) {
      activeIndex = index;
    } else {
      break;
    }
  }

  return activeIndex;
}

export function getCurrentLyricLine(lrc: string, currentTime: number): string | undefined {
  const lines = parseLrcLines(lrc);
  if (lines.length === 0) return undefined;

  let current = lines[0];
  for (const line of lines) {
    if (line.time <= currentTime) {
      current = line;
    } else {
      break;
    }
  }

  return current.text || undefined;
}

export function getLyricsPreview(lrc: string, currentTime?: number): string | undefined {
  if (currentTime !== undefined) {
    const current = getCurrentLyricLine(lrc, currentTime);
    if (current && isMeaningfulLyricLine(current)) {
      return current;
    }
  }

  for (const line of parseLrcLines(lrc)) {
    if (isMeaningfulLyricLine(line.text)) {
      return line.text;
    }
  }

  return undefined;
}

export function getActiveLyricIndex(lrc: string, currentTime: number): number {
  const lines = parseLrcLines(lrc);
  if (lines.length === 0) return -1;

  let activeIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= currentTime) {
      activeIndex = index;
    } else {
      break;
    }
  }

  return activeIndex;
}

export interface LyricsDisplayLine {
  text: string;
  isActive: boolean;
  index: number;
}

export function getLyricsDisplayLines(
  lrc: string,
  currentTime: number,
  maxLines = 3,
): LyricsDisplayLine[] | null {
  const lines = getDisplayLyricLines(lrc);
  if (lines.length === 0) return null;

  const activeIndex = getActiveDisplayLyricIndex(lines, currentTime);
  const visibleCount = Math.min(Math.max(3, maxLines), 3);
  const half = Math.floor(visibleCount / 2);
  let start = Math.max(0, activeIndex - half);
  let end = start + visibleCount - 1;
  if (end >= lines.length) {
    end = lines.length - 1;
    start = Math.max(0, end - visibleCount + 1);
  }

  return lines.slice(start, end + 1).map((line, offset) => ({
    text: line.text,
    isActive: start + offset === activeIndex,
    index: start + offset,
  }));
}
