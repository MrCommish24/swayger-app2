import { createClient } from "@supabase/supabase-js";

const SERVICE_ROLE_CONFIGURATION_ERROR =
  "Supabase service-role configuration is required for server database access";

export class ServiceSupabaseConfigurationError extends Error {
  status = 503;

  constructor(message: string) {
    super(message);
    this.name = "ServiceSupabaseConfigurationError";
  }
}

/**
 * Server-side Supabase client for routes that must bypass browser-role RLS.
 *
 * This intentionally does not fall back to the public anon key. Once direct
 * browser table access is revoked, an anon fallback would turn a configuration
 * problem into a partial and privilege-dependent outage.
 */
export function assertServiceSupabaseConfigured(): void {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) {
    throw new ServiceSupabaseConfigurationError(
      `${SERVICE_ROLE_CONFIGURATION_ERROR}: EXPO_PUBLIC_SUPABASE_URL is missing`,
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new ServiceSupabaseConfigurationError(
      `${SERVICE_ROLE_CONFIGURATION_ERROR}: SUPABASE_SERVICE_ROLE_KEY is missing`,
    );
  }
}

export function isServiceSupabaseConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function getServiceSupabase() {
  assertServiceSupabaseConfigured();

  return createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}