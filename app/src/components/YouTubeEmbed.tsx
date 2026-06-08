import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { youtubeEmbedUrl } from "@/lib/youtube";

interface YouTubeEmbedProps {
  videoId: string;
  title: string;
}

const FULLSCREEN_BTN_CLASS =
  "absolute bottom-3 right-0 z-10 flex h-12 w-14 items-center justify-center text-white/90 transition-colors hover:bg-white/10 hover:text-white";

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  const [isTheater, setIsTheater] = useState(false);

  useEffect(() => {
    setIsTheater(false);
  }, [videoId]);

  const exitTheater = useCallback(() => setIsTheater(false), []);

  useEffect(() => {
    if (!isTheater) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitTheater();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isTheater, exitTheater]);

  const iframe = (
    <iframe
      src={youtubeEmbedUrl(videoId)}
      title={title}
      className="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );

  if (isTheater) {
    return (
      <div className="fixed inset-0 z-[200] bg-black">
        <div className="absolute inset-0">{iframe}</div>
        <button
          type="button"
          onClick={exitTheater}
          className={FULLSCREEN_BTN_CLASS}
          title="退出全屏 (Esc)"
          aria-label="退出全屏"
        >
          <Icon name="collapse" className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {iframe}
      {/* Covers the native YouTube fullscreen slot (hidden via fs=0). */}
      <button
        type="button"
        onClick={() => setIsTheater(true)}
        className={FULLSCREEN_BTN_CLASS}
        title="全屏播放"
        aria-label="全屏播放"
      >
        <Icon name="expand" className="w-5 h-5" />
      </button>
    </div>
  );
}
