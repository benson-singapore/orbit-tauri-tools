import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { verifyExperienceModePassword } from "@/lib/experienceMode";
import { isDarkTheme } from "@/lib/themeMode";
import type { ThemeMode } from "@/types";

interface ExperienceModeUnlockModalProps {
  theme: ThemeMode;
  onClose: () => void;
  onUnlock: () => void;
}

export function ExperienceModeUnlockModal({
  theme,
  onClose,
  onUnlock,
}: ExperienceModeUnlockModalProps) {
  const isDark = isDarkTheme(theme);
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (verifyExperienceModePassword(password)) {
      onUnlock();
      return;
    }
    setError("密码错误，请重试");
    setPassword("");
    inputRef.current?.focus();
  };

  return createPortal(
    <div data-theme={theme} className={isDark ? "dark" : undefined}>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          aria-label="关闭"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="experience-mode-unlock-title"
          className={`relative w-full max-w-sm rounded-2xl border shadow-2xl ${
            isDark
              ? "border-neutral-800 bg-[#141416] text-white"
              : "border-neutral-200 bg-white text-neutral-900"
          }`}
        >
          <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${
            isDark ? "border-neutral-800" : "border-neutral-100"
          }`}>
            <div>
              <h2 id="experience-mode-unlock-title" className="text-sm font-semibold">
                切换到完整级
              </h2>
              <p className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                输入密码以解锁 18+ 插件与完整功能
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg p-1.5 transition-colors ${
                isDark
                  ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                  : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              }`}
              aria-label="关闭"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-5">
            <label
              htmlFor="experience-mode-password"
              className={`mb-2 block text-xs font-medium ${
                isDark ? "text-neutral-400" : "text-neutral-500"
              }`}
            >
              密码
            </label>
            <input
              ref={inputRef}
              id="experience-mode-password"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={password}
              onChange={event => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
              placeholder="请输入密码"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${
                isDark
                  ? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-600 focus:border-indigo-500"
                  : "border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500"
              }`}
            />
            {error ? (
              <p className="mt-2 text-xs text-rose-500">{error}</p>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                  isDark
                    ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                }`}
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#5856D6] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4a48c4]"
              >
                解锁
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
