import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
import { validateHostingEnvironment } from "./lib/hosting";

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      key: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "npm run supabase:configure [-- --url PROJECT_URL --key PUBLISHABLE_KEY]",
    );
    console.log(
      "Creates .env.local with public settings only; existing files are preserved.",
    );
    return;
  }
  let url = values.url;
  let key = values.key;
  if (!url || !key) {
    if (!stdin.isTTY) {
      throw new Error(
        "Run in an interactive terminal or provide both --url and --key (public key only).",
      );
    }
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      console.log(
        "Copy the Project URL and publishable key from Supabase's Connect dialog.",
      );
      url ||= await prompt.question("Project URL: ");
      key ||= await prompt.question(
        "Publishable key (sb_publishable_..., never a secret key): ",
      );
    } finally {
      prompt.close();
    }
  }
  const config = validateHostingEnvironment({
    NEXT_PUBLIC_DEMO_MODE: "false",
    NEXT_PUBLIC_SUPABASE_URL: url.trim(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key.trim(),
  });
  // Exclusive creation avoids overwriting an existing project or provisioning secrets.
  // The validator limits both values to characters safe in an unquoted dotenv value.
  try {
    await writeFile(
      ".env.local",
      [
        "# Connected Supabase workspace. Do not commit this file.",
        "NEXT_PUBLIC_DEMO_MODE=false",
        `NEXT_PUBLIC_SUPABASE_URL=${config.url}`,
        `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${config.publishableKey}`,
        "",
      ].join("\n"),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        ".env.local already exists and was preserved. Edit its three NEXT_PUBLIC values to connect this project.",
      );
    }
    throw new Error(
      "Could not create .env.local. Check write permissions in the project directory.",
    );
  }
  console.log(
    "Created .env.local. No private credentials were requested or stored.",
  );
  console.log(
    "Next: apply the migration and organization seed, disable public signups, then run npm run supabase:check.",
  );
  console.log(
    "For Vercel, add the same three public settings in Project Settings > Environment Variables and deploy.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Supabase configuration failed.",
  );
  process.exitCode = 1;
});
