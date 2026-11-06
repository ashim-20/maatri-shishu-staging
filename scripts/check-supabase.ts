import { loadEnvConfig } from "@next/env";
import { validateHostingEnvironment } from "./lib/hosting";
import { checkSupabaseConnection } from "./lib/supabase-probe";

async function main() {
  loadEnvConfig(process.cwd(), false);
  const config = validateHostingEnvironment(process.env);
  console.log(
    `Checking ${new URL(config.url).hostname} with a public key (read-only).`,
  );
  const checks = await checkSupabaseConnection(config);
  for (const check of checks) {
    console.log(
      `${check.ok ? "PASS" : "FAIL"} ${check.name}${check.ok ? "" : `: ${check.detail}`}`,
    );
  }
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
  console.log(
    "These probes do not prove RLS on empty tables or test staff login/sync. Run supabase/verify.sql, then follow the hosted acceptance checklist in docs/SUPABASE_SETUP.md.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Supabase checks failed.",
  );
  process.exitCode = 1;
});
