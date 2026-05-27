import { useMemo, useState, useEffect } from "react";
import dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const NODE_W = 155;
const NODE_H = 62;

function useIsDark() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    function check() {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light") return setDark(false);
      if (attr === "dark") return setDark(true);
      setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    check();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", check); observer.disconnect(); };
  }, []);
  return dark;
}

function ArchNode({ data }: { data: { label: string; sublabel?: string; color: string; icon?: string } }) {
  const dark = useIsDark();
  return (
    <div style={{
      background: dark ? "#0f0f13" : "#ffffff", border: `1px solid ${data.color}44`, borderTop: `3px solid ${data.color}`,
      borderRadius: 10, padding: "8px 12px", width: NODE_W, textAlign: "center",
      boxShadow: `0 0 16px ${data.color}${dark ? "12" : "20"}`,
    }}>
      <Handle type="target" position={Position.Top} style={{ background: data.color, width: 5, height: 5 }} />
      {data.icon && <div style={{ fontSize: 15, marginBottom: 2 }}>{data.icon}</div>}
      <div style={{ fontSize: 11, fontWeight: 600, color: data.color }}>{data.label}</div>
      {data.sublabel && (
        <div style={{ fontSize: 8, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", marginTop: 1 }}>{data.sublabel}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 5, height: 5 }} />
    </div>
  );
}

function KafkaBus({ data }: { data: { label: string; topics: string[]; color: string } }) {
  const dark = useIsDark();
  return (
    <div style={{
      background: dark ? "#0f0f13" : "#ffffff", border: `2px solid ${data.color}66`, borderRadius: 12,
      padding: "10px 20px", minWidth: 280, textAlign: "center",
    }}>
      <Handle type="target" position={Position.Top} style={{ background: data.color, width: 5, height: 5 }} />
      <div style={{ fontSize: 12, fontWeight: 700, color: data.color, marginBottom: 6 }}>📬 {data.label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {data.topics.map((t) => (
          <span key={t} style={{
            fontSize: 8, fontFamily: "JetBrains Mono, monospace", padding: "2px 6px",
            borderRadius: 4, border: `1px solid ${data.color}44`, color: data.color, background: `${data.color}10`,
          }}>{t}</span>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 5, height: 5 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode, kafka: KafkaBus };

function layoutDagre(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80, marginx: 30, marginy: 30 });
  for (const n of nodes) {
    const w = n.type === "kafka" ? 300 : NODE_W + 20;
    const h = n.type === "kafka" ? 80 : NODE_H + 10;
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    const w = n.type === "kafka" ? 300 : NODE_W;
    const h = n.type === "kafka" ? 80 : NODE_H;
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

const lbl = (fill: string) => ({ fill, fontSize: 8 });

// ==========================================
// DIAGRAM 1: SEARCH FLOW
// ==========================================
const searchNodes: Node[] = [
  { id: "user", type: "arch", position: { x: 0, y: 0 }, data: { label: "Claude Code", sublabel: "user query via MCP SSE", color: "#f1f5f9", icon: "💻" } },
  { id: "mcp", type: "arch", position: { x: 0, y: 0 }, data: { label: "MCP Bridge", sublabel: ":30002 · 29 tools", color: "#3b82f6", icon: "🔌" } },
  { id: "gateway", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Gateway", sublabel: ":30808 · 2 replicas · cache 73%", color: "#a855f7", icon: "🚪" } },
  { id: "vllm", type: "arch", position: { x: 0, y: 0 }, data: { label: "vLLM", sublabel: "Qwen3-8B-AWQ · RTX 4080", color: "#ef4444", icon: "🎮" } },
  { id: "fast", type: "arch", position: { x: 0, y: 0 }, data: { label: "FastSearch", sublabel: "<1s · BM25 keywords", color: "#22c55e" } },
  { id: "deep", type: "arch", position: { x: 0, y: 0 }, data: { label: "DeepResearch", sublabel: "~10s · semantic + rerank", color: "#ec4899" } },
  { id: "oracle", type: "arch", position: { x: 0, y: 0 }, data: { label: "Oracle", sublabel: "15-30s · multi-hop + LLM", color: "#ef4444" } },
  { id: "retriever", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Retriever", sublabel: ":8001 · hybrid + rerank", color: "#f97316", icon: "🔍" } },
  { id: "qdrant", type: "arch", position: { x: 0, y: 0 }, data: { label: "Qdrant", sublabel: "148K chunks · 2560d", color: "#f97316", icon: "🔮" } },
  { id: "falkordb", type: "arch", position: { x: 0, y: 0 }, data: { label: "FalkorDB", sublabel: "7.7K nodes · graph", color: "#f97316", icon: "🕸️" } },
  { id: "ollama", type: "arch", position: { x: 0, y: 0 }, data: { label: "Ollama", sublabel: "CPU fallback · host", color: "#64748b", icon: "🦙" } },
];

const searchEdges: Edge[] = [
  { id: "q1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" }, label: "SSE", labelStyle: lbl("#64748b") },
  { id: "q2", source: "mcp", target: "gateway", animated: true, style: { stroke: "#a855f7" }, label: "HTTP", labelStyle: lbl("#64748b") },
  { id: "q3", source: "gateway", target: "fast", style: { stroke: "#22c55e" }, label: "simple", labelStyle: lbl("#64748b") },
  { id: "q4", source: "gateway", target: "deep", style: { stroke: "#ec4899" }, label: "complex", labelStyle: lbl("#64748b") },
  { id: "q5", source: "gateway", target: "oracle", style: { stroke: "#ef4444" }, label: "research", labelStyle: lbl("#64748b") },
  { id: "q6", source: "gateway", target: "vllm", animated: true, style: { stroke: "#ef4444" }, label: "LLM inference", labelStyle: lbl("#64748b") },
  { id: "q7", source: "fast", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "q8", source: "deep", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "q9", source: "oracle", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "q10", source: "retriever", target: "qdrant", animated: true, style: { stroke: "#f97316" }, label: "vector search", labelStyle: lbl("#64748b") },
  { id: "q11", source: "retriever", target: "falkordb", animated: true, style: { stroke: "#f97316" }, label: "graph query", labelStyle: lbl("#64748b") },
  { id: "q12", source: "retriever", target: "ollama", style: { stroke: "#64748b", strokeDasharray: "4 4" }, label: "fallback", labelStyle: lbl("#64748b") },
];

// ==========================================
// DIAGRAM 2: INDEXING + GITOPS PIPELINE
// ==========================================
const indexNodes: Node[] = [
  { id: "vault", type: "arch", position: { x: 0, y: 0 }, data: { label: "Obsidian Vault", sublabel: "1,917 files · inotify", color: "#a855f7", icon: "📂" } },
  { id: "gitlab", type: "arch", position: { x: 0, y: 0 }, data: { label: "GitLab", sublabel: "SCM · CI/CD · source of truth", color: "#f97316", icon: "🦊" } },
  { id: "watcher", type: "arch", position: { x: 0, y: 0 }, data: { label: "File Watcher", sublabel: "detects changes → produce", color: "#ec4899", icon: "👁️" } },
  { id: "kafka", type: "kafka", position: { x: 0, y: 0 }, data: { label: "Kafka Event Bus", color: "#00d4ff", topics: ["vault.file-events", "vault.file-tagged", "vault.connector-docs", "sre.alerts"] } },
  { id: "ner", type: "arch", position: { x: 0, y: 0 }, data: { label: "NER Consumer", sublabel: "spaCy + YAKE → auto-tag", color: "#ec4899" } },
  { id: "indexer", type: "arch", position: { x: 0, y: 0 }, data: { label: "Vault Indexer", sublabel: "embed + store chunks", color: "#ec4899" } },
  { id: "tei", type: "arch", position: { x: 0, y: 0 }, data: { label: "TEI Embedding", sublabel: "Qwen3-4B · 2560d", color: "#ef4444" } },
  { id: "qdrant2", type: "arch", position: { x: 0, y: 0 }, data: { label: "Qdrant", sublabel: "148K chunks · 2560d", color: "#f97316", icon: "🔮" } },
  { id: "postgres", type: "arch", position: { x: 0, y: 0 }, data: { label: "vault-postgres", sublabel: "source-of-record metadata", color: "#f97316", icon: "🐘" } },
  { id: "flux", type: "arch", position: { x: 0, y: 0 }, data: { label: "FluxCD", sublabel: "GitOps auto-reconcile", color: "#38bdf8", icon: "🔄" } },
  { id: "harbor", type: "arch", position: { x: 0, y: 0 }, data: { label: "Harbor", sublabel: "container registry :30500", color: "#3b82f6", icon: "🏗️" } },
  { id: "prometheus", type: "arch", position: { x: 0, y: 0 }, data: { label: "Prometheus", sublabel: "metrics → Grafana + Tempo", color: "#22c55e", icon: "🔥" } },
];

const indexEdges: Edge[] = [
  { id: "p1", source: "vault", target: "watcher", style: { stroke: "#a855f7" }, label: "inotify", labelStyle: lbl("#64748b") },
  { id: "p2", source: "watcher", target: "kafka", animated: true, style: { stroke: "#00d4ff" }, label: "vault.file-events", labelStyle: lbl("#00d4ff") },
  { id: "p3", source: "kafka", target: "ner", style: { stroke: "#ec4899" }, label: "consume", labelStyle: lbl("#64748b") },
  { id: "p4", source: "ner", target: "kafka", style: { stroke: "#00d4ff", strokeDasharray: "4 4" }, label: "vault.file-tagged", labelStyle: lbl("#00d4ff") },
  { id: "p5", source: "kafka", target: "indexer", style: { stroke: "#ec4899" }, label: "consume", labelStyle: lbl("#64748b") },
  { id: "p6", source: "indexer", target: "tei", style: { stroke: "#ef4444" }, label: "embed text", labelStyle: lbl("#64748b") },
  { id: "p7", source: "tei", target: "qdrant2", animated: true, style: { stroke: "#f97316" }, label: "store vectors", labelStyle: lbl("#64748b") },
  { id: "p8", source: "indexer", target: "postgres", style: { stroke: "#f97316" }, label: "store metadata", labelStyle: lbl("#64748b") },
  { id: "p9", source: "kafka", target: "prometheus", style: { stroke: "#22c55e", strokeDasharray: "4 4" }, label: "sre.alerts", labelStyle: lbl("#22c55e") },
  { id: "g1", source: "gitlab", target: "flux", style: { stroke: "#38bdf8" }, label: "git push → reconcile", labelStyle: lbl("#64748b") },
  { id: "g2", source: "gitlab", target: "harbor", style: { stroke: "#3b82f6" }, label: "CI → build image", labelStyle: lbl("#64748b") },
];

function DiagramPanel({ nodes, edges, title, accent, height }: { nodes: Node[]; edges: Edge[]; title: string; accent: string; height: number }) {
  const layouted = useMemo(() => layoutDagre(nodes, edges), []);
  const dark = useIsDark();
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 20, height: 3, background: accent, borderRadius: 2 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: accent, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</span>
      </div>
      <div style={{ width: "100%", height, borderRadius: 12, overflow: "hidden", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}` }}>
        <ReactFlow
          nodes={layouted}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          colorMode={dark ? "dark" : "light"}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "bezier" }}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
        >
          <Background color={dark ? "#1e293b" : "#e2e8f0"} gap={24} size={1} />
          <Controls showInteractive={false} style={{ background: dark ? "#0f0f13" : "#fff", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`, borderRadius: 8 }} />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function ReactFlowArch() {
  return (
    <div>
      <DiagramPanel
        nodes={searchNodes}
        edges={searchEdges}
        title="Search Flow — User Query → Response"
        accent="#a855f7"
        height={550}
      />
      <DiagramPanel
        nodes={indexNodes}
        edges={indexEdges}
        title="Data Pipeline — Indexing + GitOps"
        accent="#00d4ff"
        height={550}
      />
    </div>
  );
}
