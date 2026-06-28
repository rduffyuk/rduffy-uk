#!/usr/bin/env node
/**
 * refresh-cluster-liveness.mjs — derive journey node liveness from the LIVE
 * cluster, so the journey graph dims retired components automatically instead
 * of by hand-maintained flags.
 *
 *   live K3s workloads  ──(this script, run where the cluster is reachable)──►
 *   src/data/journey-liveness.json  { generatedAt, retired: [nodeId, …] }
 *        │
 *        └─ consumed by build-journey.mjs at build time (Cloudflare CI can't
 *           reach the cluster, so it reads this committed snapshot).
 *
 * Reachability: the deploy runs in CI with no route to the home cluster, so the
 * read happens here and the result is committed. Run on a machine on the mesh:
 *
 *     CLUSTER_SSH="user@host" pnpm run refresh:liveness   # via ssh + kubectl
 *     pnpm run refresh:liveness                            # local kubeconfig
 *
 * Privacy: this repo is public. We match workloads by NAME only (qdrant, kafka,
 * harbor — already shown on the journey), never embedding cluster hostnames or
 * namespaces, and the committed JSON contains only retired node ids.
 *
 * Liveness rule: live = the workload OBJECT EXISTS in the cluster, regardless of
 * replica count. A decommissioned component is deleted (no manifest); an idle one
 * keeps its manifest at 0 replicas — e.g. KEDA scale-to-zero (opa) or KEDA
 * ScaledJobs (scout) sit at 0 but are still live. So existence, not replica
 * count, is the signal; that also stops a restart blip from darkening a node.
 * A node is retired only when NO matching workload object exists. Nodes with no
 * mapping are conceptual/external (NetworkPolicies, the website) and always live.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = "src/data/journey-liveness.json";

// journey node id → workload name substrings that prove it's running. Matched
// against live workload names across all namespaces. Names only — no topology.
const NODE_WORKLOADS = {
  vault: ["vault-indexer", "vault-postgres"],
  chromadb: ["chroma"],
  "fast-agent": ["rag-gateway"],
  "deep-agent": ["rag-gateway"],
  router: ["rag-gateway"],
  temporal: ["rag-gateway"],
  reranker: ["rag-retriever"],
  retriever: ["rag-retriever"],
  "rag-gateway": ["rag-gateway"],
  "gpu-monitor": ["gpu-exporter", "dcgm"],
  perplexity: ["perplexit"],
  "mcp-bridge": ["mcp-bridge"],
  flux: ["kustomize-controller", "source-controller"],
  prefect: ["prefect-server"],
  vllm: ["vllm"],
  pdg: ["pdg-"],
  opa: ["opa"],
  dora: ["dora-"],
  jira: ["jira-sync", "connector-jira"],
  confluence: ["confluence"],
  harbor: ["harbor-core"],
  "sealed-secrets": ["sealed-secrets"],
  qdrant: ["qdrant"],
  falkordb: ["falkordb"],
  embedding: ["tei-embedding"],
  tei: ["tei-embedding"],
  prometheus: ["prometheus"],
  grafana: ["grafana"],
  tempo: ["tempo"],
  loki: ["loki"],
  alertmanager: ["alertmanager"],
  kafka: ["kafka-cluster", "strimzi"],
  "file-watcher": ["file-watcher"],
  scout: ["scout-"],
  unleash: ["unleash"],
  connectors: ["connector-"],
  keda: ["keda-operator"],
  flink: ["flink-"],
  "journal-parser": ["journal-session-parser"],
  memory: ["mcp-memory", "memory-writer"],
  postgres: ["postgres"],
  "sre-agent": ["sre-brain"],
};

// Pinned live regardless of the probe: dormant-but-intentional fallbacks that
// can be spun up on demand. Ollama is the CPU inference fallback behind vLLM.
const PINNED_LIVE = new Set(["ollama"]);

function kubectlJson(resources) {
  const args = ["get", resources, "-A", "-o", "json"];
  const ssh = process.env.CLUSTER_SSH;
  try {
    const out = ssh
      ? execFileSync("ssh", [ssh, "kubectl", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      : execFileSync("kubectl", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out).items ?? [];
  } catch (e) {
    // Tolerate missing CRDs (e.g. KEDA not installed in a fork) — just skip them.
    console.warn(`[refresh-liveness] skip "${resources}": ${e.message.split("\n")[0]}`);
    return [];
  }
}

// Names of every workload object that exists (KEDA scaledjobs/scaledobjects
// included, since scale-to-zero workloads still have a manifest = still live).
const items = [
  ...kubectlJson("deploy,statefulset,daemonset,cronjob"),
  ...kubectlJson("scaledjob.keda.sh,scaledobject.keda.sh"),
];
const live = new Set(items.map((it) => it.metadata?.name).filter(Boolean));

const retired = [];
for (const [nodeId, patterns] of Object.entries(NODE_WORKLOADS)) {
  if (PINNED_LIVE.has(nodeId)) continue;
  const alive = patterns.some((p) => [...live].some((n) => n.includes(p)));
  if (!alive) retired.push(nodeId);
}
retired.sort();

writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), source: "k3s-live-read", retired }, null, 2) + "\n",
);
console.log(`[refresh-liveness] ${live.size} live workloads → ${retired.length} retired node(s): ${retired.join(", ") || "none"} → ${OUT}`);
