import { useEffect, useState } from "react";
import { loadAppInfo } from "@/lib/appInfo";
import {
  checkAppUpdate,
  resolveCurrentPlatformInfo,
  type AppUpdateSummary,
} from "@/lib/appUpdates";

const INITIAL_SUMMARY: AppUpdateSummary = {
  updateAvailable: false,
  loading: true,
  platformId: null,
  latestVersion: null,
  channel: null,
  error: null,
};

export function useAppUpdateSummary() {
  const [summary, setSummary] = useState<AppUpdateSummary>(INITIAL_SUMMARY);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSummary(prev => ({ ...prev, loading: true, error: null }));
      try {
        const [info, platform] = await Promise.all([
          loadAppInfo(),
          resolveCurrentPlatformInfo(),
        ]);
        const update = await checkAppUpdate(info.version, platform.id);
        if (cancelled) return;
        setSummary({
          updateAvailable: update.updateAvailable,
          loading: false,
          platformId: platform.id,
          latestVersion: update.latest?.appVersion ?? null,
          channel: update.channel,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setSummary(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return [summary, setSummary] as const;
}
