import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { roles } from "../src/lib/domain/types";

async function main() {
  loadEnvConfig(process.cwd());
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      facility: { type: "string" },
      wards: { type: "string" },
    },
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.STAFF_INITIAL_PASSWORD;
  if (!url || !key || !password || password.length < 12)
    throw new Error(
      "Set the Supabase URL, private SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY), and a STAFF_INITIAL_PASSWORD of at least 12 characters in your private environment.",
    );
  if (
    !values.email ||
    !values.name ||
    !values.facility ||
    !values.role ||
    !roles.includes(values.role as (typeof roles)[number])
  )
    throw new Error(
      "Required arguments: --email, --name, --role, --facility, --wards.",
    );
  const wards = (values.wards ?? "").split(",").map(Number);
  if (
    !wards.length ||
    wards.some((w) => !Number.isInteger(w) || w < 1 || w > 99)
  )
    throw new Error("Provide valid comma-separated ward numbers.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.admin.createUser({
    email: values.email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(
      "Staff account could not be created. Check project access and whether the email already exists.",
    );
  const profile = await client.from("staff_profiles").insert({
    id: data.user.id,
    full_name: values.name,
    role: values.role,
    facility_id: values.facility,
    active: false,
  });
  if (profile.error)
    throw new Error(
      `Auth user ${data.user.id} was created without an active profile. Resolve its profile in Supabase before use.`,
    );
  const scopes = await client.from("staff_scopes").insert(
    wards.map((ward) => ({
      user_id: data.user.id,
      facility_id: values.facility,
      ward_number: ward,
    })),
  );
  if (scopes.error)
    throw new Error(
      `Staff profile ${data.user.id} remains disabled because scope assignment failed.`,
    );
  const activation = await client
    .from("staff_profiles")
    .update({ active: true })
    .eq("id", data.user.id);
  if (activation.error)
    throw new Error(
      `Staff profile ${data.user.id} remains disabled. Review the assignment before activation.`,
    );
  console.log(
    `Staff account created and scoped. User ID: ${data.user.id}. Share credentials through your approved private channel.`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Staff setup failed.");
  process.exitCode = 1;
});
