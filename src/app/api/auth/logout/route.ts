import type { NextRequest } from "next/server";
import { json, validateOrigin } from "@/lib/server-api";
import { createServerSupabase } from "@/lib/supabase/server";
import { isConfigured, isDemo } from "@/lib/config";
export async function POST(request: NextRequest) {
  const origin = validateOrigin(request);
  if (origin) return origin;
  if (isDemo || !isConfigured)
    return json({ error: "Supabase sign-in is not configured." }, 503);
  // Disabled users must still be able to revoke their own session.
  const client = await createServerSupabase();
  const result = await client.auth.signOut();
  return result.error
    ? json(
        { error: "Could not sign out. Please reconnect and try again." },
        503,
      )
    : json({ ok: true });
}
