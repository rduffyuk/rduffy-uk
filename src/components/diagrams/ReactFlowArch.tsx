import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

function ArchNode({ data }: { data: { label: string; sublabel?: string; color: string; icon?: string; wide?: boolean } }) {
  return (
    <div
      style={{
        background: "#0f0f13",
        border: `1px solid ${data.color}44`,
        borderRadius: 10,
        padding: "8px 14px",
        minWidth: data.wide ? 170 : 130,
        textAlign: "center",
        boxShadow: `0 0 16px ${data.color}12`,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.color, width: 5, height: 5 }} />
      <Handle type="target" position={Position.Left} id="left-in" style={{ background: data.color, width: 5, height: 5 }} />
      {data.icon && <div style={{ fontSize: 16, marginBottom: 2 }}>{data.icon}</div>}
      <div style={{ fontSize: 11, fontWeight: 600, color: data.color }}>{data.label}</div>
      {data.sublabel && (
        <div style={{ fontSize: 9, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", marginTop: 1 }}>
          {data.sublabel}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 5, height: 5 }} />
      <Handle type="source" position={Position.Right} id="right-out" style={{ background: data.color, width: 5, height: 5 }} />
    </div>
  );
}

function ZoneBox({ data }: { data: { label: string; sublabel?: string; color: string; width: number; height: number } }) {
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        border: `1.5px dashed ${data.color}40`,
        borderRadius: 16,
        background: `${data.color}06`,
        pointerEvents: "none" as const,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 14,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          color: data.color,
          opacity: 0.7,
        }}
      >
        {data.label}
      </div>
      {data.sublabel && (
        <div
          style={{
            position: "absolute",
            top: 22,
            left: 14,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 8,
            color: "#64748b",
          }}
        >
          {data.sublabel}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ data }: { data: { label: string; color: string } }) {
  return (
    <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.15em", textTransform: "uppercase" as const, color: data.color, opacity: 0.6, pointerEvents: "none" as const }}>
      {data.label}
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode, zone: ZoneBox, label: GroupLabel };

// === ZONE BOXES (behind everything) ===
const zoneNodes: Node[] = [
  {
    id: "zone-k3s",
    type: "zone",
    position: { x: -130, y: 55 },
    data: { label: "⚙️ K3s Cluster", sublabel: "Desktop · 100.113.76.79 · RTX 4080 · 64GB RAM · 29 namespaces", color: "#3b82f6", width: 1010, height: 600 },
    style: { zIndex: -1 },
  },
  {
    id: "zone-host",
    type: "zone",
    position: { x: -180, y: -65 },
    data: { label: "🖥️ Host VM (Desktop)", sublabel: "systemd services + filesystem", color: "#94a3b8", width: 220, height: 250 },
    style: { zIndex: -1 },
  },
  {
    id: "zone-remote",
    type: "zone",
    position: { x: 310, y: -95 },
    data: { label: "💻 MacBook (Remote)", sublabel: "Tailscale mesh · Claude Code", color: "#f1f5f9", width: 190, height: 115 },
    style: { zIndex: -1 },
  },
];

// === USER (remote) ===
const userNodes: Node[] = [
  { id: "user", type: "arch", position: { x: 330, y: -70 }, data: { label: "Claude Code", sublabel: "MCP SSE client", color: "#f1f5f9", icon: "💻" } },
];

// === HOST VM services ===
const hostNodes: Node[] = [
  { id: "vault-files", type: "arch", position: { x: -160, y: -30 }, data: { label: "Obsidian Vault", sublabel: "1,917 files · hostPath", color: "#a855f7", icon: "📂" } },
  { id: "ollama", type: "arch", position: { x: -160, y: 80 }, data: { label: "Ollama", sublabel: "CPU · systemd user svc", color: "#64748b", icon: "🦙" } },
];

// === K3S: Search flow (center) ===
const searchNodes: Node[] = [
  { id: "mcp", type: "arch", position: { x: 310, y: 80 }, data: { label: "MCP Bridge", sublabel: ":30002 · 29 tools", color: "#3b82f6", icon: "🔌", wide: true } },
  { id: "gateway", type: "arch", position: { x: 310, y: 180 }, data: { label: "RAG Gateway", sublabel: ":30808 · 2 replicas", color: "#a855f7", icon: "🚪", wide: true } },
  { id: "fast", type: "arch", position: { x: 170, y: 285 }, data: { label: "FastSearch", sublabel: "<1s · keywords", color: "#22c55e" } },
  { id: "deep", type: "arch", position: { x: 320, y: 285 }, data: { label: "DeepResearch", sublabel: "~10s · semantic", color: "#ec4899" } },
  { id: "oracle", type: "arch", position: { x: 470, y: 285 }, data: { label: "Oracle", sublabel: "15-30s · multi-hop", color: "#ef4444" } },
  { id: "retriever", type: "arch", position: { x: 310, y: 390 }, data: { label: "RAG Retriever", sublabel: ":8001 · 2 replicas", color: "#f97316", icon: "🔍", wide: true } },
];

// === K3S: Data stores ===
const dataNodes: Node[] = [
  { id: "qdrant", type: "arch", position: { x: 170, y: 500 }, data: { label: "Qdrant", sublabel: "148K chunks · 2560d", color: "#f97316", icon: "🔮" } },
  { id: "falkordb", type: "arch", position: { x: 340, y: 500 }, data: { label: "FalkorDB", sublabel: "7.7K nodes", color: "#f97316", icon: "🕸️" } },
  { id: "postgres", type: "arch", position: { x: 510, y: 500 }, data: { label: "vault-postgres", sublabel: "source-of-record", color: "#f97316", icon: "🐘" } },
];

// === K3S: LLM (vllm namespace) ===
const llmNodes: Node[] = [
  { id: "label-llm", type: "label", position: { x: 640, y: 145 }, data: { label: "vllm namespace · GPU", color: "#ef4444" } },
  { id: "vllm", type: "arch", position: { x: 630, y: 170 }, data: { label: "vLLM", sublabel: "Qwen3-8B-AWQ · GPU", color: "#ef4444", icon: "🎮" } },
  { id: "tei", type: "arch", position: { x: 630, y: 280 }, data: { label: "TEI Embedding", sublabel: "Qwen3-4B · 2560d", color: "#ef4444" } },
];

// === K3S: Indexing pipeline ===
const indexNodes: Node[] = [
  { id: "label-index", type: "label", position: { x: -90, y: 200 }, data: { label: "Indexing Pipeline", color: "#ec4899" } },
  { id: "file-watcher", type: "arch", position: { x: -100, y: 225 }, data: { label: "File Watcher", sublabel: "inotify → Kafka", color: "#ec4899", icon: "👁️" } },
  { id: "kafka", type: "arch", position: { x: -100, y: 325 }, data: { label: "Kafka", sublabel: "10+ topics", color: "#00d4ff", icon: "📬", wide: true } },
  { id: "ner", type: "arch", position: { x: -100, y: 420 }, data: { label: "NER Consumer", sublabel: "spaCy · KEDA 0→1", color: "#ec4899" } },
  { id: "indexer", type: "arch", position: { x: -100, y: 520 }, data: { label: "Vault Indexer", sublabel: "delta consumer", color: "#ec4899" } },
];

// === K3S: Observability ===
const obsNodes: Node[] = [
  { id: "label-obs", type: "label", position: { x: 790, y: 70 }, data: { label: "Monitoring NS", color: "#22c55e" } },
  { id: "prometheus", type: "arch", position: { x: 780, y: 95 }, data: { label: "Prometheus", sublabel: ":30090", color: "#22c55e", icon: "🔥" } },
  { id: "grafana", type: "arch", position: { x: 780, y: 200 }, data: { label: "Grafana", sublabel: ":30300", color: "#22c55e", icon: "📊" } },
  { id: "tempo", type: "arch", position: { x: 780, y: 305 }, data: { label: "Tempo", sublabel: "traces", color: "#22c55e", icon: "⏱️" } },
  { id: "alertmanager", type: "arch", position: { x: 780, y: 410 }, data: { label: "Alertmanager", sublabel: ":30903", color: "#22c55e" } },
];

// === K3S: Infra ===
const infraNodes: Node[] = [
  { id: "flux", type: "arch", position: { x: 670, y: 420 }, data: { label: "FluxCD", sublabel: "GitOps → GitLab", color: "#38bdf8", icon: "🔄" } },
  { id: "harbor", type: "arch", position: { x: 670, y: 520 }, data: { label: "Harbor", sublabel: "registry :30500", color: "#3b82f6", icon: "🏗️" } },
];

const nodes: Node[] = [
  ...zoneNodes, ...userNodes, ...hostNodes,
  ...searchNodes, ...dataNodes, ...llmNodes, ...indexNodes, ...obsNodes, ...infraNodes,
];

const edges: Edge[] = [
  // User → K3s
  { id: "s1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" } },
  // Search flow (vertical)
  { id: "s2", source: "mcp", target: "gateway", animated: true, style: { stroke: "#a855f7" } },
  { id: "s4", source: "gateway", target: "fast", style: { stroke: "#22c55e" } },
  { id: "s5", source: "gateway", target: "deep", style: { stroke: "#ec4899" } },
  { id: "s6", source: "gateway", target: "oracle", style: { stroke: "#ef4444" } },
  { id: "s7", source: "fast", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "s8", source: "deep", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "s9", source: "oracle", target: "retriever", style: { stroke: "#94a3b8" } },
  // Retriever → stores
  { id: "d1", source: "retriever", target: "qdrant", animated: true, style: { stroke: "#f97316" } },
  { id: "d2", source: "retriever", target: "falkordb", animated: true, style: { stroke: "#f97316" } },
  // Gateway → vLLM (cross-column bezier)
  { id: "l1", source: "gateway", sourceHandle: "right-out", target: "vllm", targetHandle: "left-in", type: "bezier", animated: true, style: { stroke: "#ef4444" } },
  // Retriever → Ollama (host, cross-column bezier)
  { id: "l2", source: "retriever", sourceHandle: "right-out", target: "tei", targetHandle: "left-in", type: "bezier", style: { stroke: "#ef4444", strokeDasharray: "4 4" } },
  // Host vault → file watcher (cross-zone)
  { id: "h1", source: "vault-files", sourceHandle: "right-out", target: "file-watcher", targetHandle: "left-in", type: "bezier", style: { stroke: "#a855f7" } },
  // Host ollama ← retriever (cross-zone)
  { id: "h2", source: "retriever", target: "ollama", type: "bezier", style: { stroke: "#64748b", strokeDasharray: "4 4" } },
  // Indexing pipeline (vertical)
  { id: "i2", source: "file-watcher", target: "kafka", animated: true, style: { stroke: "#00d4ff" } },
  { id: "i3", source: "kafka", target: "ner", style: { stroke: "#ec4899" } },
  { id: "i4", source: "ner", target: "indexer", style: { stroke: "#ec4899" } },
  // Indexer → stores (cross-column bezier)
  { id: "i5", source: "indexer", sourceHandle: "right-out", target: "qdrant", targetHandle: "left-in", type: "bezier", animated: true, style: { stroke: "#f97316" } },
  { id: "i6", source: "indexer", sourceHandle: "right-out", target: "postgres", targetHandle: "left-in", type: "bezier", style: { stroke: "#f97316" } },
  // Observability (vertical chain)
  { id: "o1", source: "prometheus", target: "grafana", style: { stroke: "#22c55e" } },
  { id: "o2", source: "grafana", target: "tempo", style: { stroke: "#22c55e" } },
  { id: "o3", source: "tempo", target: "alertmanager", style: { stroke: "#22c55e" } },
  // Infra
  { id: "f1", source: "flux", target: "harbor", style: { stroke: "#3b82f6" } },
];

export default function ReactFlowArch() {
  return (
    <div style={{ width: "100%", height: "calc(100vh - 200px)", minHeight: 500, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background color="#1e293b" gap={24} size={1} />
        <Controls
          showInteractive={false}
          style={{ background: "#0f0f13", border: "1px solid #1e293b", borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
