import { z } from "zod";
import type { NextRequest } from "next/server";
import { json, validateOrigin } from "@/lib/server-api";
import { createServerSupabase } from "@/lib/supabase/server";
import { isConfigured, isDemo } from "@/lib/config";
const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(512),
});
export async function POST(request: NextRequest) {
  const origin = validateOrigin(request);
  if (origin) return origin;
  if (isDemo || !isConfigured)
    return json(
      {
        error:
          "Supabase sign-in is not enabled in this demo. Configure your project to use staff accounts.",
      },
      503,
    );
  const body = credentials.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return json({ error: "Enter a valid email and password." }, 422);
  const client = await createServerSupabase();
  const { error } = await client.auth.signInWithPassword(body.data);
  if (error)
    return json(
      {
        error:
          error.status === 429
            ? "Too many attempts. Please wait before trying again."
            : "Sign-in failed. Check your credentials or contact your administrator.",
      },
      error.status === 429 ? 429 : 401,
    );
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data: profile } = await client
    .from("staff_profiles")
    .select("active")
    .eq("id", user?.id ?? "")
    .single();
  if (!profile?.active) {
    await client.auth.signOut();
    return json(
      {
        error:
          "An active staff assignment is required. Contact your administrator.",
      },
      403,
    );
  }
  return json({ ok: true });
}
