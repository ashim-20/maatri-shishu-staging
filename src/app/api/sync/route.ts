import { type NextRequest } from "next/server";
import { z } from "zod";
import {
  authorized,
  databaseError,
  json,
  validateOrigin,
} from "@/lib/server-api";
import { recordKinds, schemas, type RecordKind } from "@/lib/domain/types";
const operationSchema = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  entityType: z.enum(recordKinds as [RecordKind, ...RecordKind[]]),
  action: z.enum(["create", "update", "approve_clinical", "activate"]),
  data: z.record(z.string(), z.unknown()),
  expectedVersion: z.number().int().min(0),
  wardId: z.number().int().min(1).max(99),
  createdAt: z.iso.datetime(),
  batchId: z.string().uuid().optional(),
});
export async function POST(request: NextRequest) {
  const originError = validateOrigin(request);
  if (originError) return originError;
  const { client, error } = await authorized();
  if (error) return error;
  if (Number(request.headers.get("content-length") ?? 0) > 100000)
    return json({ error: "The operation is too large." }, 413);
  const body = await request.json().catch(() => null);
  const input = z
    .union([
      operationSchema,
      z.object({ operations: z.array(operationSchema).min(1).max(30) }),
    ])
    .safeParse(body);
  if (!input.success) return json({ error: "Invalid sync operation." }, 422);
  const operations =
    "operations" in input.data ? input.data.operations : [input.data];
  if (JSON.stringify(operations).length > 90000)
    return json({ error: "The record is too large." }, 413);
  for (const op of operations)
    if (op.action === "create" || op.action === "update") {
      const checked = schemas[op.entityType].safeParse(op.data);
      if (!checked.success)
        return json(
          { error: checked.error.issues[0]?.message ?? "Invalid record." },
          422,
        );
      op.data = checked.data;
    }
  const result = await client.rpc("apply_operations", {
    operation_inputs: operations,
  });
  return result.error ? databaseError(result.error) : json(result.data);
}
