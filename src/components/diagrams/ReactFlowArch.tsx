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

const NODE_W = 155;
const NODE_H = 65;

type Zone = "k3s" | "host" | "remote";
const zoneBorder: Record<Zone, string> = {
  k3s: "#3b82f622",
  host: "#94a3b822",
  remote: "#f1f5f922",
};

function ArchNode({ data }: { data: { label: string; sublabel?: string; color: string; icon?: string; zone?: Zone } }) {
  const border = data.zone ? zoneBorder[data.zone] : "#1e293b";
  return (
    <div
      style={{
        background: "#0f0f13",
        border: `1px solid ${data.color}44`,
        borderTop: `3px solid ${data.color}`,
        borderRadius: 10,
        padding: "8px 12px",
        width: NODE_W,
        textAlign: "center",
        boxShadow: `0 0 16px ${data.color}12`,
        outline: `1px solid ${border}`,
        outlineOffset: 3,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.color, width: 5, height: 5 }} />
      {data.icon && <div style={{ fontSize: 15, marginBottom: 2 }}>{data.icon}</div>}
      <div style={{ fontSize: 11, fontWeight: 600, color: data.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.label}</div>
      {data.sublabel && (
        <div style={{ fontSize: 8, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {data.sublabel}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 5, height: 5 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode };

const rawNodes: Node[] = [
  // Host VM
  { id: "vault-files", type: "arch", position: { x: 0, y: 0 }, data: { label: "Obsidian Vault", sublabel: "1,917 files · hostPath", color: "#a855f7", icon: "📂", zone: "host" } },
  { id: "ollama", type: "arch", position: { x: 0, y: 0 }, data: { label: "Ollama", sublabel: "CPU · systemd", color: "#64748b", icon: "🦙", zone: "host" } },
  // Remote
  { id: "user", type: "arch", position: { x: 0, y: 0 }, data: { label: "Claude Code", sublabel: "MCP SSE client", color: "#f1f5f9", icon: "💻", zone: "remote" } },
  // K3s: Search
  { id: "mcp", type: "arch", position: { x: 0, y: 0 }, data: { label: "MCP Bridge", sublabel: ":30002 · 29 tools", color: "#3b82f6", icon: "🔌", zone: "k3s" } },
  { id: "gateway", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Gateway", sublabel: ":30808 · 2 replicas", color: "#a855f7", icon: "🚪", zone: "k3s" } },
  { id: "fast", type: "arch", position: { x: 0, y: 0 }, data: { label: "FastSearch", sublabel: "<1s · keywords", color: "#22c55e", zone: "k3s" } },
  { id: "deep", type: "arch", position: { x: 0, y: 0 }, data: { label: "DeepResearch", sublabel: "~10s · semantic", color: "#ec4899", zone: "k3s" } },
  { id: "oracle", type: "arch", position: { x: 0, y: 0 }, data: { label: "Oracle", sublabel: "15-30s · multi-hop", color: "#ef4444", zone: "k3s" } },
  { id: "retriever", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Retriever", sublabel: ":8001 · 2 replicas", color: "#f97316", icon: "🔍", zone: "k3s" } },
  // K3s: Data
  { id: "qdrant", type: "arch", position: { x: 0, y: 0 }, data: { label: "Qdrant", sublabel: "148K chunks · 2560d", color: "#f97316", icon: "🔮", zone: "k3s" } },
  { id: "falkordb", type: "arch", position: { x: 0, y: 0 }, data: { label: "FalkorDB", sublabel: "7.7K nodes", color: "#f97316", icon: "🕸️", zone: "k3s" } },
  { id: "postgres", type: "arch", position: { x: 0, y: 0 }, data: { label: "vault-postgres", sublabel: "source-of-record", color: "#f97316", icon: "🐘", zone: "k3s" } },
  // K3s: LLM
  { id: "vllm", type: "arch", position: { x: 0, y: 0 }, data: { label: "vLLM", sublabel: "Qwen3-8B · RTX 4080", color: "#ef4444", icon: "🎮", zone: "k3s" } },
  { id: "tei", type: "arch", position: { x: 0, y: 0 }, data: { label: "TEI Embedding", sublabel: "Qwen3-4B · 2560d", color: "#ef4444", zone: "k3s" } },
  // K3s: Indexing
  { id: "file-watcher", type: "arch", position: { x: 0, y: 0 }, data: { label: "File Watcher", sublabel: "inotify → Kafka", color: "#ec4899", icon: "👁️", zone: "k3s" } },
  { id: "kafka", type: "arch", position: { x: 0, y: 0 }, data: { label: "Kafka", sublabel: "10+ topics", color: "#00d4ff", icon: "📬", zone: "k3s" } },
  { id: "ner", type: "arch", position: { x: 0, y: 0 }, data: { label: "NER Consumer", sublabel: "spaCy · KEDA 0→1", color: "#ec4899", zone: "k3s" } },
  { id: "indexer", type: "arch", position: { x: 0, y: 0 }, data: { label: "Vault Indexer", sublabel: "delta consumer", color: "#ec4899", zone: "k3s" } },
  // K3s: Observability
  { id: "prometheus", type: "arch", position: { x: 0, y: 0 }, data: { label: "Prometheus", sublabel: ":30090", color: "#22c55e", icon: "🔥", zone: "k3s" } },
  { id: "grafana", type: "arch", position: { x: 0, y: 0 }, data: { label: "Grafana", sublabel: ":30300", color: "#22c55e", icon: "📊", zone: "k3s" } },
  { id: "tempo", type: "arch", position: { x: 0, y: 0 }, data: { label: "Tempo", sublabel: "traces", color: "#22c55e", icon: "⏱️", zone: "k3s" } },
  // K3s: Infra
  { id: "flux", type: "arch", position: { x: 0, y: 0 }, data: { label: "FluxCD", sublabel: "GitOps → GitLab", color: "#38bdf8", icon: "🔄", zone: "k3s" } },
  { id: "harbor", type: "arch", position: { x: 0, y: 0 }, data: { label: "Harbor", sublabel: "registry :30500", color: "#3b82f6", icon: "🏗️", zone: "k3s" } },
];

const edges: Edge[] = [
  { id: "h1", source: "vault-files", target: "file-watcher", style: { stroke: "#a855f7" } },
  { id: "s1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" } },
  { id: "s2", source: "mcp", target: "gateway", animated: true, style: { stroke: "#a855f7" } },
  { id: "s4", source: "gateway", target: "fast", style: { stroke: "#22c55e" } },
  { id: "s5", source: "gateway", target: "deep", style: { stroke: "#ec4899" } },
  { id: "s6", source: "gateway", target: "oracle", style: { stroke: "#ef4444" } },
  { id: "s7", source: "fast", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "s8", source: "deep", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "s9", source: "oracle", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "d1", source: "retriever", target: "qdrant", animated: true, style: { stroke: "#f97316" } },
  { id: "d2", source: "retriever", target: "falkordb", animated: true, style: { stroke: "#f97316" } },
  { id: "d3", source: "retriever", target: "postgres", style: { stroke: "#f97316", strokeDasharray: "4 4" } },
  { id: "l1", source: "gateway", target: "vllm", animated: true, style: { stroke: "#ef4444" } },
  { id: "l2", source: "tei", target: "qdrant", style: { stroke: "#ef4444", strokeDasharray: "4 4" } },
  { id: "i1", source: "file-watcher", target: "kafka", animated: true, style: { stroke: "#00d4ff" } },
  { id: "i2", source: "kafka", target: "ner", style: { stroke: "#ec4899" } },
  { id: "i3", source: "ner", target: "indexer", style: { stroke: "#ec4899" } },
  { id: "i4", source: "indexer", target: "qdrant", animated: true, style: { stroke: "#f97316" } },
  { id: "i5", source: "indexer", target: "postgres", style: { stroke: "#f97316" } },
  { id: "o1", source: "prometheus", target: "grafana", style: { stroke: "#22c55e" } },
  { id: "o2", source: "prometheus", target: "tempo", style: { stroke: "#22c55e" } },
  { id: "f1", source: "flux", target: "harbor", style: { stroke: "#3b82f6" } },
];

function layoutWithDagre(nodes: Node[], edgeList: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 70, ranksep: 90, marginx: 50, marginy: 50 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W + 30, height: NODE_H + 15 });
  }
  for (const e of edgeList) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

function Legend() {
  const items = [
    { label: "K3s Cluster", sublabel: "RTX 4080 · 64GB · 29 ns", color: "#3b82f6" },
    { label: "Host VM", sublabel: "100.113.76.79 · systemd", color: "#94a3b8" },
    { label: "MacBook", sublabel: "Tailscale mesh", color: "#f1f5f9" },
  ];
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, border: `2px solid ${item.color}`, background: `${item.color}20` }} />
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: item.color }}>{item.label}</span>
            <span style={{ fontSize: 9, color: "#64748b", marginLeft: 6, fontFamily: "JetBrains Mono, monospace" }}>{item.sublabel}</span>
          </div>
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
          <div style={{ background: "rgba(9,9,11,0.9)", backdropFilter: "blur(12px)", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 16px" }}>
            <Legend />
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
