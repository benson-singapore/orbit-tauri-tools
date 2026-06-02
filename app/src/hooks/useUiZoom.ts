import { useCallback, useEffect, useRef, useState } from "react";
import {
  UI_ZOOM_DEFAULT,
  UI_ZOOM_STEP,
  applyUiZoom,
  isUiZoomShortcut,
  readStoredUiZoom,
  uiZoomActionFromKeyboard,
} from "@/lib/uiZoom";

export function useUiZoom() {
  const [zoom, setZoom] = useState(UI_ZOOM_DEFAULT);
  const zoomRef = useRef(UI_ZOOM_DEFAULT);

  const setLevel = useCallback(async (next: number) => {
    const applied = await applyUiZoom(next);
    zoomRef.current = applied;
    setZoom(applied);
  }, []);

  const zoomIn = useCallback(() => {
    void setLevel(zoomRef.current + UI_ZOOM_STEP);
  }, [setLevel]);

  const zoomOut = useCallback(() => {
    void setLevel(zoomRef.current - UI_ZOOM_STEP);
  }, [setLevel]);

  const zoomReset = useCallback(() => {
    void setLevel(UI_ZOOM_DEFAULT);
  }, [setLevel]);

  useEffect(() => {
    const stored = readStoredUiZoom();
    zoomRef.current = stored;
    setZoom(stored);
    void applyUiZoom(stored);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isUiZoomShortcut(event)) return;

      const action = uiZoomActionFromKeyboard(event);
      if (!action) return;

      event.preventDefault();

      if (action === "in") zoomIn();
      else if (action === "out") zoomOut();
      else zoomReset();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomIn, zoomOut, zoomReset]);

  return { zoom, zoomIn, zoomOut, zoomReset };
}
