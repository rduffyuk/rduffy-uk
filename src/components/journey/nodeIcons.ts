import type { PositionedNode } from "./types";

export type NodeIconKind =
  | "agent"
  | "benchmark"
  | "chart"
  | "chip"
  | "cluster"
  | "connector"
  | "database"
  | "decision"
  | "docs"
  | "gateway"
  | "loop"
  | "memory"
  | "policy"
  | "search"
  | "security"
  | "stream"
  | "web"
  | "workflow";

export interface NodeIconSpec {
  kind: NodeIconKind;
  glyph: string;
  abbr: string;
}

type NodeIconRule = {
  match: RegExp;
  spec: NodeIconSpec;
};

const rules: NodeIconRule[] = [
  { match: /obsidian|vault/i, spec: icon("docs", "▤", "NOTE") },
  {
    match: /chroma|qdrant|falkor|postgres/i,
    spec: icon("database", "▦", "DB"),
  },
  {
    match: /kafka|flink|parser|watcher|ner consumer/i,
    spec: icon("stream", "⇢", "BUS"),
  },
  { match: /vllm|gpu|ollama|tei/i, spec: icon("chip", "▣", "GPU") },
  {
    match: /prometheus|grafana|dora|tempo|loki|alertmanager|monitor/i,
    spec: icon("chart", "▥", "OBS"),
  },
  { match: /^adr-\d+/i, spec: icon("decision", "◇", "ADR") },
  {
    match: /flux|keda|prefect|jira|confluence|linkedin|scout/i,
    spec: icon("loop", "↻", "FLOW"),
  },
  {
    match: /harbor|sealed|network|opa|unleash/i,
    spec: icon("security", "◈", "SEC"),
  },
  { match: /k3s|cluster|workspace/i, spec: icon("cluster", "⎈", "K8S") },
  { match: /mcp|gateway|perplexity/i, spec: icon("gateway", "⇄", "GW") },
  {
    match: /fastsearch|deepresearch|reranker|retriever|temporal|dat|embedding/i,
    spec: icon("search", "⌕", "RAG"),
  },
  { match: /router|agent|sre|pdg/i, spec: icon("agent", "✦", "AI") },
  { match: /connector/i, spec: icon("connector", "⛓", "CONN") },
  { match: /memory/i, spec: icon("memory", "∞", "MEM") },
  { match: /benchmark/i, spec: icon("benchmark", "✓", "EVAL") },
  { match: /rduffy\.uk|website/i, spec: icon("web", "WWW", "WEB") },
];

const groupFallbacks: Record<string, NodeIconSpec> = {
  core: icon("agent", "✦", "CORE"),
  database: icon("database", "▦", "DB"),
  decision: icon("decision", "◇", "ADR"),
  gpu: icon("chip", "▣", "GPU"),
  infra: icon("cluster", "⎈", "INF"),
  monitoring: icon("chart", "▥", "OBS"),
  workflow: icon("workflow", "↻", "FLOW"),
};

function icon(kind: NodeIconKind, glyph: string, abbr: string): NodeIconSpec {
  return { kind, glyph, abbr };
}

// Stable module-level terminal fallback so unmatched nodes return a constant
// reference (avoids re-allocating a CanvasTexture on every re-render — verifier nit).
const TERMINAL_FALLBACK = icon("workflow", "•", "NODE");

export function getNodeIconSpec(
  node: Pick<PositionedNode, "label" | "group">,
): NodeIconSpec {
  const label = node.label.trim();
  const rule = rules.find(({ match }) => match.test(label));
  return rule?.spec ?? groupFallbacks[node.group] ?? TERMINAL_FALLBACK;
}
