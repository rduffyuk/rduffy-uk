// Emits build-environment facts to a static file served at /build-info.json.
// Lets us confirm WHICH Node/commit Cloudflare actually built with — the live
// site is otherwise a black box for build diagnostics.
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
const info = {
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  // Cloudflare Workers Builds / Pages expose the commit SHA under varying names.
  sha:
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "unknown",
  builtAt: new Date().toISOString(),
};
writeFileSync("public/build-info.json", JSON.stringify(info, null, 2) + "\n");
console.log("[build-info]", JSON.stringify(info));
