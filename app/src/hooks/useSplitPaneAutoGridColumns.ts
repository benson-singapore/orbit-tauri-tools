import { useEffect, useRef, type RefObject } from "react";
import {
  resolveAutoGridColumnCount,
  type GridColumnCount,
} from "@/lib/gridColumnCount";

export function useSplitPaneAutoGridColumns(
  paneRef: RefObject<HTMLElement | null>,
  onColumnCountChange: (count: GridColumnCount) => void,
  enabled = true,
) {
  const onChangeRef = useRef(onColumnCountChange);
  onChangeRef.current = onColumnCountChange;

  useEffect(() => {
    if (!enabled) return;

    const el = paneRef.current;
    if (!el) return;

    let lastAutoCount: GridColumnCount | null = null;

    const syncAutoColumns = () => {
      const next = resolveAutoGridColumnCount(el.clientWidth);
      if (next === lastAutoCount) return;
      lastAutoCount = next;
      onChangeRef.current(next);
    };

    syncAutoColumns();
    const observer = new ResizeObserver(syncAutoColumns);
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, paneRef]);
}
