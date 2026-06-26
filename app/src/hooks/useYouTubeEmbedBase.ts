import { useEffect, useState } from "react";
import { isTauriRuntime } from "@/lib/appInfo";
import { getCachedRuntimeBaseUrl, waitForRuntimeReady } from "@/lib/runtime";
import { resolveRuntimeBaseForEmbed, verifyYouTubeRuntimePlayback } from "@/lib/youtube";

type EmbedBaseState =
  | { status: "loading" }
  | { status: "ready"; base: string }
  | { status: "unsupported"; message: string };

function expectsRuntimeEmbed(): boolean {
  return Boolean(import.meta.env.VITE_ORBIT_RUNTIME_URL) || isTauriRuntime();
}

export function useYouTubeEmbedBase(runtimeBase?: string | null): EmbedBaseState {
  const [state, setState] = useState<EmbedBaseState>(() => {
    const immediate = resolveRuntimeBaseForEmbed(runtimeBase);
    if (immediate) {
      return { status: "ready", base: immediate };
    }
    if (expectsRuntimeEmbed()) {
      return { status: "loading" };
    }
    return { status: "ready", base: "" };
  });

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const immediate = resolveRuntimeBaseForEmbed(runtimeBase);
      if (immediate) {
        const supported = await verifyYouTubeRuntimePlayback(immediate);
        if (cancelled) return;
        if (supported) {
          setState({ status: "ready", base: immediate });
          return;
        }
        setState({
          status: "unsupported",
          message: "Runtime 版本过旧，请重启 Go 服务（make dev-go）后再试。",
        });
        return;
      }

      if (!expectsRuntimeEmbed()) {
        if (!cancelled) {
          setState({ status: "ready", base: "" });
        }
        return;
      }

      if (!cancelled) {
        setState({ status: "loading" });
      }

      const url = (await waitForRuntimeReady()).replace(/\/$/, "");
      if (cancelled) return;

      const supported = await verifyYouTubeRuntimePlayback(url);
      if (cancelled) return;
      if (!supported) {
        setState({
          status: "unsupported",
          message: "Runtime 版本过旧，请重启 Go 服务（make dev-go）后再试。",
        });
        return;
      }
      setState({ status: "ready", base: url });
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [runtimeBase]);

  return state;
}

export function shouldUseRuntimeEmbed(base: string): boolean {
  return Boolean(base.trim());
}

export function readImmediateEmbedBase(runtimeBase?: string | null): string | null {
  return resolveRuntimeBaseForEmbed(runtimeBase) ?? getCachedRuntimeBaseUrl();
}
