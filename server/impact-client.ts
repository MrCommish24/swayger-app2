const IMPACT_API_BASE_URL = "https://api.impact.com";
const IMPACT_REQUEST_TIMEOUT_MS = 10_000;
const IMPACT_INVENTORY_PAGE_SIZE = 50;
const IMPACT_INVENTORY_MAX_PAGES = 100;

export type ImpactJoinedProgram = {
  program_id: string | null;
  program_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  status: string | null;
};

export type ImpactInventoryResourceType =
  | "promotion"
  | "deal"
  | "ad"
  | "promo_code";

export type ImpactInventoryItem = {
  provider: "impact";
  program_id: string | null;
  program_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  resource_type: ImpactInventoryResourceType;
  external_id: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  availability: "available_to_partner" | null;
  start_at: string | null;
  end_at: string | null;
  promo_code: string | null;
  discount_type: string | null;
  discount_amount: number | null;
  discount_currency: string | null;
  discount_percent: number | null;
  minimum_purchase_amount: number | null;
  maximum_savings_amount: number | null;
  tracking_url: string | null;
  landing_page_url: string | null;
  creative_url: string | null;
  creative_type: string | null;
  creative_width: number | null;
  creative_height: number | null;
  source_updated_at: string | null;
  fetched_at: string;
};

export type ImpactInventoryCounts = {
  promotions: number;
  deals: number;
  ads: number;
  creatives: number;
  promo_codes: number;
  total: number;
};

export type ImpactInventoryProgram = {
  program: ImpactJoinedProgram;
  counts: ImpactInventoryCounts;
  items: ImpactInventoryItem[];
};

export type ImpactInventory = {
  provider: "impact";
  fetched_at: string;
  page_size: number;
  active_program_count: number;
  programs: ImpactInventoryProgram[];
  unassigned_account_promotions: ImpactInventoryItem[];
  totals: ImpactInventoryCounts;
};

export class ImpactConfigurationError extends Error {
  code = "IMPACT_NOT_CONFIGURED";
}

export class ImpactAuthenticationError extends Error {
  code = "IMPACT_AUTHENTICATION_FAILED";
}

export class ImpactProviderError extends Error {
  code = "IMPACT_PROVIDER_ERROR";
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ImpactCampaignRow = {
  CampaignId?: unknown;
  CampaignName?: unknown;
  AdvertiserId?: unknown;
  AdvertiserName?: unknown;
  ContractStatus?: unknown;
};

type ImpactProviderRow = Record<string, unknown>;

type ImpactPagedRows = {
  rows: ImpactProviderRow[];
  total: number | null;
};

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const stringValue = typeof value === "string" ? value : String(value);
  return stringValue.trim() ? stringValue : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readCollection(payload: Record<string, unknown>, key: string): ImpactProviderRow[] {
  const value = payload[key];
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function readMetaNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = asNullableNumber(payload[key]);
  return value == null ? null : Math.max(0, Math.floor(value));
}

function withPagination(path: string, page: number): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}PageSize=${IMPACT_INVENTORY_PAGE_SIZE}&Page=${page}`;
}

function normalizeDate(value: unknown): string | null {
  return asNullableString(value);
}

function normalizeStatus(value: unknown): string | null {
  const status = asNullableString(value);
  return status ? status.toLowerCase() : null;
}

function parsePromotionDates(value: unknown): {
  start_at: string | null;
  end_at: string | null;
} {
  const dates = asNullableString(value);
  if (!dates) return { start_at: null, end_at: null };
  const [start, end] = dates.split("/", 2);
  return {
    start_at: normalizeDate(start),
    end_at: normalizeDate(end),
  };
}

function getImpactConfiguration(): { accountSid: string; accessToken: string } {
  const accountSid = process.env.IMPACT_ACCOUNT_SID?.trim();
  const accessToken = process.env.IMPACT_API_ACCESS_TOKEN?.trim();

  if (!accountSid || !accessToken) {
    throw new ImpactConfigurationError(
      "Impact account credentials are not configured.",
    );
  }

  return { accountSid, accessToken };
}

async function fetchImpactJson(path: string): Promise<Record<string, unknown>> {
  const { accountSid, accessToken } = getImpactConfiguration();
  const endpoint = `${IMPACT_API_BASE_URL}${path}`;
  const authorization = Buffer.from(`${accountSid}:${accessToken}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPACT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new ImpactAuthenticationError("Impact rejected the configured credentials.");
    }

    if (!response.ok) {
      throw new ImpactProviderError(
        `Impact returned an upstream error (${response.status}).`,
        response.status,
      );
    }

    return asRecord(await response.json());
  } catch (error) {
    if (error instanceof ImpactConfigurationError ||
        error instanceof ImpactAuthenticationError ||
        error instanceof ImpactProviderError) {
      throw error;
    }

    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new ImpactProviderError("Impact request timed out.", 504);
    }

    throw new ImpactProviderError("Impact request failed.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function listImpactRows(path: string, collectionKey: string): Promise<ImpactPagedRows> {
  const rows: ImpactProviderRow[] = [];
  let total: number | null = null;

  for (let page = 1; page <= IMPACT_INVENTORY_MAX_PAGES; page += 1) {
    const payload = await fetchImpactJson(withPagination(path, page));
    const pageRows = readCollection(payload, collectionKey);
    const pageTotal = readMetaNumber(payload, "@total");
    if (pageTotal != null) total = pageTotal;
    rows.push(...pageRows);

    if (pageRows.length === 0 ||
        (total != null && rows.length >= total) ||
        pageRows.length < IMPACT_INVENTORY_PAGE_SIZE) {
      return { rows, total };
    }
  }

  throw new ImpactProviderError("Impact inventory pagination limit reached.", 502);
}

