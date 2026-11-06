import type { HostedConfiguration } from "./hosting";

export const workspaceTables = [
  "municipalities",
  "health_facilities",
  "staff_profiles",
  "staff_scopes",
  "mothers",
  "pregnancies",
  "births",
  "children",
  "care_events",
  "event_reviews",
  "appointments",
  "follow_ups",
  "attempts",
  "sessions",
  "consents",
  "schedules",
  "reviews",
  "audit_events",
  "record_revisions",
  "sync_operations",
] as const;

export type ConnectionCheck = { name: string; ok: boolean; detail: string };

/** Read-only probes. Never log response bodies, credentials or patient records. */
export async function checkSupabaseConnection(
  config: HostedConfiguration,
  fetcher: typeof fetch = fetch,
): Promise<ConnectionCheck[]> {
  const headers: Record<string, string> = { apikey: config.publishableKey };
  // Modern publishable keys aren't JWTs and belong only in the apikey header.
  if (!config.publishableKey.startsWith("sb_publishable_")) {
    headers.Authorization = `Bearer ${config.publishableKey}`;
  }
  const request = (path: string, method = "GET", extraHeaders = {}) =>
    fetcher(new URL(path, config.url), {
      method,
      headers: { ...headers, ...extraHeaders },
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
      cache: "no-store",
    });

  const checks: ConnectionCheck[] = [];
  try {
    const response = await request("/auth/v1/settings");
    if (!response.ok) {
      return [
        {
          name: "Supabase Auth",
          ok: false,
          detail: `HTTP ${response.status}. Check project status and the public URL/key pair.`,
        },
      ];
    }
    const settings = await response.json();
    checks.push(
      {
        name: "Email sign-in",
        ok: settings?.external?.email === true,
        detail: "Email authentication must be enabled in Supabase Auth.",
      },
      {
        name: "Public signups disabled",
        ok: settings?.disable_signup === true,
        detail: "Disable Allow new users to sign up in Supabase Auth settings.",
      },
      {
        name: "Anonymous sign-ins disabled",
        ok: settings?.external?.anonymous_users === false,
        detail: "Disable anonymous sign-ins in Supabase Auth settings.",
      },
    );
  } catch {
    return [
      {
        name: "Supabase Auth",
        ok: false,
        detail:
          "Could not read Auth settings. Check network access and project availability.",
      },
    ];
  }

  checks.push(
    ...(await Promise.all(
      workspaceTables.map(async (table): Promise<ConnectionCheck> => {
        try {
          // HEAD + exact count checks visibility without downloading record values.
          const response = await request(
            `/rest/v1/${table}?select=*&limit=1`,
            "HEAD",
            { Prefer: "count=exact" },
          );
          const denied = response.status === 401 || response.status === 403;
          const empty =
            response.ok &&
            response.headers.get("content-range")?.endsWith("/0") === true;
          return {
            name: `Anonymous access: ${table}`,
            ok: denied || empty,
            detail:
              denied || empty
                ? "No rows readable in this probe. Verify RLS separately with supabase/verify.sql."
                : "Unexpected response or readable rows. Check the migration, grants and RLS in Supabase.",
          };
        } catch {
          return {
            name: `Anonymous access: ${table}`,
            ok: false,
            detail: "Network request failed; no access result was established.",
          };
        }
      }),
    )),
  );

  try {
    const response = await request("/rest/v1/rpc/load_workspace");
    const body = await response.json().catch(() => null);
    checks.push({
      name: "Workspace RPC requires authentication",
      ok:
        (response.status === 401 || response.status === 403) &&
        body?.code === "42501",
      detail:
        "The load_workspace RPC must exist and deny anonymous execution (PostgreSQL 42501).",
    });
  } catch {
    checks.push({
      name: "Workspace RPC requires authentication",
      ok: false,
      detail: "Network request failed; RPC protection could not be checked.",
    });
  }
  return checks;
}
