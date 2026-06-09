#!/usr/bin/env node
/**
 * sync-adrs.mjs — pull curated ADRs from the platform repo into src/content/adrs/.
 *
 * Reads adr/*.md from a local checkout (ADR_SOURCE_DIR) or the GitLab API
 * (GITLAB_TOKEN + ADR_GITLAB_PROJECT). Only files whose frontmatter contains
 * `public: true` are copied — everything else never leaves the platform repo.
 *
 * Usage:
 *   ADR_SOURCE_DIR=../rootweaver/adr node scripts/sync-adrs.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const sourceDir = process.env.ADR_SOURCE_DIR;
const outDir = "src/content/adrs";

if (!sourceDir) {
  console.log("[sync-adrs] ADR_SOURCE_DIR not set — keeping existing src/content/adrs/ as is");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
let copied = 0;

for (const file of readdirSync(sourceDir)) {
  if (!file.endsWith(".md")) continue;
  const content = readFileSync(join(sourceDir, file), "utf8");
  // frontmatter must explicitly opt in
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm || !/^public:\s*true\s*$/m.test(fm[1])) continue;
  writeFileSync(join(outDir, basename(file)), content);
  copied++;
}

console.log(`[sync-adrs] copied ${copied} public ADRs from ${sourceDir}`);