export async function listJoinedImpactPrograms(): Promise<ImpactJoinedProgram[]> {
  const { rows } = await listImpactRows(
    `/Mediapartners/${encodeURIComponent(getImpactConfiguration().accountSid)}/Campaigns`,
    "Campaigns",
  );

  return rows.map((row) => {
    const campaign = row as ImpactCampaignRow;
    return {
      program_id: asNullableString(campaign.CampaignId),
      program_name: asNullableString(campaign.CampaignName),
      brand_id: asNullableString(campaign.AdvertiserId),
      brand_name: asNullableString(campaign.AdvertiserName),
      status: asNullableString(campaign.ContractStatus),
    };
  });
}

function getProgramFields(row: ImpactProviderRow, program: ImpactJoinedProgram) {
  return {
    program_id: program.program_id,
    program_name: program.program_name,
    brand_id: asNullableString(row.AdvertiserId) ?? program.brand_id,
    brand_name: asNullableString(row.AdvertiserName) ?? program.brand_name,
  };
}

function normalizeCommonItem(
  row: ImpactProviderRow,
  program: ImpactJoinedProgram,
  resourceType: ImpactInventoryResourceType,
  fetchedAt: string,
): ImpactInventoryItem {
  return {
    provider: "impact",
    ...getProgramFields(row, program),
    resource_type: resourceType,
    external_id: null,
    title: null,
    description: null,
    status: null,
    availability: null,
    start_at: null,
    end_at: null,
    promo_code: null,
    discount_type: null,
    discount_amount: null,
    discount_currency: null,
    discount_percent: null,
    minimum_purchase_amount: null,
    maximum_savings_amount: null,
    tracking_url: null,
    landing_page_url: null,
    creative_url: null,
    creative_type: null,
    creative_width: null,
    creative_height: null,
    source_updated_at: null,
    fetched_at: fetchedAt,
  };
}

function normalizePromotion(
  row: ImpactProviderRow,
  program: ImpactJoinedProgram,
  fetchedAt: string,
): ImpactInventoryItem {
  const item = normalizeCommonItem(row, program, "promotion", fetchedAt);
  const dates = parsePromotionDates(row.PromotionEffectiveDates);
  return {
    ...item,
    external_id: asNullableString(row.PromotionIds),
    title: asNullableString(row.PromotionTitle),
    availability: "available_to_partner",
    start_at: dates.start_at,
    end_at: dates.end_at,
    promo_code: asNullableString(row.GenericRedemptionCode),
  };
}

