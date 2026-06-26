import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { Icon } from "@/components/Icon";
import { isDarkTheme } from "@/lib/themeMode";
import {
  COMIC_PAGE_WIDTH_MAX,
  COMIC_PAGE_WIDTH_MIN,
  COMIC_PAGE_WIDTH_STEP,
  clampComicPageWidth,
} from "@/lib/comicPageWidth";
import type { ThemeMode } from "@/types";

interface ComicPageWidthSliderProps {
  theme: ThemeMode;
  value: number;
  onChange: (width: number) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

export function ComicPageWidthSlider({
  theme,
  value,
  onChange,
  className = "",
  title = "调节漫画页宽",
  ariaLabel = "漫画页宽",
}: ComicPageWidthSliderProps) {
  const isDark = isDarkTheme(theme);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const showTooltip = dragging || hovering;

  const clamped = clampComicPageWidth(value);
  const fillPercent =
    ((clamped - COMIC_PAGE_WIDTH_MIN) / (COMIC_PAGE_WIDTH_MAX - COMIC_PAGE_WIDTH_MIN)) * 100;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(clampComicPageWidth(Number.parseFloat(event.target.value)));
    },
    [onChange],
  );

  return (
    <div
      className={`flex items-center gap-1.5 shrink-0 ${className}`}
      title={title}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Icon
        name="collapse"
        className={`w-3 h-3 shrink-0 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
        aria-hidden
      />

      <div ref={trackRef} className="relative w-[88px] sm:w-[104px] h-5 flex items-center">
        <div
          className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none ${
            isDark ? "bg-neutral-700" : "bg-neutral-200"
          }`}
        />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-indigo-500 pointer-events-none"
          style={{ width: `${fillPercent}%` }}
        />
        <input
          type="range"
          min={COMIC_PAGE_WIDTH_MIN}
          max={COMIC_PAGE_WIDTH_MAX}
          step={COMIC_PAGE_WIDTH_STEP}
          value={clamped}
          onChange={handleChange}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onBlur={() => setDragging(false)}
          aria-label={ariaLabel}
          aria-valuemin={COMIC_PAGE_WIDTH_MIN}
          aria-valuemax={COMIC_PAGE_WIDTH_MAX}
          aria-valuenow={clamped}
          aria-valuetext={`${clamped}%`}
          className="comic-page-width-slider absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent"
        />
        {showTooltip ? (
          <div
            className="absolute -bottom-7 z-20 pointer-events-none -translate-x-1/2"
            style={{ left: `${fillPercent}%` }}
          >
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums whitespace-nowrap ${
                isDark ? "bg-neutral-800 text-neutral-100" : "bg-neutral-900 text-white"
              }`}
            >
              {clamped}%
            </span>
          </div>
        ) : null}
      </div>

      <Icon
        name="maximize"
        className={`w-3 h-3 shrink-0 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
        aria-hidden
      />
    </div>
  );
}
