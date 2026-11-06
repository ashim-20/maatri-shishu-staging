import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  authorized,
  databaseError,
  json,
  validateOrigin,
} from "@/lib/server-api";
const input = z.object({
  id: z.string().uuid(),
  action: z.enum(["read", "print"]),
  entityType: z.enum(["mothers", "children"]),
  entityId: z.string().uuid(),
  occurredAt: z.iso.datetime(),
});
export async function POST(request: NextRequest) {
  const origin = validateOrigin(request);
  if (origin) return origin;
  const { client, error } = await authorized();
  if (error) return error;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid audit request." }, 422);
  const result = await client.rpc("record_access_event", {
    access_input: parsed.data,
  });
  return result.error ? databaseError(result.error) : json({ ok: true });
}
