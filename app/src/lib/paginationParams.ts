import type { Article, ChannelCapabilities, PaginationFeature, PluginChannel } from "@/types";

function defaultPaginationParam(style: PaginationFeature["style"]): string {
  return style === "lastId" ? "lastId" : "page";
}

/** Mirrors runtime extractThirdPartyFeedID for WASM list items. */
export function extractArticleNativeId(
  article: Pick<Article, "id" | "pluginId" | "channelId">,
): string {
  const pluginId = article.pluginId?.trim() ?? "";
  if (!pluginId) return "";
  const prefix = `${pluginId}:`;
  if (!article.id.startsWith(prefix)) return "";
  let rest = article.id.slice(prefix.length);
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
  const params: Record<string, string> = { ...(channelParams ?? {}) };

  if (nextParams) {
    const explicit = nextParams[param]?.trim();
    if (explicit) {
      for (const [key, value] of Object.entries(nextParams)) {
        if (value.trim()) {
          params[key] = value.trim();
        }
      }
      return params;
    }
  }

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
    case "cursor":
    case "offset": {
      const loadedPages = Math.max(1, Math.floor(articles.length / pageSize));
      params[param] = String(loadedPages + 1);
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
  if (!paginated) {
    return Boolean(apiHasMore);
  }
  if (paginationExhausted) {
    return false;
  }
  if (append) {
    return items.length > 0 && (apiHasMore ?? true);
  }
  return true;
}
