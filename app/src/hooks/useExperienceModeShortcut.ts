import { useCallback, useEffect, useState } from "react";
import {
  FULL_EXPERIENCE_ENABLED,
  isExperienceModeShortcut,
  type ExperienceMode,
} from "@/lib/experienceMode";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

interface UseExperienceModeShortcutOptions {
  experienceMode: ExperienceMode;
  onLock: () => void;
  onRequestUnlock: () => void;
}

export function useExperienceModeShortcut({
  experienceMode,
  onLock,
  onRequestUnlock,
}: UseExperienceModeShortcutOptions) {
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const closeUnlockModal = useCallback(() => {
    setUnlockModalOpen(false);
  }, []);

  const openUnlockModal = useCallback(() => {
    setUnlockModalOpen(true);
  }, []);

  useEffect(() => {
    if (!FULL_EXPERIENCE_ENABLED) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isExperienceModeShortcut(event)) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();

      if (experienceMode === "full") {
        closeUnlockModal();
        onLock();
        return;
      }

      openUnlockModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeUnlockModal, experienceMode, onLock, openUnlockModal]);

  const handleUnlock = useCallback(() => {
    closeUnlockModal();
    onRequestUnlock();
  }, [closeUnlockModal, onRequestUnlock]);

  return {
    unlockModalOpen,
    closeUnlockModal,
    handleUnlock,
  };
}
