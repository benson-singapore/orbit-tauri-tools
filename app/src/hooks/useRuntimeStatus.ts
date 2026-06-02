import { useCallback, useEffect, useState } from "react";
import { loadRuntimeStatus } from "@/lib/runtime";
import type { HealthResponse, RuntimeStatusResponse } from "@/types";

export type RuntimeConnectionState = "loading" | "ok" | "error";

export function useRuntimeStatus() {
  const [state, setState] = useState<RuntimeConnectionState>("loading");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<RuntimeStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await loadRuntimeStatus();
      setHealth(result.health);
      setStatus(result.status);
      setState(result.status.ok ? "ok" : "error");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, health, status, error, refresh };
}
