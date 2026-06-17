import type {
  ChannelFeatures,
  ChapterDetailFeature,
  ChaptersFeature,
  DetailFeature,
  FeedFeature,
  PaginationFeature,
  SearchFeature,
} from "@/types";

export type ChannelParamRow = {
  _key: string;
  key: string;
  value: string;
};

export function createParamRow(key = "", value = ""): ChannelParamRow {
  return {
    _key: `prm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    key,
    value,
  };
}

export function paramsFromRecord(params?: Record<string, string>): ChannelParamRow[] {
  if (!params || Object.keys(params).length === 0) return [];
  return Object.entries(params).map(([key, value]) => createParamRow(key, value));
}

export function paramsFromJsonString(raw: string): ChannelParamRow[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("params 须为 JSON 对象");
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    result[k] = String(v);
  }
  return paramsFromRecord(result);
}

export function paramsToRecord(rows: ChannelParamRow[]): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    result[key] = row.value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export type PaginationForm = {
  style: PaginationFeature["style"];
  param: string;
  defaultValue: string;
  idFrom: string;
  sizeParam: string;
  defaultSize: string;
};

export type ChapterDetailForm = {
  route: string;
  idParam: string;
  idFrom: string;
  parentParam: string;
  parentFrom: string;
  persist: boolean;
};

export type ChaptersForm = {
  route: string;
  idParam: string;
  idFrom: string;
  label: string;
  itemLabel: string;
  persist: boolean;
  limit: string;
  paginationEnabled: boolean;
  pagination: PaginationForm;
  detailEnabled: boolean;
  detail: ChapterDetailForm;
};

export type ChannelFeaturesForm = {
  feedCustomized: boolean;
  feedPersist: boolean;
  feedRefresh: boolean;
  feedLimit: string;

  paginationEnabled: boolean;
  pagination: PaginationForm;

  searchEnabled: boolean;
  searchParam: string;
  searchRequired: boolean;

  detailEnabled: boolean;
  detailRoute: string;
  detailIdParam: string;
  detailIdFrom: string;
  detailPersist: boolean;

  chaptersEnabled: boolean;
  chapters: ChaptersForm;
};

const DEFAULT_PAGINATION_FORM = (): PaginationForm => ({
  style: "offset",
  param: "",
  defaultValue: "",
  idFrom: "",
  sizeParam: "",
  defaultSize: "",
});

const DEFAULT_CHAPTER_DETAIL_FORM = (): ChapterDetailForm => ({
  route: "",
  idParam: "",
  idFrom: "",
  parentParam: "",
  parentFrom: "",
  persist: true,
});

const DEFAULT_CHAPTERS_FORM = (): ChaptersForm => ({
  route: "",
  idParam: "",
  idFrom: "",
  label: "",
  itemLabel: "",
  persist: true,
  limit: "",
  paginationEnabled: false,
  pagination: DEFAULT_PAGINATION_FORM(),
  detailEnabled: false,
  detail: DEFAULT_CHAPTER_DETAIL_FORM(),
});

export function createDefaultFeaturesForm(): ChannelFeaturesForm {
  return {
    feedCustomized: false,
    feedPersist: true,
    feedRefresh: true,
    feedLimit: "100",
    paginationEnabled: false,
    pagination: DEFAULT_PAGINATION_FORM(),
    searchEnabled: false,
    searchParam: "query",
    searchRequired: true,
    detailEnabled: false,
    detailRoute: "",
    detailIdParam: "",
    detailIdFrom: "",
    detailPersist: true,
    chaptersEnabled: false,
    chapters: DEFAULT_CHAPTERS_FORM(),
  };
}

function paginationFromFeature(p?: PaginationFeature): PaginationForm {
  return {
    style: p?.style ?? "offset",
    param: p?.param ?? "",
    defaultValue: p?.default ?? "",
    idFrom: p?.idFrom ?? "",
    sizeParam: p?.sizeParam ?? "",
    defaultSize: p?.defaultSize != null ? String(p.defaultSize) : "",
  };
}

function chapterDetailFromFeature(d?: ChapterDetailFeature): ChapterDetailForm {
  return {
    route: d?.route ?? "",
    idParam: d?.idParam ?? "",
    idFrom: d?.idFrom ?? "",
    parentParam: d?.parentParam ?? "",
    parentFrom: d?.parentFrom ?? "",
    persist: d?.persist ?? true,
  };
}

function chaptersFromFeature(c?: ChaptersFeature): ChaptersForm {
  return {
    route: c?.route ?? "",
    idParam: c?.idParam ?? "",
    idFrom: c?.idFrom ?? "",
    label: c?.label ?? "",
    itemLabel: c?.itemLabel ?? "",
    persist: c?.persist ?? true,
    limit: c?.limit != null ? String(c.limit) : "",
    paginationEnabled: c?.pagination != null,
    pagination: paginationFromFeature(c?.pagination),
    detailEnabled: c?.detail != null,
    detail: chapterDetailFromFeature(c?.detail),
  };
}

export function featuresFromChannel(features?: ChannelFeatures): ChannelFeaturesForm {
  const base = createDefaultFeaturesForm();
  if (!features) return base;

  if (features.feed) {
    base.feedCustomized = true;
    base.feedPersist = features.feed.persist ?? true;
    base.feedRefresh = features.feed.refresh ?? true;
    base.feedLimit =
      features.feed.limit != null && features.feed.limit > 0
        ? String(features.feed.limit)
        : "100";
  }
  if (features.pagination) {
    base.paginationEnabled = true;
    base.pagination = paginationFromFeature(features.pagination);
  }
  if (features.search) {
    base.searchEnabled = true;
    base.searchParam = features.search.param ?? "query";
    base.searchRequired = features.search.required ?? true;
  }
  if (features.detail) {
    base.detailEnabled = true;
    base.detailRoute = features.detail.route ?? "";
    base.detailIdParam = features.detail.idParam ?? "";
    base.detailIdFrom = features.detail.idFrom ?? "";
    base.detailPersist = features.detail.persist ?? true;
  }
  if (features.chapters) {
    base.chaptersEnabled = true;
    base.chapters = chaptersFromFeature(features.chapters);
  }
  return base;
}

function buildPagination(form: PaginationForm): PaginationFeature {
  const item: PaginationFeature = { style: form.style };
  const param = form.param.trim();
  const defaultValue = form.defaultValue.trim();
  const idFrom = form.idFrom.trim();
  const sizeParam = form.sizeParam.trim();
  const defaultSize = Number.parseInt(form.defaultSize.trim(), 10);
  if (param) item.param = param;
  if (defaultValue) item.default = defaultValue;
  if (idFrom) item.idFrom = idFrom;
  if (sizeParam) item.sizeParam = sizeParam;
  if (Number.isFinite(defaultSize) && defaultSize > 0) item.defaultSize = defaultSize;
  return item;
}

function buildChapterDetail(form: ChapterDetailForm): ChapterDetailFeature {
  const item: ChapterDetailFeature = { route: form.route.trim() };
  const idParam = form.idParam.trim();
  const idFrom = form.idFrom.trim();
  const parentParam = form.parentParam.trim();
  const parentFrom = form.parentFrom.trim();
  if (idParam) item.idParam = idParam;
  if (idFrom) item.idFrom = idFrom;
  if (parentParam) item.parentParam = parentParam;
  if (parentFrom) item.parentFrom = parentFrom;
  if (!form.persist) item.persist = false;
  return item;
}

function buildFeed(form: ChannelFeaturesForm): FeedFeature | undefined {
  if (!form.feedCustomized) return undefined;
  const feed: FeedFeature = {};
  if (!form.feedPersist) feed.persist = false;
  if (!form.feedRefresh) feed.refresh = false;
  const limit = Number.parseInt(form.feedLimit.trim(), 10);
  if (Number.isFinite(limit) && limit > 0 && limit !== 100) {
    feed.limit = limit;
  }
  if (Object.keys(feed).length === 0 && form.feedPersist && form.feedRefresh) {
    return {};
  }
  return feed;
}

export function featuresToChannel(form: ChannelFeaturesForm): ChannelFeatures | undefined {
  const out: ChannelFeatures = {};

  const feed = buildFeed(form);
  if (feed) out.feed = feed;

  if (form.paginationEnabled) {
    out.pagination = buildPagination(form.pagination);
  }
  if (form.searchEnabled) {
    const search: SearchFeature = {};
    const param = form.searchParam.trim();
    if (param) search.param = param;
    if (!form.searchRequired) search.required = false;
    out.search = search;
  }
  if (form.detailEnabled) {
    const detail: DetailFeature = { route: form.detailRoute.trim() };
    const idParam = form.detailIdParam.trim();
    const idFrom = form.detailIdFrom.trim();
    if (idParam) detail.idParam = idParam;
    if (idFrom) detail.idFrom = idFrom;
    if (!form.detailPersist) detail.persist = false;
    out.detail = detail;
  }
  if (form.chaptersEnabled) {
    const chapters: ChaptersFeature = { route: form.chapters.route.trim() };
    const idParam = form.chapters.idParam.trim();
    const idFrom = form.chapters.idFrom.trim();
    const label = form.chapters.label.trim();
    const itemLabel = form.chapters.itemLabel.trim();
    const limit = Number.parseInt(form.chapters.limit.trim(), 10);
    if (idParam) chapters.idParam = idParam;
    if (idFrom) chapters.idFrom = idFrom;
    if (label) chapters.label = label;
    if (itemLabel) chapters.itemLabel = itemLabel;
    if (!form.chapters.persist) chapters.persist = false;
    if (Number.isFinite(limit) && limit > 0) chapters.limit = limit;
    if (form.chapters.paginationEnabled) {
      chapters.pagination = buildPagination(form.chapters.pagination);
    }
    if (form.chapters.detailEnabled) {
      chapters.detail = buildChapterDetail(form.chapters.detail);
    }
    out.chapters = chapters;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function featuresFromJsonString(raw: string): ChannelFeaturesForm {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "{}") return createDefaultFeaturesForm();
  return featuresFromChannel(JSON.parse(trimmed) as ChannelFeatures);
}

export function featuresToJsonString(form: ChannelFeaturesForm): string {
  const channel = featuresToChannel(form);
  return channel ? JSON.stringify(channel, null, 2) : "{}";
}

export function channelHasCustomFeatures(form: ChannelFeaturesForm): boolean {
  return featuresToChannel(form) != null;
}

export function channelFeedLimitDisplay(form: ChannelFeaturesForm): string {
  if (!form.feedCustomized) return "默认";
  const limit = Number.parseInt(form.feedLimit.trim(), 10);
  return Number.isFinite(limit) && limit > 0 ? String(limit) : "默认";
}

export function channelFeatureBadges(form: ChannelFeaturesForm): string[] {
  const badges: string[] = [];
  if (form.feedCustomized && !form.feedPersist) badges.push("动态");
  if (form.paginationEnabled) badges.push("分页");
  if (form.searchEnabled) badges.push("搜索");
  if (form.detailEnabled) badges.push("详情");
  if (form.chaptersEnabled) badges.push("章节");
  if (channelHasCustomFeatures(form) && badges.length === 0) badges.push("v2");
  return badges;
}

export function validateFeaturesForm(form: ChannelFeaturesForm): string | null {
  if (form.detailEnabled && !form.detailRoute.trim()) {
    return "详情功能需填写 detail.route";
  }
  if (form.chaptersEnabled && !form.chapters.route.trim()) {
    return "章节功能需填写 chapters.route";
  }
  if (form.chapters.detailEnabled && !form.chapters.detail.route.trim()) {
    return "章节详情需填写 chapters.detail.route";
  }
  if (form.paginationEnabled && !form.pagination.style) {
    return "分页需选择 style";
  }
  return null;
}

export type WasmFormTab = "channels" | "runtime" | "basic" | "variables" | "brand";

export const WASM_FORM_TABS: { id: WasmFormTab; label: string; icon: string }[] = [
  { id: "channels", label: "频道配置", icon: "layers" },
  { id: "runtime", label: "运行时参数", icon: "terminal" },
  { id: "basic", label: "插件信息", icon: "info" },
  { id: "variables", label: "用户变量", icon: "puzzle" },
  { id: "brand", label: "品牌展示", icon: "sparkles" },
];
