import { loadEnvConfig } from "@next/env";
import { validateHostingEnvironment } from "./lib/hosting";

try {
  // Match next build's production .env file precedence.
  loadEnvConfig(process.cwd(), false);
  const config = validateHostingEnvironment(process.env);
  console.log(
    `Hosted build configuration is valid for ${new URL(config.url).hostname}.`,
  );
  console.log(
    "This checks configuration only. Run npm run supabase:check to check the project.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Hosting configuration failed.",
  );
  process.exitCode = 1;
}
