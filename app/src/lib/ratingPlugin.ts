import type { Plugin } from "@/types";

export function isRatingPlugin(plugin?: Plugin | null): boolean {
  return plugin?.mediaType === "rating";
}

const RATING_SCORE_TAG = /^评分\s*[:：]\s*([\d.]+)/;

/** 从 tags 中解析评分，如「评分: 5.8」 */
export function parseRatingScore(tags: string[]): string | null {
  for (const tag of tags) {
    const match = tag.match(RATING_SCORE_TAG);
    if (match) return match[1];
  }
  return null;
}

/** 展示用标签，排除评分字段 */
export function ratingDisplayTags(tags: string[]): string[] {
  return tags.filter(tag => !RATING_SCORE_TAG.test(tag));
}

export interface RatingSummaryMeta {
  year?: string;
  region?: string;
  genres: string[];
  director?: string;
  cast: string[];
  /** 无法按「/」分段解析时的原文 */
  fallback?: string;
}

/** 解析豆瓣类 summary，如「2026 / 韩国 / 剧情 喜剧 / 刘仁值 / 朴恩斌 车银优」 */
export function parseRatingSummary(summary: string): RatingSummaryMeta {
  const empty: RatingSummaryMeta = { genres: [], cast: [] };
  const trimmed = summary.trim();
  if (!trimmed) return empty;

  const parts = trimmed.split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length < 3 || !/^\d{4}$/.test(parts[0])) {
    return { ...empty, fallback: trimmed };
  }

  const genres = parts[2] ? parts[2].split(/\s+/).filter(Boolean) : [];
  const cast = parts[4] ? parts[4].split(/\s+/).filter(Boolean) : [];

  return {
    year: parts[0],
    region: parts[1] || undefined,
    genres,
    director: parts[3] || undefined,
    cast,
  };
}
