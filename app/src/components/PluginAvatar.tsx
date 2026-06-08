import type { Plugin } from "@/types";

type PluginAvatarSource = Pick<Plugin, "name" | "color" | "iconUrl" | "logoImageUrl">;

/** manifest.meta.iconUrl 优先；兼容仅配置 logoImageUrl 的旧插件 */
export function getPluginIconUrl(plugin: PluginAvatarSource): string {
  return (plugin.iconUrl?.trim() || plugin.logoImageUrl?.trim() || "");
}

export function PluginAvatar({
  plugin,
  className = "w-10 h-10 rounded-xl",
  textClassName = "text-xs",
}: {
  plugin: PluginAvatarSource;
  className?: string;
  textClassName?: string;
}) {
  const iconUrl = getPluginIconUrl(plugin);
  const letter = (plugin.name || "").trim().slice(0, 1) || "★";
  const color = plugin.color?.trim() || "#7c3aed";
  const isTailwindBg = color.startsWith("bg-");

  if (iconUrl) {
    return (
      <div className={`${className} shrink-0 overflow-hidden`}>
        <img
          src={iconUrl}
          alt=""
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      className={`${className} shrink-0 overflow-hidden flex items-center justify-center font-bold text-white ${textClassName} ${
        isTailwindBg ? color : ""
      }`}
      style={isTailwindBg ? undefined : { backgroundColor: color }}
    >
      <span>{letter}</span>
    </div>
  );
}
