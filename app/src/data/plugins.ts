import type { Plugin } from "@/types";

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
    name: "The Verge",
    icon: "text",
    active: true,
    desc: "科技前沿与深度评测报告",
    logoText: "V",
    color: "bg-cyan-500",
  },
  {
    id: "polygon",
    name: "Polygon",
    icon: "text",
    active: true,
    desc: "硬核游戏文化与行业动态评述",
    logoText: "P",
    color: "bg-rose-500",
  },
  {
    id: "youtube",
    name: "YouTube Tech",
    icon: "video",
    active: true,
    desc: "视频类新闻、博主产品深度测评",
    logoText: "Y",
    color: "bg-red-500",
  },
  {
    id: "spotify",
    name: "Spotify Podcast",
    icon: "audio",
    active: true,
    desc: "极客、科技领袖播客音频访谈",
    logoText: "S",
    color: "bg-emerald-500",
  },
  {
    id: "unsplash",
    name: "Unsplash Daily",
    icon: "image",
    active: true,
    desc: "精选全球高质量视觉建筑与艺术设计",
    logoText: "U",
    color: "bg-neutral-800",
  },
];

export const PLUGINS_STORE: Plugin[] = [
  {
    id: "wired",
    name: "WIRED 连线",
    icon: "text",
    desc: "关注科技、人文、科学对社会和文化的深远改变。",
    logoText: "W",
    color: "bg-black",
  },
  {
    id: "bilibili",
    name: "Bilibili 科技",
    icon: "video",
    desc: "国内极客原创、软硬件拆机深度测评视频。",
    logoText: "B",
    color: "bg-sky-400",
  },
  {
    id: "audible",
    name: "Audible Books",
    icon: "audio",
    desc: "精选畅销科技新书有声书伴读。",
    logoText: "A",
    color: "bg-amber-600",
  },
];