function normalizeDeal(
  row: ImpactProviderRow,
  program: ImpactJoinedProgram,
  fetchedAt: string,
): ImpactInventoryItem {
  const item = normalizeCommonItem(row, program, "deal", fetchedAt);
  return {
    ...item,
    external_id: asNullableString(row.Id),
    title: asNullableString(row.Name),
    description: asNullableString(row.Description),
    status: normalizeStatus(row.State),
    start_at: normalizeDate(row.StartDate),
    end_at: normalizeDate(row.EndDate),
    promo_code: asNullableString(row.DefaultPromoCode),
    discount_type: asNullableString(row.DiscountType),
    discount_amount: asNullableNumber(row.DiscountAmount),
    discount_currency: asNullableString(row.DiscountCurrency),
    discount_percent: asNullableNumber(row.DiscountPercent),
    minimum_purchase_amount: asNullableNumber(row.MinimumPurchaseAmount),
    maximum_savings_amount: asNullableNumber(row.MaximumSavingsAmount),
    source_updated_at: normalizeDate(row.DateLastUpdated),
  };
}

function normalizeAd(
  row: ImpactProviderRow,
  program: ImpactJoinedProgram,
  fetchedAt: string,
): ImpactInventoryItem {
  const item = normalizeCommonItem(row, program, "ad", fetchedAt);
  return {
    ...item,
    external_id: asNullableString(row.Id),
    title: asNullableString(row.Name),
    description: asNullableString(row.Description) ?? asNullableString(row.DealDescription),
    availability: "available_to_partner",
    start_at: normalizeDate(row.StartDate) ?? normalizeDate(row.DealStartDate),
    end_at: normalizeDate(row.EndDate) ?? normalizeDate(row.DealEndDate),
    promo_code: asNullableString(row.DealDefaultPromoCode),
    discount_type: asNullableString(row.DiscountType),
    discount_amount: asNullableNumber(row.DiscountAmount),
    discount_currency: asNullableString(row.DiscountCurrency),
    discount_percent: asNullableNumber(row.DiscountPercent),
    minimum_purchase_amount: asNullableNumber(row.MinimumPurchaseAmount),
    maximum_savings_amount: asNullableNumber(row.MaximumSavingsAmount),
    tracking_url: asNullableString(row.TrackingLink),
    landing_page_url: asNullableString(row.LandingPageUrl),
    creative_url: asNullableString(row.CreativeUrl),
    creative_type: asNullableString(row.Type),
    creative_width: asNullableNumber(row.Width),
    creative_height: asNullableNumber(row.Height),
    source_updated_at: normalizeDate(row.DealDateLastUpdated),
  };
}

function normalizePromoCode(
  row: ImpactProviderRow,
  program: ImpactJoinedProgram,
  fetchedAt: string,
): ImpactInventoryItem {
  const item = normalizeCommonItem(row, program, "promo_code", fetchedAt);
  return {
    ...item,
    external_id: asNullableString(row.Id) ?? asNullableString(row.Code),
    title: asNullableString(row.DealName) ?? asNullableString(row.CampaignName),
    status: normalizeStatus(row.State),
    availability: "available_to_partner",
    start_at: normalizeDate(row.StartDate),
    end_at: normalizeDate(row.EndDate),
    promo_code: asNullableString(row.Code),
  };
}

function emptyCounts(): ImpactInventoryCounts {
  return {
    promotions: 0,
    deals: 0,
    ads: 0,
    creatives: 0,
    promo_codes: 0,
    total: 0,
  };
}

function countItems(items: ImpactInventoryItem[]): ImpactInventoryCounts {
  const counts = emptyCounts();
  for (const item of items) {
    counts.total += 1;
    if (item.resource_type === "promotion") counts.promotions += 1;
    if (item.resource_type === "deal") counts.deals += 1;
    if (item.resource_type === "ad") {
      counts.ads += 1;
      if (item.creative_url) counts.creatives += 1;
    }
    if (item.resource_type === "promo_code") counts.promo_codes += 1;
  }
  return counts;
}

