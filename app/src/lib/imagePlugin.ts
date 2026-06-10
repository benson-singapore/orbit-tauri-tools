import type { Plugin } from "@/types";

export {
  isBrowseDynamicFeedMode,
  isBrowseDynamicPlugin,
  resolveBrowseDynamicChannel,
} from "@/lib/browseDynamicFeed";

export function isImageGalleryPlugin(plugin?: Plugin | null): boolean {
  return plugin?.mediaType === "image";
}

/** @deprecated 使用 isBrowseDynamicFeedMode */
export { isBrowseDynamicFeedMode as isImageDynamicFeedMode } from "@/lib/browseDynamicFeed";

/** @deprecated 使用 resolveBrowseDynamicChannel */
export { resolveBrowseDynamicChannel as resolveImageGalleryChannel } from "@/lib/browseDynamicFeed";
