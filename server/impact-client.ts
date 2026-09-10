const IMPACT_API_BASE_URL = "https://api.impact.com";
const IMPACT_REQUEST_TIMEOUT_MS = 10_000;

export type ImpactJoinedProgram = {
  program_id: string | null;
  program_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  status: string | null;
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

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value);
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

export async function listJoinedImpactPrograms(): Promise<ImpactJoinedProgram[]> {
  const { accountSid, accessToken } = getImpactConfiguration();
  const endpoint = `${IMPACT_API_BASE_URL}/Mediapartners/${encodeURIComponent(accountSid)}/Campaigns`;
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

    const payload = await response.json() as { Campaigns?: unknown };
    const campaigns = Array.isArray(payload.Campaigns) ? payload.Campaigns : [];

    return campaigns.map((campaign) => {
      const row = (campaign && typeof campaign === "object"
        ? campaign
        : {}) as ImpactCampaignRow;
      return {
        program_id: asNullableString(row.CampaignId),
        program_name: asNullableString(row.CampaignName),
        brand_id: asNullableString(row.AdvertiserId),
        brand_name: asNullableString(row.AdvertiserName),
        status: asNullableString(row.ContractStatus),
      };
    });
  } catch (error) {
    if (error instanceof ImpactConfigurationError ||
        error instanceof ImpactAuthenticationError ||
        error instanceof ImpactProviderError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ImpactProviderError("Impact request timed out.", 504);
    }

    throw new ImpactProviderError("Impact request failed.", 502);
  } finally {
    clearTimeout(timeout);
  }
}