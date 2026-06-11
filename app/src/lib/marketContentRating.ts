import type { MarketPluginContentRating } from "@/types";

const STORAGE_KEY = "orbit.marketContentRating";
export const MARKET_CONTENT_RATING_DEFAULT: MarketPluginContentRating = "under18";

const VALID_RATINGS = new Set<MarketPluginContentRating>(["general", "under18", "mature"]);

export function readStoredMarketContentRating(): MarketPluginContentRating {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_RATINGS.has(raw as MarketPluginContentRating)) {
      return raw as MarketPluginContentRating;
    }
  } catch {
    // ignore
  }
  return MARKET_CONTENT_RATING_DEFAULT;
}

export function persistMarketContentRating(rating: MarketPluginContentRating): void {
  try {
    localStorage.setItem(STORAGE_KEY, rating);
  } catch {
    // ignore quota / private mode
  }
}

export const MARKET_CONTENT_RATING_LABELS: Record<MarketPluginContentRating, string> = {
  general: "全年龄",
  under18: "18岁以下",
  mature: "18+",
};
