import type { PluginPreviewMode } from "@/lib/pluginPreviewMode";
import type { ReaderSession } from "@/lib/readerSessions";
import { isVideoReaderSession } from "@/lib/readerSessionVideos";

export function isWallVideoPreviewMode(mode: PluginPreviewMode): boolean {
  return mode === "videoWall" || mode === "split";
}

export function sessionUsesWallMount(
  session: ReaderSession,
  previewMode: PluginPreviewMode,
): boolean {
  if (!isVideoReaderSession(session)) return false;
  if (previewMode === "videoWall") return true;
  if (previewMode === "split") return session.mode === "docked";
  return false;
}

export function splitPanelVideoSessions(sessions: ReaderSession[]): ReaderSession[] {
  return sessions.filter(session => isVideoReaderSession(session) && session.mode === "docked");
}
