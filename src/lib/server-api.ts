import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isConfigured, isDemo } from "@/lib/config";
export function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Request-Id": crypto.randomUUID(),
    },
  });
}
export function validateOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "");
  const expectedOrigin = host ? `${protocol}://${host}` : request.nextUrl.origin;
  if (!origin || origin !== expectedOrigin)
    return json({ error: "Request origin is not permitted." }, 403);
  return null;
}
export async function authorized() {
  if (isDemo || !isConfigured)
    return {
      client: null,
      error: json(
        {
          error: "Connect an assigned Supabase workspace to use this endpoint.",
        },
        503,
      ),
    };
  const client = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return {
      client: null,
      error: json({ error: "Sign in to continue." }, 401),
    };
  const { data: staff } = await client
    .from("staff_profiles")
    .select("id,active,role")
    .eq("id", user.id)
    .single();
  if (!staff?.active)
    return {
      client: null,
      error: json(
        {
          error:
            "An active staff account and catchment assignment are required.",
        },
        403,
      ),
    };
  return { client, error: null, staff };
}
export function databaseError(error: { code?: string }) {
  const code = error.code;
  if (code === "40001" || code === "23505")
    return json(
      {
        error:
          "This record changed or already exists. Review the shared version before retrying.",
      },
      409,
    );
  if (code === "42501")
    return json(
      { error: "Your current role or catchment does not permit this action." },
      403,
    );
  if (
    code === "22023" ||
    code?.startsWith("22") ||
    code?.startsWith("23") ||
    code === "P0001"
  )
    return json(
      {
        error:
          "Record validation failed. Check the required fields, dates, record links and approval state.",
      },
      422,
    );
  console.error("workspace_database_error", {
    code: code ?? "unknown",
    correlationId: crypto.randomUUID(),
  });
  return json(
    {
      error:
        "The service could not complete this request. Your pending work has been kept.",
    },
    503,
  );
}
