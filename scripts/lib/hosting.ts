export type HostedConfiguration = {
  url: string;
  publishableKey: string;
};

/** Check build-time values without printing key material or contacting a project. */
export function validateHostingEnvironment(
  environment: Record<string, string | undefined>,
): HostedConfiguration {
  if (environment.NEXT_PUBLIC_DEMO_MODE !== "false") {
    throw new Error(
      "Set NEXT_PUBLIC_DEMO_MODE=false for hosting. Use npm run build for the local demo.",
    );
  }
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Run npm run supabase:configure locally, or add both in the host's environment settings.",
    );
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be the HTTPS Supabase Project URL.",
    );
  }
  if (
    url !== url.trim() ||
    parsedUrl.protocol !== "https:" ||
    !/^[a-z0-9]{20}\.supabase\.co$/.test(parsedUrl.hostname) ||
    parsedUrl.port ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "Use the default HTTPS Project URL from Supabase's Connect dialog (https://PROJECT_REF.supabase.co), without a path, query, credentials or whitespace.",
    );
  }
  if (publishableKey !== publishableKey.trim()) {
    throw new Error(
      "Remove surrounding whitespace from the public Supabase key.",
    );
  }
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey)) {
    return { url: parsedUrl.origin, publishableKey };
  }

  // Legacy anon JWTs are supported. Decoding only checks their kind/project;
  // authentication against Supabase is performed by supabase:check.
  let claims: { role?: string; ref?: string; exp?: number } = {};
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(publishableKey)) {
    try {
      claims =
        JSON.parse(
          Buffer.from(publishableKey.split(".")[1], "base64url").toString(
            "utf8",
          ),
        ) ?? {};
    } catch {
      // Report a safe validation error below, never the original key.
    }
  }
  if (claims.role !== "anon") {
    throw new Error(
      "The public Supabase key must be an sb_publishable_ key or legacy anon key. Secret keys, service-role keys and user tokens must never be used here.",
    );
  }
  if (claims.ref && claims.ref !== parsedUrl.hostname.split(".")[0]) {
    throw new Error(
      "The legacy anon key belongs to a different Supabase project.",
    );
  }
  if (typeof claims.exp === "number" && claims.exp <= Date.now() / 1000) {
    throw new Error(
      "The legacy anon key has expired. Use a current publishable key.",
    );
  }
  return { url: parsedUrl.origin, publishableKey };
}
