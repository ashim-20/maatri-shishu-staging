import { authorized, databaseError, json } from "@/lib/server-api";
export async function GET() {
  const { client, error } = await authorized();
  if (error) return error;
  const result = await client.rpc("load_workspace");
  return result.error ? databaseError(result.error) : json(result.data);
}
