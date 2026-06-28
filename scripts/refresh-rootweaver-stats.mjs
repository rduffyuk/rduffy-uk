#!/usr/bin/env node
/**
 * refresh-rootweaver-stats.mjs — keep the CV's Rootweaver metrics true to the
 * live platform, automatically. Reads the running cluster + the platform repo +
 * the vault, and updates the cluster-derived figures in rootweaver-stats.json.
 *
 *   live cluster / repo / vault ──(this script)──► src/data/rootweaver-stats.json
 *        │                                              │
 *        └──────────────────── consumed by cv.astro at build (committed snapshot)
 *
 * Runs best ON the K3s node (the desktop): it needs local kubectl, the platform
 * repo on disk, the vault on disk, and in-cluster reach to Qdrant. Cloudflare CI
 * can't do any of that, so — like the liveness feed — the read is committed.
 *
 *     PLATFORM_REPO=/mnt/2tb/rootweaver-platform node scripts/refresh-rootweaver-stats.mjs
 *
 * Safety: only the AUTO_KEYS below are touched, and only when a read SUCCEEDS
 * (returns a positive/non-empty value). Hand-curated fields (embeddingDim,
 * hldModules, …) are preserved, and a transient outage can never zero a stat —
 * it just keeps the last committed value.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "src/data/rootweaver-stats.json";
const PLATFORM_REPO = process.env.PLATFORM_REPO ?? "/mnt/2tb/rootweaver-platform";
const VAULT_ADR_DIR =
  process.env.VAULT_ADR_DIR ?? join(PLATFORM_REPO, "obsidian-vault/09-System/Architecture/ADRs");

// Only these keys are machine-derived; everything else in the JSON is curated.
const AUTO_KEYS = [
  "namespaces",
  "networkPolicies",
  "sealedSecrets",
  "workspacePackages",
  "adrs",
  "qdrantPoints",
  "vllmModel",
  "vllmContextK",
];

function kubectl(args) {
  const ssh = process.env.CLUSTER_SSH;
  return ssh
    ? execFileSync("ssh", [ssh, "kubectl", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    : execFileSync("kubectl", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// Each probe returns a value, or null to mean "couldn't read — keep prior".
const probes = {
  namespaces: () => countLines(kubectl(["get", "ns", "--no-headers"])),
  networkPolicies: () => countLines(kubectl(["get", "netpol", "-A", "--no-headers"])),
  sealedSecrets: () => countLines(kubectl(["get", "sealedsecrets", "-A", "--no-headers"])),

  workspacePackages: () => {
    const pp = join(PLATFORM_REPO, "pyproject.toml");
    if (!existsSync(pp)) return null;
    const block = readFileSync(pp, "utf8").match(/members\s*=\s*\[([\s\S]*?)\]/);
    if (!block) return null;
    const members = [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    const resolved = members.filter((rel) => existsSync(join(PLATFORM_REPO, rel, "pyproject.toml")));
    return resolved.length || null;
  },

  adrs: () => {
    if (!existsSync(VAULT_ADR_DIR)) return null;
    return execFileSync("bash", ["-c", `ls ${VAULT_ADR_DIR}/*.md 2>/dev/null | wc -l`], { encoding: "utf8" }).trim() * 1 || null;
  },

  qdrantPoints: () => {
    const ip = kubectl(["get", "svc", "-n", "rw-data", "qdrant", "-o", "jsonpath={.spec.clusterIP}"]).trim();
    if (!ip) return null;
    // Sum points across every collection (in-cluster reach required).
    const cols = JSON.parse(curl(`http://${ip}:6333/collections`)).result.collections;
    let total = 0;
    for (const c of cols) {
      total += JSON.parse(curl(`http://${ip}:6333/collections/${c.name}`)).result.points_count ?? 0;
    }
    return total || null;
  },

  vllm: () => {
    const json = JSON.parse(kubectl(["get", "sts", "vllm", "-n", "vllm", "-o", "json"]));
    const args = json.spec?.template?.spec?.containers?.[0]?.args ?? [];
    const model = args.find((a) => a.startsWith("--model="))?.split("=")[1];
    const len = args.find((a) => a.startsWith("--max-model-len="))?.split("=")[1];
    return {
      vllmModel: model ? model.split("/").pop() : null,
      vllmContextK: len ? Math.round(Number(len) / 1024) : null,
    };
  },
};

function countLines(s) {
  const n = s.split("\n").filter((l) => l.trim()).length;
  return n || null;
}
function curl(url) {
  const ssh = process.env.CLUSTER_SSH;
  return ssh
    ? execFileSync("ssh", [ssh, "curl", "-s", url], { encoding: "utf8" })
    : execFileSync("curl", ["-s", url], { encoding: "utf8" });
}

// ---- run ----
const stats = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const next = { ...stats };
const updated = [];

for (const [key, fn] of Object.entries(probes)) {
  try {
    const val = fn();
    if (key === "vllm") {
      for (const [k, v] of Object.entries(val)) {
        if (v != null && v !== "" && next[k] !== v) { next[k] = v; updated.push(`${k}=${v}`); }
      }
    } else if (val != null && val !== "" && next[key] !== val) {
      next[key] = val;
      updated.push(`${key}=${val}`);
    }
  } catch (e) {
    console.warn(`[rootweaver-stats] skip ${key}: ${String(e.message).split("\n")[0]}`);
  }
}

// Only AUTO_KEYS may change; never let a probe invent a new field.
for (const k of Object.keys(next)) {
  if (!(k in stats) && !AUTO_KEYS.includes(k) && k !== "generatedAt" && k !== "source") delete next[k];
}
next.generatedAt = new Date().toISOString().slice(0, 10);
next.source = "k3s-live-read";

writeFileSync(OUT, JSON.stringify(next, null, 2) + "\n");
console.log(`[rootweaver-stats] ${updated.length ? "updated " + updated.join(", ") : "no change"} → ${OUT}`);
