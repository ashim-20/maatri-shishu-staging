import { authorized, databaseError, json } from "@/lib/server-api";
export async function GET() {
  const { client, error, staff } = await authorized();
  if (error) return error;
  if (!["health_worker", "supervisor"].includes(staff.role))
    return json({ error: "Export requires health-post authorization." }, 403);
  const result = await client.rpc("load_workspace");
  if (result.error) return databaseError(result.error);
  const audit = await client.rpc("record_access", {
    action_name: "export",
    record_type: "workspace",
    record_id: result.data.profile.facilityId,
  });
  if (audit.error) return databaseError(audit.error);
  return json({
    format: "maatri-shishu/1",
    exportedAt: new Date().toISOString(),
    records: result.data.records,
  });
}
