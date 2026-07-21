import type { MouseEvent } from "react";
import { Icon } from "@/components/Icon";

interface FavoriteHeartButtonProps {
  favorited: boolean;
  onToggle: (event: MouseEvent) => void;
  className?: string;
  iconClassName?: string;
  title?: string;
}

export function FavoriteHeartButton({
  favorited,
  onToggle,
  className = "",
  iconClassName = "w-3.5 h-3.5",
  title,
}: FavoriteHeartButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={className}
      title={title ?? (favorited ? "取消收藏" : "收藏")}
      aria-label={title ?? (favorited ? "取消收藏" : "收藏")}
      aria-pressed={favorited}
    >
      <Icon
        name={favorited ? "heart" : "heart-outline"}
        className={`${iconClassName} ${favorited ? "text-rose-500" : ""}`}
      />
    </button>
  );
}
