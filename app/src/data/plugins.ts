import type { Plugin, PluginContentType, PluginMarketCategory } from "@/types";

export const PLUGIN_TYPE_GROUPS: { type: PluginContentType; label: string }[] = [
  { type: "text", label: "图文资讯" },
  { type: "video", label: "视频内容" },
  { type: "audio", label: "音频播客" },
  { type: "image", label: "图片视觉" },
];

export const PLUGIN_MARKET_GROUPS: {
  id: PluginMarketCategory;
  label: string;
  icon: PluginContentType | "sparkles" | "bookmark";
}[] = [
  { id: "all", label: "全部官方精选", icon: "sparkles" },
  { id: "news", label: "新闻资讯", icon: "text" },
  { id: "manga", label: "二次元漫画", icon: "image" },
  { id: "video", label: "流媒体/视频", icon: "video" },
  { id: "audio", label: "有声播客", icon: "audio" },
  { id: "blog", label: "个人博客/RSS", icon: "bookmark" },
];

const PLUGIN_CONTENT_TYPES: PluginContentType[] = [
  "text",
  "video",
  "audio",
  "image",
];

function pluginContentType(icon: string): PluginContentType {
  return PLUGIN_CONTENT_TYPES.includes(icon as PluginContentType)
    ? (icon as PluginContentType)
    : "text";
}

export function groupPluginsByType(plugins: Plugin[]): Map<PluginContentType, Plugin[]> {
  const map = new Map<PluginContentType, Plugin[]>();
  for (const group of PLUGIN_TYPE_GROUPS) {
    map.set(group.type, []);
  }
  for (const plugin of plugins) {
    map.get(pluginContentType(plugin.icon))!.push(plugin);
  }
  return map;
}

export const INITIAL_PLUGINS: Plugin[] = [
  {
    id: "all",
    name: "全部平台",
    icon: "sparkles",
    active: true,
    desc: "集成展示所有订阅内容",
    color: "bg-indigo-500",
  },
  {
    id: "verge",
    name: "TechVibe & The Verge",
    icon: "text",
    active: true,
    desc: "科技评论与前沿快讯",
    logoText: "V",
    color: "bg-cyan-500",
    marketCategory: "news",
    categoryTag: "NEWS",
    official: true,
  },
  {
    id: "polygon",
    name: "漫画极客仓",
    icon: "image",
    active: true,
    desc: "畅享全球轻度条漫和二次元黑白画集",
    logoText: "M",
    color: "bg-rose-500",
    marketCategory: "manga",
    categoryTag: "MANGA",
    official: true,
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    icon: "video",
    active: true,
    desc: "高画质流媒体与硬核科技视频流",
    logoText: "Y",
    color: "bg-red-500",
    marketCategory: "video",
    categoryTag: "VIDEO",
    official: true,
  },
  {
    id: "spotify",
    name: "Spotify Podcast",
    icon: "audio",
    active: true,
    desc: "创投、独立开发者播客访谈有声频道",
    logoText: "S",
    color: "bg-emerald-500",
    marketCategory: "audio",
    categoryTag: "AUDIO",
    official: true,
  },
  {
    id: "unsplash",
    name: "Unsplash Daily",
    icon: "image",
    active: true,
    desc: "精选全球高质量视觉建筑与艺术设计",
    logoText: "U",
    color: "bg-neutral-800",
    marketCategory: "blog",
    categoryTag: "BLOG",
    official: true,
  },
];

export const PLUGINS_STORE: Plugin[] = [
  {
    id: "wired",
    name: "WIRED 连线专栏",
    icon: "text",
    desc: "关注科技、人文、科学对社会和文化的深远改变。",
    logoText: "W",
    color: "bg-black",
    marketCategory: "news",
    categoryTag: "NEWS",
    official: true,
  },
  {
    id: "bilibili",
    name: "Bilibili 科技区聚合",
    icon: "video",
    desc: "国内极客原创、软硬件拆机深度测评视频。",
    logoText: "B",
    color: "bg-sky-400",
    marketCategory: "video",
    categoryTag: "VIDEO",
    official: true,
  },
  {
    id: "techcrunch",
    name: "TechCrunch & TechNode",
    icon: "text",
    desc: "硅谷创投快讯与国内硬核科技创业分析。",
    logoText: "T",
    color: "bg-orange-500",
    marketCategory: "news",
    categoryTag: "NEWS",
    official: true,
  },
  {
    id: "manga-geek",
    name: "漫画极客仓",
    icon: "image",
    desc: "畅享全球轻度条漫和二次元黑白画集。",
    logoText: "M",
    color: "bg-rose-500",
    marketCategory: "manga",
    categoryTag: "MANGA",
    official: true,
  },
  {
    id: "spotify-feed",
    name: "Spotify Feed",
    icon: "audio",
    desc: "创投、独立开发者播客访谈有声频道。",
    logoText: "S",
    color: "bg-emerald-600",
    marketCategory: "audio",
    categoryTag: "AUDIO",
    official: true,
  },
  {
    id: "rss-hub",
    name: "RSSHub 精选",
    icon: "text",
    desc: "聚合个人博客、专栏与独立创作者订阅源。",
    logoText: "R",
    color: "bg-violet-500",
    marketCategory: "blog",
    categoryTag: "BLOG",
    official: true,
  },
];
