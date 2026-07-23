import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { AudioFocusView } from "@/components/AudioFocusView";
import type { ReaderSession } from "@/lib/readerSessions";
import type { Plugin, ThemeMode } from "@/types";

interface AudioFocusDockSurfaceProps {
  session: ReaderSession;
  theme: ThemeMode;
  runtimeBase: string | null;
  pluginMeta?: Plugin | null;
  onDock: () => void;
  onClose: () => void;
}

const headerButtonClass = "orbit-reader-modal-header-btn";

/**
 * Single persistent host for docked audio-focus playlists.
 * One React tree for the player — dock / expand only toggles layout via CSS.
 */
export function AudioFocusDockSurface({
  session,
  theme,
  runtimeBase,
  pluginMeta,
  onDock,
  onClose,
}: AudioFocusDockSurfaceProps) {
  const dock = session.audioFocusDock;
  if (!dock) return null;

  const isExpanded = session.mode === "expanded";

  return createPortal(
    <>
      {isExpanded ? (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          onClick={onDock}
          aria-hidden
        />
      ) : null}
      <div
        data-orbit-audio-dock-host={`${dock.pluginId}-${dock.channelId}-audio-playlist`}
        className={
          isExpanded
            ? "fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
            : "fixed bottom-0 right-0 z-[5] h-px w-px overflow-hidden opacity-[0.01] pointer-events-none"
        }
        aria-hidden={!isExpanded}
      >
        <div
          className={
            isExpanded
              ? "pointer-events-auto relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl orbit-reader-modal orbit-reader-chrome"
              : "h-[min(90vh,720px)] w-[min(96vw,960px)]"
          }
          role={isExpanded ? "dialog" : undefined}
          aria-modal={isExpanded ? true : undefined}
          onClick={event => event.stopPropagation()}
        >
          {isExpanded ? (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onDock();
                }}
                className={`p-2 rounded-full transition-colors ${headerButtonClass}`}
                aria-label="挂起到侧栏"
                title="挂起到侧栏 (Esc)"
              >
                <Icon name="expand" className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onClose();
                }}
                className={`p-2 rounded-full transition-colors ${headerButtonClass}`}
                aria-label="关闭"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>
          ) : null}
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-5 sm:px-8 py-4 sm:py-6">
            <AudioFocusView
              theme={theme}
              runtimeBase={runtimeBase}
              pluginId={dock.pluginId}
              channelId={dock.channelId}
              pluginMeta={pluginMeta ?? null}
              articles={dock.articles}
              loading={false}
              loadingMore={false}
              searching={false}
              hasMore={false}
              onLoadMore={() => {}}
              playbackResume={dock.playbackResume}
              initialResolvedUrls={dock.resolvedUrls}
              initialResolvedCovers={dock.resolvedCovers}
              initialResolvedLyrics={dock.resolvedLyrics}
              initialResolvedSummaries={dock.resolvedSummaries}
              initialPlaylistOrder={dock.playlistOrder}
            />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