function addCounts(target: ImpactInventoryCounts, source: ImpactInventoryCounts): void {
  target.promotions += source.promotions;
  target.deals += source.deals;
  target.ads += source.ads;
  target.creatives += source.creatives;
  target.promo_codes += source.promo_codes;
  target.total += source.total;
}

function matchedProgramForPromotion(
  row: ImpactProviderRow,
  programs: ImpactJoinedProgram[],
): ImpactJoinedProgram | null {
  const explicitProgramId =
    asNullableString(row.CampaignId) ?? asNullableString(row.ProgramId);
  if (explicitProgramId) {
    return programs.find((program) => program.program_id === explicitProgramId) ?? null;
  }

  const advertiserId = asNullableString(row.AdvertiserId);
  const matches = programs.filter((program) => program.brand_id === advertiserId);
  return matches.length === 1 ? matches[0] : null;
}

export async function getImpactInventory(): Promise<ImpactInventory> {
  const fetchedAt = new Date().toISOString();
  const programs = await listJoinedImpactPrograms();
  const activePrograms = programs.filter(
    (program) => program.program_id && program.status?.toLowerCase() === "active",
  );
  const activeProgramIds = new Set(activePrograms.map((program) => program.program_id));

  const promotionResult = await listImpactRows(
    `/Mediapartners/${encodeURIComponent(getImpactConfiguration().accountSid)}/Promotions`,
    "Promotions",
  );
  const accountPromotions = promotionResult.rows;
  const promotionsByProgram = new Map<string, ImpactInventoryItem[]>();
  const unassignedPromotions: ImpactInventoryItem[] = [];

  for (const row of accountPromotions) {
    const program = matchedProgramForPromotion(row, activePrograms);
    if (!program?.program_id || !activeProgramIds.has(program.program_id)) {
      unassignedPromotions.push(normalizePromotion(row, {
        program_id: null,
        program_name: null,
        brand_id: asNullableString(row.AdvertiserId),
        brand_name: asNullableString(row.AdvertiserName),
        status: null,
      }, fetchedAt));
      continue;
    }

    const existing = promotionsByProgram.get(program.program_id) ?? [];
    existing.push(normalizePromotion(row, program, fetchedAt));
    promotionsByProgram.set(program.program_id, existing);
  }

  const inventoryPrograms: ImpactInventoryProgram[] = [];
  const totals = emptyCounts();

  for (const program of activePrograms) {
    const programId = program.program_id as string;
    const dealResult = await listImpactRows(
      `/Mediapartners/${encodeURIComponent(getImpactConfiguration().accountSid)}/Campaigns/${encodeURIComponent(programId)}/Deals`,
      "Deals",
    );
    const adResult = await listImpactRows(
      `/Mediapartners/${encodeURIComponent(getImpactConfiguration().accountSid)}/Ads?CampaignId=${encodeURIComponent(programId)}`,
      "Ads",
    );
    const promoCodeResult = await listImpactRows(
      `/Mediapartners/${encodeURIComponent(getImpactConfiguration().accountSid)}/PromoCodes?ProgramId=${encodeURIComponent(programId)}`,
      "PromoCodes",
    );

    const items = [
      ...(promotionsByProgram.get(programId) ?? []),
      ...dealResult.rows.map((row) => normalizeDeal(row, program, fetchedAt)),
      ...adResult.rows.map((row) => normalizeAd(row, program, fetchedAt)),
      ...promoCodeResult.rows.map((row) => normalizePromoCode(row, program, fetchedAt)),
    ];
    const counts = countItems(items);
    addCounts(totals, counts);
    inventoryPrograms.push({ program, counts, items });
  }

  const unassignedCounts = countItems(unassignedPromotions);
  addCounts(totals, unassignedCounts);

  return {
    provider: "impact",
    fetched_at: fetchedAt,
    page_size: IMPACT_INVENTORY_PAGE_SIZE,
    active_program_count: inventoryPrograms.length,
    programs: inventoryPrograms,
    unassigned_account_promotions: unassignedPromotions,
    totals,
  };
}