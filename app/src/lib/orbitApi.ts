import type {
  DictItem,
  DictListResponse,
  MarketPluginItem,
  MarketPluginSort,
  MarketPluginsResponse,
  Plugin,
} from "@/types";

function orbitApiBaseUrl(): string {
  const url = import.meta.env.VITE_ORBIT_API_URL;
  if (typeof url === "string" && url.length > 0) {
    return url.replace(/\/$/, "");
  }
  return "https://orbit-api.benson.indevs.in/api";
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function fetchPluginTypeDicts(): Promise<DictItem[]> {
  const base = orbitApiBaseUrl();
  const res = await fetch(`${base}/v1/dicts/plugins_type`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const body = (await res.json()) as DictListResponse;
  if (body.code !== 200 || !Array.isArray(body.data)) {
    throw new Error(body.message ?? "invalid dict response");
  }
  return body.data
    .filter(item => item.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

type MarketPluginLongDescLocale = {
  title?: string;
  description?: string;
  tags?: string;
};

type MarketPluginLongDesc = {
  zh?: MarketPluginLongDescLocale;
  en?: MarketPluginLongDescLocale;
};

export function parseMarketPluginZhTags(longDesc?: string): string[] {
  if (!longDesc?.trim()) {
    return [];
  }
  try {
    const data = JSON.parse(longDesc) as MarketPluginLongDesc;
    const tags = data.zh?.tags;
    if (!tags?.trim()) {
      return [];
    }
    return tags
      .split(",")
      .map(tag => tag.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function marketItemToPlugin(item: MarketPluginItem): Plugin {
  const color = item.colorClass?.trim() || item.accentColor || "#7c3aed";
  return {
    id: item.id,
    name: item.name,
    icon: item.icon ?? "puzzle",
    desc: item.desc,
    color,
    logoImageUrl: item.logoUrl,
    categoryTag: item.tag,
    marketCategory: String(item.categoryId),
    official: true,
  };
}

export async function fetchMarketPlugins(options?: {
  category?: string;
  sort?: MarketPluginSort;
  search?: string;
  pageSize?: number;
  page?: number;
}): Promise<{ items: MarketPluginItem[]; total: number }> {
  const base = orbitApiBaseUrl();
  const params = new URLSearchParams();
  if (options?.category && options.category !== "all") {
    params.set("category", options.category);
  }
  if (options?.sort) {
    params.set("sort", options.sort);
  }
  if (options?.search?.trim()) {
    params.set("search", options.search.trim());
  }
  params.set("pageSize", String(options?.pageSize ?? 50));
  if (options?.page && options.page > 0) {
    params.set("page", String(options.page));
  }
  const qs = params.toString();
  const res = await fetch(`${base}/v1/plugins${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const body = (await res.json()) as MarketPluginsResponse;
  if (body.code !== 200 || !body.data || !Array.isArray(body.data.items)) {
    throw new Error(body.message ?? "invalid plugins response");
  }
  return {
    items: body.data.items,
    total: body.data.total ?? body.data.items.length,
  };
}
