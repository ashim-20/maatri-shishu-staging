import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { schemas, recordKinds, roles } from "../src/lib/domain/types";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: "string", format: "uuid" };
const timestamp = { type: "string", format: "date-time" };
const content = (schema: object) => ({ "application/json": { schema } });
const response = (description: string, schema: object) => ({
  description,
  content: content(schema),
});
const errors = Object.fromEntries(
  Object.entries({
    401: "Authentication required",
    403: "Origin, role or scope denied",
    409: "Version or idempotency conflict",
    413: "Request too large",
    422: "Validation failed",
    429: "Authentication rate limited",
    503: "Supabase unavailable or demo mode",
  }).map(([code, description]) => [code, response(description, ref("Error"))]),
);
const request = (schema: object) => ({
  required: true,
  content: content(schema),
});
const definitions: Record<string, object> = {};
for (const type of recordKinds) {
  const schema = z.toJSONSchema(schemas[type], { unrepresentable: "any" });
  delete schema.$schema;
  definitions[type] = schema;
}
const operation = {
  type: "object",
  required: [
    "id",
    "entityId",
    "entityType",
    "action",
    "data",
    "expectedVersion",
    "wardId",
    "createdAt",
  ],
  properties: {
    id: uuid,
    batchId: uuid,
    entityId: uuid,
    entityType: { type: "string", enum: recordKinds },
    action: {
      type: "string",
      enum: ["create", "update", "approve_clinical", "activate"],
    },
    data: {
      type: "object",
      description:
        "Full entity payload using the matching entityType schema; empty for approval transitions.",
    },
    expectedVersion: { type: "integer", minimum: 0 },
    wardId: { type: "integer", minimum: 1, maximum: 99 },
    createdAt: timestamp,
  },
  allOf: recordKinds.map((type) => ({
    if: {
      properties: {
        entityType: { const: type },
        action: { enum: ["create", "update"] },
      },
    },
    then: { properties: { data: ref(type) } },
  })),
};
const entity = {
  type: "object",
  required: [
    "id",
    "type",
    "data",
    "facilityId",
    "wardId",
    "version",
    "createdAt",
    "updatedAt",
    "createdBy",
  ],
  properties: {
    id: uuid,
    type: { type: "string", enum: recordKinds },
    data: { type: "object" },
    facilityId: uuid,
    wardId: { type: "integer" },
    version: { type: "integer" },
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uuid,
  },
};
const document = {
  openapi: "3.1.0",
  info: {
    title: "Maatri-Shishu workspace API",
    version: "0.1.0",
    description:
      "Next.js route handlers backed by Supabase Auth and PostgreSQL RPC. Protected APIs are disabled in local demo mode. Date-only values use Gregorian YYYY-MM-DD; timestamps use ISO 8601. Mutation POSTs require an Origin matching the application's origin. All responses are private/no-store and have X-Request-Id. This contract documents the implemented API; it does not claim hosted integration or clinical approval.",
  },
  servers: [{ url: "/" }],
  security: [{ staffSession: [] }],
  paths: {
    "/api/auth/login": {
      post: {
        summary: "Sign in an individually provisioned staff account",
        security: [],
        requestBody: request({
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", maxLength: 254 },
            password: { type: "string", minLength: 1, maxLength: 512 },
          },
        }),
        responses: {
          200: response(
            "Session established with HttpOnly cookies",
            ref("Success"),
          ),
          ...errors,
        },
      },
    },
    "/api/auth/logout": {
      post: {
        summary: "Revoke the current session, including for disabled staff",
        responses: {
          200: response("Session revoked", ref("Success")),
          ...errors,
        },
      },
    },
    "/api/workspace": {
      get: {
        summary:
          "Read the full currently scoped snapshot and record workspace access",
        description:
          "Returns assigned records only. Administrative roles receive schedules; ordinary staff receive only active schedules. Incremental cursor pagination is not implemented.",
        responses: {
          200: response("Scoped workspace", ref("Workspace")),
          ...errors,
        },
      },
    },
    "/api/sync": {
      post: {
        summary:
          "Apply an idempotent, version-checked operation or atomic form batch",
        description:
          "A batch contains 1–30 operations in parent-before-child order and commits entirely or rolls back entirely. Maximum serialized batch length: 90,000 characters; Content-Length above 100,000 is rejected. Retry identical operation IDs after uncertain delivery. A 409 requires explicit review; changing payload requires a new operation ID. Supplied role, actor or facility are never trusted; PostgreSQL derives them from auth.uid().",
        requestBody: request({
          oneOf: [
            ref("Operation"),
            {
              type: "object",
              required: ["operations"],
              properties: {
                operations: {
                  type: "array",
                  minItems: 1,
                  maxItems: 30,
                  items: ref("Operation"),
                },
              },
            },
          ],
        }),
        responses: {
          200: response(
            "All writes committed, or identical receipts replayed",
            {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      record: ref("Entity"),
                      duplicate: { type: "boolean" },
                    },
                  },
                },
              },
            },
          ),
          ...errors,
        },
      },
    },
    "/api/audit": {
      post: {
        summary: "Upload durable profile-read or print metadata",
        description:
          "Idempotent by staff account and access-event ID. The observation time is device supplied; the database separately records receipt time. No patient narrative is accepted. Current account and record scope are rechecked.",
        requestBody: request(ref("AccessEvent")),
        responses: {
          200: response("Access event acknowledged", ref("Success")),
          ...errors,
        },
      },
    },
    "/api/export": {
      get: {
        summary: "Export scoped records as audited JSON",
        description:
          "Health workers and supervisors only. This is a data export, not a complete database backup or restore format.",
        responses: {
          200: response("Scoped export", {
            type: "object",
            properties: {
              format: { const: "maatri-shishu/1" },
              exportedAt: timestamp,
              records: { type: "array", items: ref("Entity") },
            },
          }),
          ...errors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      staffSession: {
        type: "apiKey",
        in: "cookie",
        name: "sb-<project-ref>-auth-token",
        description:
          "Project-specific Supabase SSR cookie (possibly chunked). Issued and refreshed on the server; HttpOnly, SameSite=Lax, Secure in production. The browser does not receive a JavaScript-readable auth token.",
      },
    },
    schemas: {
      ...definitions,
      Operation: operation,
      Entity: entity,
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
      Success: {
        type: "object",
        required: ["ok"],
        properties: { ok: { const: true } },
      },
      AccessEvent: {
        type: "object",
        required: ["id", "action", "entityId", "entityType", "occurredAt"],
        properties: {
          id: uuid,
          action: { type: "string", enum: ["read", "print"] },
          entityId: uuid,
          entityType: { type: "string", enum: ["mothers", "children"] },
          occurredAt: timestamp,
        },
      },
      Profile: {
        type: "object",
        properties: {
          id: uuid,
          name: { type: "string" },
          role: { type: "string", enum: roles },
          facilityId: uuid,
          facilityName: { type: "string" },
          wardIds: { type: "array", items: { type: "integer" } },
          active: { type: "boolean" },
        },
      },
      Workspace: {
        type: "object",
        required: ["profile", "records", "audit"],
        properties: {
          profile: ref("Profile"),
          records: { type: "array", items: ref("Entity") },
          audit: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: uuid,
                actor: { type: "string" },
                action: { type: "string" },
                entityId: uuid,
                entityType: { type: "string" },
                at: timestamp,
              },
            },
          },
          serverTime: timestamp,
        },
      },
    },
  },
};
async function main() {
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/openapi.json",
    JSON.stringify(document, null, 2) + "\n",
  );
  console.log("Wrote docs/openapi.json from the current domain schemas.");
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "API documentation generation failed.",
  );
  process.exitCode = 1;
});
