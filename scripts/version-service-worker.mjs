import { readFile, writeFile } from "node:fs/promises";

const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
if (!/^[\w-]+$/.test(buildId))
  throw new Error("Unexpected Next.js build identifier.");
const worker = await readFile("public/sw.js", "utf8");
await writeFile(
  "public/sw.js",
  worker.replace(
    /const CACHE = "[^"]+";/,
    `const CACHE = "maatri-shell-${buildId}";`,
  ),
);
console.log("Offline shell cache versioned for this build.");
