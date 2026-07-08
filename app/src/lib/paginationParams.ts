import type { Article, ChannelCapabilities, PaginationFeature, PluginChannel } from "@/types";

function defaultPaginationParam(style: PaginationFeature["style"]): string {
  return style === "lastId" ? "lastId" : "page";
}

function carryParamKeys(pagination: PaginationFeature): string[] {
  return pagination.carryParams?.map(key => key.trim()).filter(Boolean) ?? [];
}

/** Merge plugin `next` into channel params for load-more (page + carryParams like seenIds). */
export function mergePaginationNextParams(
  channelParams: Record<string, string> | undefined,
  nextParams: Record<string, string>,
  pagination: PaginationFeature,
): Record<string, string> {
  const param = pagination.param?.trim() || defaultPaginationParam(pagination.style);
  const carryKeys = new Set(carryParamKeys(pagination));
  const params: Record<string, string> = { ...(channelParams ?? {}) };

  for (const [key, value] of Object.entries(nextParams)) {
    if (carryKeys.has(key)) {
      params[key] = value ?? "";
    } else if (value.trim()) {
      params[key] = value.trim();
    }
  }

  const page = nextParams[param]?.trim();
  if (page) {
    params[param] = page;
  }

  return params;
}

/** Reset pagination + carryParams (e.g. seenIds) for refresh / first page. */
export function buildFeedRefreshParams(options: {
  pagination: PaginationFeature;
  channelParams?: Record<string, string>;
}): Record<string, string> {
  const { pagination, channelParams } = options;
  const param = pagination.param?.trim() || defaultPaginationParam(pagination.style);
  const params: Record<string, string> = { ...(channelParams ?? {}) };
  params[param] = pagination.default?.trim() || (pagination.style === "lastId" ? "" : "1");
  for (const key of carryParamKeys(pagination)) {
    params[key] = channelParams?.[key] ?? "";
  }
  return params;
}

/** Mirrors runtime extractThirdPartyFeedID for WASM list items. */
export function extractArticleNativeId(
  article: Pick<Article, "id" | "pluginId" | "channelId">,
): string {
  const rawId = article.id?.trim() ?? "";
  if (!rawId) return "";

  const pluginId = article.pluginId?.trim() ?? "";
  if (!pluginId) return rawId;

  const prefix = `${pluginId}:`;
  if (!rawId.startsWith(prefix)) {
    // rowToFeedItem strips storage IDs before sending items to the client.
    return rawId;
  }
  let rest = rawId.slice(prefix.length);
  if (!rest) return "";

  const channelId = article.channelId?.trim() ?? "";
  if (channelId) {
    const channelPrefix = `${channelId}:`;
    if (rest.startsWith(channelPrefix)) {
      rest = rest.slice(channelPrefix.length).trim();
    }
  }

  if (!rest) return "";
  if (rest.includes(":") && rest.includes("/")) {
    const idx = rest.lastIndexOf(":");
    if (idx >= 0 && idx < rest.length - 1) {
      return rest.slice(idx + 1).trim();
    }
  }
  return rest;
}

function mergeCarryParamsFromNext(
  params: Record<string, string>,
  pagination: PaginationFeature,
  nextParams?: Record<string, string> | null,
): void {
  if (!nextParams) return;
  for (const key of carryParamKeys(pagination)) {
    if (key in nextParams) {
      params[key] = nextParams[key] ?? "";
    }
  }
}

/** Check if nextParams contains any meaningful pagination data (page param or carry params). */
function hasValidPaginationNext(
  nextParams: Record<string, string> | null | undefined,
  pagination: PaginationFeature,
): boolean {
  if (!nextParams) return false;
  const param = pagination.param?.trim() || defaultPaginationParam(pagination.style);
  const explicitPage = nextParams[param]?.trim();
  const hasCarry = carryParamKeys(pagination).some(key => key in nextParams);
  return Boolean(explicitPage) || hasCarry;
}

