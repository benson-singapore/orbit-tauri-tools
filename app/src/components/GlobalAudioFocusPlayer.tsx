import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { AudioFocusView } from "@/components/AudioFocusView";
import type { AudioFocusHost } from "@/hooks/useAudioFocusHost";
import type { Article, Plugin, ThemeMode } from "@/types";

interface GlobalAudioFocusPlayerProps {
  host: AudioFocusHost;
  theme: ThemeMode;
  runtimeBase: string | null;
  pluginMeta?: Plugin | null;
  loading?: boolean;
  loadingMore?: boolean;
  searching?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onTrackPlay?: (article: Article) => void;
  showFavorites?: boolean;
  favoritedArticleIds?: Set<string>;
  onToggleFavorite?: (article: Article, event: MouseEvent) => void;
  onDock: () => void;
  onClose: () => void;
}

const headerButtonClass = "orbit-reader-modal-header-btn";

const HIDDEN_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 0,
  right: 0,
  width: 1,
  height: 1,
  opacity: 0.01,
  overflow: "hidden",
  pointerEvents: "none",
};

function useInlineMountRect(sessionId: string, enabled: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const frameRef = useRef<number | null>(null);

  const update = useCallback(() => {
    const mount = document.getElementById(`audio-focus-inline-mount-${sessionId}`);
    setRect(mount ? mount.getBoundingClientRect() : null);
  }, [sessionId]);

  useLayoutEffect(() => {
    if (!enabled) {
      setRect(null);
      return;
    }

    update();

    const mount = document.getElementById(`audio-focus-inline-mount-${sessionId}`);
    const observer = new ResizeObserver(update);
    if (mount) {
      observer.observe(mount);
    }

    const mutationObserver = new MutationObserver(() => {
      const next = document.getElementById(`audio-focus-inline-mount-${sessionId}`);
      if (!next) {
        setRect(null);
        return;
      }
      observer.observe(next);
      update();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    const onScrollOrResize = () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(update);
    };
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, sessionId, update]);

  return rect;
}

/**
 * One persistent audio-focus player for inline / docked / expanded layouts.
 *
 * Important: the portal tree shape must stay identical across layout changes so
 * AudioFocusView / APlayer are never remounted (expand used to swap div→Fragment
 * and reset to track 0 + paused).
 */
export function GlobalAudioFocusPlayer({
  host,
  theme,
  runtimeBase,
  pluginMeta,
  loading = false,
  loadingMore = false,
  searching = false,
  hasMore = false,
  onLoadMore,
  onTrackPlay,
  showFavorites = false,
  favoritedArticleIds,
  onToggleFavorite,
  onDock,
  onClose,
}: GlobalAudioFocusPlayerProps) {
  const isExpanded = host.layout === "expanded";
  const isDocked = host.layout === "docked";
  const isInline = host.layout === "inline";
  const inlineRect = useInlineMountRect(host.sessionId, isInline);
  const hasInlineRect = Boolean(inlineRect && inlineRect.width > 0 && inlineRect.height > 0);
  const isHiddenShell = isDocked || (isInline && !hasInlineRect);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDock();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, onDock]);

  let hostStyle: CSSProperties = HIDDEN_STYLE;
  if (isExpanded) {
    hostStyle = {
      pointerEvents: "auto",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "90vh",
      width: "100%",
      maxWidth: "56rem",
      overflow: "hidden",
    };
  } else if (isInline && hasInlineRect && inlineRect) {
    hostStyle = {
      position: "fixed",
      top: inlineRect.top,
      left: inlineRect.left,
      width: inlineRect.width,
      height: inlineRect.height,
      zIndex: 5,
      overflow: "hidden",
    };
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        style={{ display: isExpanded ? undefined : "none" }}
        onClick={onDock}
        aria-hidden={!isExpanded}
      />

      <div
        className={
          isExpanded
            ? "fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
            : undefined
        }
        style={isExpanded ? undefined : { display: "contents" }}
      >
        <div
          data-orbit-audio-dock-host={host.sessionId}
          style={hostStyle}
          className={
            isExpanded
              ? "pointer-events-auto relative flex flex-col overflow-hidden rounded-2xl shadow-2xl orbit-reader-modal orbit-reader-chrome"
              : isHiddenShell
                ? "pointer-events-none"
                : undefined
          }
          role={isExpanded ? "dialog" : undefined}
          aria-modal={isExpanded || undefined}
          aria-hidden={isHiddenShell || undefined}
          onClick={isExpanded ? event => event.stopPropagation() : undefined}
        >
          <div
            className="absolute top-3 right-3 z-10 flex items-center gap-1"
            style={{ display: isExpanded ? undefined : "none" }}
          >
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onDock();
              }}
              className={`rounded-full p-2 transition-colors ${headerButtonClass}`}
              aria-label="挂起到侧栏"
              title="挂起到侧栏 (Esc)"
            >
              <Icon name="expand" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onClose();
              }}
              className={`rounded-full p-2 transition-colors ${headerButtonClass}`}
              aria-label="关闭"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>

          <div
            className={
              isExpanded
                ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-8 sm:py-6"
                : isHiddenShell
                  ? "h-[min(90vh,720px)] w-[min(96vw,960px)]"
                  : "flex h-full min-h-0 flex-col"
            }
          >
            <AudioFocusView
              theme={theme}
              runtimeBase={runtimeBase}
              pluginId={host.pluginId}
              channelId={host.channelId}
              pluginMeta={pluginMeta ?? null}
              articles={host.articles}
              loading={isInline ? loading : false}
              loadingMore={isInline ? loadingMore : false}
              searching={isInline ? searching : false}
              hasMore={isInline ? hasMore : false}
              onLoadMore={isInline ? (onLoadMore ?? (() => {})) : () => {}}
              onTrackPlay={onTrackPlay}
              showFavorites={isInline ? showFavorites : false}
              favoritedArticleIds={favoritedArticleIds}
              onToggleFavorite={onToggleFavorite}
              playbackResume={host.playbackResume}
              initialResolvedUrls={host.resolvedUrls}
              initialResolvedCovers={host.resolvedCovers}
              initialResolvedLyrics={host.resolvedLyrics}
              initialResolvedSummaries={host.resolvedSummaries}
              initialPlaylistOrder={host.playlistOrder}
              hosted
            />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
