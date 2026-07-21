import { isHlsAudioUrl } from "@/lib/articleAudioUrl";
import { runtimeFetch } from "@/lib/runtimeFetch";

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "ogg", "wav", "flac", "opus"]);

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "audio";
}

function extensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
    return AUDIO_EXTENSIONS.has(ext) ? ext : null;
  } catch {
    const fallback = url.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
    return AUDIO_EXTENSIONS.has(fallback) ? fallback : null;
  }
}

export function buildAudioDownloadFilename(title: string, url: string): string {
  const safeTitle = sanitizeFilename(title);
  const ext = extensionFromUrl(url) ?? "mp3";
  return `${safeTitle}.${ext}`;
}

export async function downloadAudioTrack(
  url: string,
  title: string,
): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed || isHlsAudioUrl(trimmed)) {
    throw new Error("unsupported audio url");
  }

  const response = await runtimeFetch(trimmed);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = buildAudioDownloadFilename(title, trimmed);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
