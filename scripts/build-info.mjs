// Emits build-environment facts to a static file served at /build-info.json.
// Lets us confirm WHICH Node/commit Cloudflare actually built with — the live
// site is otherwise a black box for build diagnostics.
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });

// Decisive test: can headless Chromium actually launch in this build env?
// rehype-mermaid (strategy: inline-svg) depends on it; if it can't launch here
// but can locally, that's the platform-specific cause of empty content bodies.
let chromium = { ok: false, error: null };
try {
  const { chromium: cr } = await import("playwright");
  const b = await cr.launch();
  await b.close();
  chromium.ok = true;
} catch (e) {
  chromium.error = String(e?.message || e).slice(0, 300);
}

const info = {
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  chromium,
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
