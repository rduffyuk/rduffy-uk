#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import {
  collectPublicNotes,
  validateManifest,
} from "./lib/public-build-notes.mjs";
const run = promisify(execFile);
async function main() {
  const args = process.argv.slice(2),
    apply = args.includes("--apply");
  const at = args.indexOf("--config");
  if (at < 0 || !args[at + 1]) throw Error("Supply a private --config file.");
  const config = JSON.parse(await readFile(resolve(args[at + 1]), "utf8"));
  const result = await collectPublicNotes(config.sources, async (path) => {
    try {
      const { stdout } = await run(
        "glab",
        ["api", "--hostname", "gitlab.com", path],
        { maxBuffer: 16 * 1024 * 1024, timeout: 60000 },
      );
      return JSON.parse(stdout);
    } catch {
      throw Error("Private source request failed; existing feed preserved.");
    }
  });
  const target = resolve("src/data/public-build-notes.json");
  const previous = await readFile(target, "utf8");
  validateManifest(JSON.parse(previous));
  const next = JSON.stringify(result.entries, null, 2) + "\n";
  const changed = previous !== next;
  if (apply && changed) {
    const temp = target + ".tmp";
    try {
      await writeFile(temp, next, { mode: 0o600, flag: "wx" });
      await rename(temp, target);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  // Counts only. No private payload, MR IDs, titles, comments, URLs or credentials in logs.
  console.log(
    JSON.stringify({
      status: "ok",
      mode: apply ? "apply" : "check",
      selected: result.selected,
      publicNotes: result.entries.length,
      unapproved: result.unapproved,
      changed,
    }),
  );
}
main().catch((error) => {
  console.error(
    error.message.startsWith("Private source") ||
      error.message.startsWith("Invalid public") ||
      error.message.startsWith("Pagination")
      ? error.message
      : "Public-note export failed; existing feed preserved.",
  );
  process.exitCode = 1;
});
