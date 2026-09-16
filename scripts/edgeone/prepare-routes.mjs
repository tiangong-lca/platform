#!/usr/bin/env node
/**
 * Prepare the EdgeOne deploy bundle in three explicit steps:
 *
 *   node scripts/edgeone/prepare-routes.mjs --stage     # dist -> dist-edgeone bundle layout
 *   (cd dist-edgeone && edgeone pages generate-routes)  # pinned CLI writes .edgeone/routes.json
 *   node scripts/edgeone/prepare-routes.mjs --correct   # bounded fallback correction + verification
 *
 * `--check` verifies an existing bundle without writing, and is safe to run in any checkout.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTING_CONFIG_NAME, prepareBundle, stageBundle } from "./routes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const modes = ["--stage", "--correct", "--check"].filter((mode) => args.includes(mode));
const values = new Map(
  args
    .filter((argument) => argument.startsWith("--dist=") || argument.startsWith("--bundle="))
    .map((argument) => argument.split("=")),
);
const known = new Set(["--stage", "--correct", "--check", ...values.keys()].map((argument) => argument.split("=")[0]));
const unknown = args.filter((argument) => !known.has(argument.split("=")[0]));
if (unknown.length || modes.length !== 1) {
  console.error(`Use exactly one of --stage, --correct or --check. Unknown argument(s): ${unknown.join(", ") || "none"}.`);
  process.exit(2);
}

const distDir = path.resolve(root, values.get("--dist") ?? "dist");
const bundleDir = path.resolve(root, values.get("--bundle") ?? "dist-edgeone");
const configPath = path.resolve(root, "public", HOSTING_CONFIG_NAME);

try {
  if (modes[0] === "--stage") {
    const { assets, staged } = stageBundle({ distDir, bundleDir, configPath });
    console.log(`EdgeOne bundle staged: ${staged} entries into ${path.relative(root, assets)}`);
  } else {
    const { changed, checked, previous } = prepareBundle({ bundleDir, check: modes[0] === "--check" });
    const state = checked ? "verified" : changed ? "corrected" : "already correct";
    console.log(`EdgeOne routing ${state}: ${path.relative(root, path.join(bundleDir, ".edgeone/routes.json"))}`);
    if (changed) console.log(`  terminal fallback was ${previous.dest ?? "<unset>"} -> /404.html with status 404`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