export function buildFeedLoadMoreParams(options: {
  pagination: PaginationFeature;
  articles: Article[];
  pageSize: number;
  channelParams?: Record<string, string>;
  nextParams?: Record<string, string> | null;
}): Record<string, string> {
  const {
    pagination,
    articles,
    pageSize,
    channelParams,
    nextParams,
  } = options;

  const param = pagination.param?.trim() || defaultPaginationParam(pagination.style);
  const sizeParam = pagination.sizeParam?.trim();
  const defaultSize = pagination.defaultSize ?? pageSize;

  // Prioritize nextParams if it contains valid pagination data (page or carry params like seenIds)
  if (hasValidPaginationNext(nextParams, pagination)) {
    const merged = mergePaginationNextParams(channelParams, nextParams, pagination);
    if (sizeParam && !merged[sizeParam]?.trim()) {
      merged[sizeParam] = String(defaultSize);
    }
    return merged;
  }

  const params: Record<string, string> = { ...(channelParams ?? {}) };

  switch (pagination.style) {
    case "lastId": {
      const last = articles[articles.length - 1];
      if (!last) {
        throw new Error("列表为空，无法继续加载");
      }
      const nativeId = extractArticleNativeId(last);
      if (!nativeId) {
        throw new Error("无法解析最后一条记录的 ID");
      }
      params[param] = nativeId;
      break;
    }
    case "cursor": {
      if (nextParams) {
        for (const [key, value] of Object.entries(nextParams)) {
          if (value.trim()) {
            params[key] = value.trim();
          }
        }
        mergeCarryParamsFromNext(params, pagination, nextParams);
        if (params[param]?.trim()) {
          break;
        }
      }
      throw new Error("缺少分页游标，请刷新后重试");
    }
    case "offset": {
      const loadedPages = Math.max(1, Math.floor(articles.length / pageSize));
      params[param] = String(loadedPages + 1);
      mergeCarryParamsFromNext(params, pagination, nextParams);
      break;
    }
    default:
      throw new Error(`不支持的分页类型: ${pagination.style}`);
  }

  if (sizeParam) {
    params[sizeParam] = String(defaultSize);
  }

  return params;
}

export function buildSearchLoadMoreParams(options: {
  pagination?: PaginationFeature | null;
  articles: Article[];
  pageSize: number;
  query: string;
  searchParam?: string;
  channelParams?: Record<string, string>;
  nextParams?: Record<string, string> | null;
}): Record<string, string> {
  const searchKey = options.searchParam?.trim() || "query";
  const params = options.pagination
    ? buildFeedLoadMoreParams({
        pagination: options.pagination,
        articles: options.articles,
        pageSize: options.pageSize,
        channelParams: options.channelParams,
        nextParams: options.nextParams,
      })
    : {
        ...(options.channelParams ?? {}),
        page: String(Math.max(1, Math.floor(options.articles.length / options.pageSize)) + 1),
      };
  params[searchKey] = options.query;
  return params;
}

export function channelSupportsLoadMore(
  cap: Pick<ChannelCapabilities, "canLoadMore">,
  channel?: Pick<PluginChannel, "features"> | null,
): boolean {
  return cap.canLoadMore || Boolean(channel?.features?.pagination);
}

/** Paginated feeds default to showing load-more until the API returns an empty page. */
export function resolveFeedHasMore(options: {
  append: boolean;
  items: Article[];
  apiHasMore?: boolean;
  paginated: boolean;
  paginationExhausted: boolean;
}): boolean {
  const { append, items, apiHasMore, paginated, paginationExhausted } = options;
  if (append && items.length === 0) {
    return false;
  }
  if (!paginated) {
    return Boolean(apiHasMore);
  }
  if (paginationExhausted) {
    return false;
  }
  if (append) {
    return apiHasMore ?? true;
  }
  return true;
}
