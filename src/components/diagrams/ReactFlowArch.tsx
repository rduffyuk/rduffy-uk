import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const NODE_W = 160;
const NODE_H = 65;

function ArchNode({ data }: { data: { label: string; sublabel?: string; color: string; icon?: string } }) {
  return (
    <div style={{
      background: "#0f0f13", border: `1px solid ${data.color}44`, borderTop: `3px solid ${data.color}`,
      borderRadius: 10, padding: "8px 12px", width: NODE_W, textAlign: "center",
      boxShadow: `0 0 16px ${data.color}12`,
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
  return (
    <div style={{
      background: "#0f0f13", border: `2px solid ${data.color}66`, borderRadius: 12,
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

// ====== TWO DATA FLOWS ======

// FLOW 1: User Search (query → response)
const searchNodes: Node[] = [
  { id: "user", type: "arch", position: { x: 0, y: 0 }, data: { label: "Claude Code", sublabel: "user query via MCP SSE", color: "#f1f5f9", icon: "💻" } },
  { id: "mcp", type: "arch", position: { x: 0, y: 0 }, data: { label: "MCP Bridge", sublabel: ":30002 · routes to 29 tools", color: "#3b82f6", icon: "🔌" } },
  { id: "gateway", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Gateway", sublabel: ":30808 · 2 replicas · cache 73%", color: "#a855f7", icon: "🚪" } },
  { id: "vllm", type: "arch", position: { x: 0, y: 0 }, data: { label: "vLLM", sublabel: "Qwen3-8B-AWQ · RTX 4080", color: "#ef4444", icon: "🎮" } },
  { id: "fast", type: "arch", position: { x: 0, y: 0 }, data: { label: "FastSearch", sublabel: "<1s · BM25 keywords", color: "#22c55e" } },
  { id: "deep", type: "arch", position: { x: 0, y: 0 }, data: { label: "DeepResearch", sublabel: "~10s · semantic + rerank", color: "#ec4899" } },
  { id: "oracle", type: "arch", position: { x: 0, y: 0 }, data: { label: "Oracle", sublabel: "15-30s · multi-hop + LLM", color: "#ef4444" } },
  { id: "retriever", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Retriever", sublabel: ":8001 · hybrid search + rerank", color: "#f97316", icon: "🔍" } },
  { id: "qdrant", type: "arch", position: { x: 0, y: 0 }, data: { label: "Qdrant", sublabel: "148K chunks · Qwen3 2560d", color: "#f97316", icon: "🔮" } },
  { id: "falkordb", type: "arch", position: { x: 0, y: 0 }, data: { label: "FalkorDB", sublabel: "7.7K nodes · graph queries", color: "#f97316", icon: "🕸️" } },
];

// FLOW 2: Data Indexing Pipeline (vault changes → indexed)
const indexNodes: Node[] = [
  { id: "vault", type: "arch", position: { x: 0, y: 0 }, data: { label: "Obsidian Vault", sublabel: "1,917 files · inotify watch", color: "#a855f7", icon: "📂" } },
  { id: "file-watcher", type: "arch", position: { x: 0, y: 0 }, data: { label: "File Watcher", sublabel: "detects changes → produce", color: "#ec4899", icon: "👁️" } },
  { id: "kafka", type: "kafka", position: { x: 0, y: 0 }, data: {
    label: "Kafka Event Bus",
    color: "#00d4ff",
    topics: ["vault.file-events", "vault.file-tagged", "vault.connector-docs", "sre.alerts"],
  }},
  { id: "ner", type: "arch", position: { x: 0, y: 0 }, data: { label: "NER Consumer", sublabel: "spaCy + YAKE → auto-tag", color: "#ec4899" } },
  { id: "indexer", type: "arch", position: { x: 0, y: 0 }, data: { label: "Vault Indexer", sublabel: "embed + store chunks", color: "#ec4899" } },
  { id: "tei", type: "arch", position: { x: 0, y: 0 }, data: { label: "TEI Embedding", sublabel: "Qwen3-4B · 2560d vectors", color: "#ef4444" } },
  { id: "postgres", type: "arch", position: { x: 0, y: 0 }, data: { label: "vault-postgres", sublabel: "source-of-record metadata", color: "#f97316", icon: "🐘" } },
];

// Supporting services
const infraNodes: Node[] = [
  { id: "prometheus", type: "arch", position: { x: 0, y: 0 }, data: { label: "Prometheus", sublabel: "metrics → Grafana + Tempo", color: "#22c55e", icon: "🔥" } },
  { id: "gitlab", type: "arch", position: { x: 0, y: 0 }, data: { label: "GitLab", sublabel: "SCM · CI/CD · source of truth", color: "#f97316", icon: "🦊" } },
  { id: "flux", type: "arch", position: { x: 0, y: 0 }, data: { label: "FluxCD", sublabel: "GitOps auto-reconcile", color: "#38bdf8", icon: "🔄" } },
  { id: "harbor", type: "arch", position: { x: 0, y: 0 }, data: { label: "Harbor", sublabel: "container registry :30500", color: "#3b82f6", icon: "🏗️" } },
  { id: "ollama", type: "arch", position: { x: 0, y: 0 }, data: { label: "Ollama", sublabel: "CPU fallback · host systemd", color: "#64748b", icon: "🦙" } },
];

const rawNodes: Node[] = [...searchNodes, ...indexNodes, ...infraNodes];

const edges: Edge[] = [
  // === SEARCH FLOW: user query path ===
  { id: "q1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" }, label: "SSE", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "q2", source: "mcp", target: "gateway", animated: true, style: { stroke: "#a855f7" }, label: "HTTP", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "q3", source: "gateway", target: "fast", style: { stroke: "#22c55e" }, label: "simple", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "q4", source: "gateway", target: "deep", style: { stroke: "#ec4899" }, label: "complex", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "q5", source: "gateway", target: "oracle", style: { stroke: "#ef4444" }, label: "research", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "q6", source: "gateway", target: "vllm", animated: true, style: { stroke: "#ef4444" }, label: "LLM inference", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "q7", source: "fast", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "q8", source: "deep", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "q9", source: "oracle", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "q10", source: "retriever", target: "qdrant", animated: true, style: { stroke: "#f97316" }, label: "vector search", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "q11", source: "retriever", target: "falkordb", animated: true, style: { stroke: "#f97316" }, label: "graph query", labelStyle: { fill: "#64748b", fontSize: 8 } },

  // === INDEXING FLOW: data pipeline ===
  { id: "p1", source: "vault", target: "file-watcher", style: { stroke: "#a855f7" }, label: "inotify", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "p2", source: "file-watcher", target: "kafka", animated: true, style: { stroke: "#00d4ff" }, label: "vault.file-events", labelStyle: { fill: "#00d4ff", fontSize: 8 } },
  { id: "p3", source: "kafka", target: "ner", style: { stroke: "#ec4899" }, label: "consume", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "p4", source: "ner", target: "kafka", style: { stroke: "#00d4ff", strokeDasharray: "4 4" }, label: "vault.file-tagged", labelStyle: { fill: "#00d4ff", fontSize: 8 } },
  { id: "p5", source: "kafka", target: "indexer", style: { stroke: "#ec4899" }, label: "consume", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "p6", source: "indexer", target: "tei", style: { stroke: "#ef4444" }, label: "embed text", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "p7", source: "tei", target: "qdrant", animated: true, style: { stroke: "#f97316" }, label: "store vectors", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "p8", source: "indexer", target: "postgres", style: { stroke: "#f97316" }, label: "store metadata", labelStyle: { fill: "#64748b", fontSize: 8 } },

  // === INFRA / GITOPS ===
  { id: "i1", source: "kafka", target: "prometheus", style: { stroke: "#22c55e", strokeDasharray: "4 4" }, label: "sre.alerts", labelStyle: { fill: "#22c55e", fontSize: 8 } },
  { id: "g1", source: "gitlab", target: "flux", style: { stroke: "#38bdf8" }, label: "git push → reconcile", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "g2", source: "gitlab", target: "harbor", style: { stroke: "#3b82f6" }, label: "CI → build image", labelStyle: { fill: "#64748b", fontSize: 8 } },
  { id: "g3", source: "flux", target: "gateway", style: { stroke: "#38bdf8", strokeDasharray: "4 4" }, label: "deploy manifests", labelStyle: { fill: "#64748b", fontSize: 8 } },
];

function layoutWithDagre(nodes: Node[], edgeList: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100, marginx: 50, marginy: 50 });

  for (const n of nodes) {
    const w = n.type === "kafka" ? 300 : NODE_W + 30;
    const h = n.type === "kafka" ? 85 : NODE_H + 15;
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edgeList) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const w = node.type === "kafka" ? 300 : NODE_W;
    const h = node.type === "kafka" ? 85 : NODE_H;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

function Legend() {
  const flows = [
    { label: "Search Flow", desc: "User query → agents → retrieval → response", color: "#a855f7" },
    { label: "Index Pipeline", desc: "Vault changes → Kafka → NER → embed → store", color: "#00d4ff" },
    { label: "Animated edge", desc: "= active data flow", color: "#f97316" },
    { label: "Dashed edge", desc: "= feedback / secondary", color: "#94a3b8" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {flows.map((f) => (
        <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 2, background: f.color, borderRadius: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: f.color }}>{f.label}</span>
          <span style={{ fontSize: 9, color: "#64748b" }}>{f.desc}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReactFlowArch() {
  const layoutedNodes = useMemo(() => layoutWithDagre(rawNodes, edges), []);

  return (
    <div style={{ width: "100%", height: "calc(100vh - 180px)", minHeight: 550, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={layoutedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background color="#1e293b" gap={24} size={1} />
        <Controls showInteractive={false} style={{ background: "#0f0f13", border: "1px solid #1e293b", borderRadius: 8 }} />
        <Panel position="top-left">
          <div style={{ background: "rgba(9,9,11,0.9)", backdropFilter: "blur(12px)", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 14px" }}>
            <Legend />
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
