import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type VideoSessionMountKind = "modal" | "wall";

interface VideoSessionMountContextValue {
  active: boolean;
  parkingLot: HTMLDivElement | null;
  registerMount: (
    sessionId: string,
    kind: VideoSessionMountKind,
    element: HTMLDivElement | null,
  ) => void;
  getMount: (sessionId: string, kind: VideoSessionMountKind) => HTMLDivElement | null;
  mountVersion: number;
}

const VideoSessionMountContext = createContext<VideoSessionMountContextValue | null>(null);

export function VideoSessionMountProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const modalMountsRef = useRef(new Map<string, HTMLDivElement>());
  const wallMountsRef = useRef(new Map<string, HTMLDivElement>());
  const [parkingLot, setParkingLot] = useState<HTMLDivElement | null>(null);
  const [mountVersion, setMountVersion] = useState(0);

  const registerMount = useCallback((
    sessionId: string,
    kind: VideoSessionMountKind,
    element: HTMLDivElement | null,
  ) => {
    if (!active && kind === "wall") return;

    const store = kind === "wall" ? wallMountsRef : modalMountsRef;
    const current = store.current.get(sessionId) ?? null;
    if (current === element) return;

    if (element) {
      store.current.set(sessionId, element);
    } else {
      store.current.delete(sessionId);
    }
    setMountVersion(version => version + 1);
  }, [active]);

  const getMount = useCallback((sessionId: string, kind: VideoSessionMountKind) => {
    const store = kind === "wall" ? wallMountsRef : modalMountsRef;
    return store.current.get(sessionId) ?? null;
  }, []);

  useEffect(() => {
    if (active) return;
    wallMountsRef.current.clear();
    setMountVersion(version => version + 1);
  }, [active]);

  const value = useMemo(
    () => ({
      active,
      parkingLot,
      registerMount,
      getMount,
      mountVersion,
    }),
    [active, parkingLot, registerMount, getMount, mountVersion],
  );

  return (
    <VideoSessionMountContext.Provider value={value}>
      <div
        ref={setParkingLot}
        className="fixed -left-[9999px] top-0 w-[640px] h-[360px] overflow-hidden opacity-0 pointer-events-none"
        aria-hidden
      />
      {children}
    </VideoSessionMountContext.Provider>
  );
}

export function useVideoParkingLot(): HTMLDivElement | null {
  const context = useContext(VideoSessionMountContext);
  return context?.parkingLot ?? null;
}

export function useVideoSessionMountRegistry() {
  const context = useContext(VideoSessionMountContext);
  if (!context) {
    throw new Error("useVideoSessionMountRegistry requires VideoSessionMountProvider");
  }
  return context;
}

/** @deprecated Use VideoSessionMountProvider */
export const VideoWallMountProvider = VideoSessionMountProvider;

export function useVideoSessionMount(
  sessionId: string,
  kind: VideoSessionMountKind,
  enabled: boolean,
): HTMLDivElement | null {
  const context = useContext(VideoSessionMountContext);
  if (!context || !enabled) return null;
  if (kind === "wall" && !context.active) return null;

  const { getMount, mountVersion } = context;
  void mountVersion;
  return getMount(sessionId, kind);
}
