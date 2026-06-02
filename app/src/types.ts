export type ContentType = "text" | "video" | "audio" | "image";

export type ThemeMode = "light" | "dark";

export type ActiveTab = "today" | "bookmarks" | "trending" | "all";
export type CategoryFilter = "all" | ContentType;

export interface Article {
  id: number;
  title: string;
  summary: string;
  content: string;
  type: ContentType;
  pluginId: string;
  pluginName: string;
  author: string;
  time: string;
  reads: string;
  image?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioDuration?: string;
  galleryImages?: string[];
  tags: string[];
  isBookmarked: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  icon: string;
  active?: boolean;
  desc: string;
  logoText?: string;
  color: string;
}

export interface RuntimeStatusResponse {
  ok: boolean;
  runtime: string;
  db: string;
  sqlite_path: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
}
