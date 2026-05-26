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

function GroupLabel({ data }: { data: { label: string; color: string } }) {
  return (
    <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.15em", textTransform: "uppercase" as const, color: data.color, opacity: 0.6, pointerEvents: "none" as const }}>
      {data.label}
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode, label: GroupLabel };

// Centered search column at x=300
const searchNodes: Node[] = [
  { id: "user", type: "arch", position: { x: 300, y: 0 }, data: { label: "Claude Code", sublabel: "MCP SSE client", color: "#f1f5f9", icon: "💻" } },
  { id: "mcp", type: "arch", position: { x: 300, y: 100 }, data: { label: "MCP Bridge", sublabel: ":30002 · 29 tools", color: "#3b82f6", icon: "🔌", wide: true } },
  { id: "gateway", type: "arch", position: { x: 300, y: 200 }, data: { label: "RAG Gateway", sublabel: ":30808 · 2 replicas", color: "#a855f7", icon: "🚪", wide: true } },
  { id: "fast", type: "arch", position: { x: 170, y: 310 }, data: { label: "FastSearch", sublabel: "<1s · keywords", color: "#22c55e" } },
  { id: "deep", type: "arch", position: { x: 310, y: 310 }, data: { label: "DeepResearch", sublabel: "~10s · semantic", color: "#ec4899" } },
  { id: "oracle", type: "arch", position: { x: 450, y: 310 }, data: { label: "Oracle", sublabel: "15-30s · multi-hop", color: "#ef4444" } },
  { id: "retriever", type: "arch", position: { x: 300, y: 420 }, data: { label: "RAG Retriever", sublabel: ":8001 · 2 replicas", color: "#f97316", icon: "🔍", wide: true } },
];

// Data stores bottom center
const dataNodes: Node[] = [
  { id: "qdrant", type: "arch", position: { x: 180, y: 530 }, data: { label: "Qdrant", sublabel: "148K chunks · 2560d", color: "#f97316", icon: "🔮" } },
  { id: "falkordb", type: "arch", position: { x: 340, y: 530 }, data: { label: "FalkorDB", sublabel: "7.7K nodes", color: "#f97316", icon: "🕸️" } },
  { id: "postgres", type: "arch", position: { x: 500, y: 530 }, data: { label: "vault-postgres", sublabel: "source-of-record", color: "#f97316", icon: "🐘" } },
];

// LLM right of agents
const llmNodes: Node[] = [
  { id: "label-llm", type: "label", position: { x: 630, y: 165 }, data: { label: "LLM Inference", color: "#ef4444" } },
  { id: "vllm", type: "arch", position: { x: 620, y: 190 }, data: { label: "vLLM", sublabel: "Qwen3-8B · RTX 4080", color: "#ef4444", icon: "🎮" } },
  { id: "ollama", type: "arch", position: { x: 620, y: 300 }, data: { label: "Ollama", sublabel: "CPU fallback", color: "#64748b", icon: "🦙" } },
  { id: "tei", type: "arch", position: { x: 620, y: 410 }, data: { label: "TEI Embedding", sublabel: "Qwen3-4B · 2560d", color: "#ef4444" } },
];

// Indexing pipeline left
const indexNodes: Node[] = [
  { id: "label-index", type: "label", position: { x: -70, y: 5 }, data: { label: "Indexing Pipeline", color: "#ec4899" } },
  { id: "vault-files", type: "arch", position: { x: -80, y: 30 }, data: { label: "Obsidian Vault", sublabel: "1,917 files", color: "#a855f7", icon: "📂" } },
  { id: "file-watcher", type: "arch", position: { x: -80, y: 140 }, data: { label: "File Watcher", sublabel: "inotify → Kafka", color: "#ec4899", icon: "👁️" } },
  { id: "kafka", type: "arch", position: { x: -80, y: 250 }, data: { label: "Kafka", sublabel: "10+ topics", color: "#00d4ff", icon: "📬", wide: true } },
  { id: "ner", type: "arch", position: { x: -80, y: 360 }, data: { label: "NER Consumer", sublabel: "spaCy · KEDA 0→1", color: "#ec4899" } },
  { id: "indexer", type: "arch", position: { x: -80, y: 470 }, data: { label: "Vault Indexer", sublabel: "delta consumer", color: "#ec4899" } },
];

// Observability far right
const obsNodes: Node[] = [
  { id: "label-obs", type: "label", position: { x: 810, y: 5 }, data: { label: "Observability", color: "#22c55e" } },
  { id: "prometheus", type: "arch", position: { x: 800, y: 30 }, data: { label: "Prometheus", sublabel: ":30090", color: "#22c55e", icon: "🔥" } },
  { id: "grafana", type: "arch", position: { x: 800, y: 140 }, data: { label: "Grafana", sublabel: ":30300", color: "#22c55e", icon: "📊" } },
  { id: "tempo", type: "arch", position: { x: 800, y: 250 }, data: { label: "Tempo", sublabel: "traces", color: "#22c55e", icon: "⏱️" } },
  { id: "alertmanager", type: "arch", position: { x: 800, y: 360 }, data: { label: "Alertmanager", sublabel: ":30903", color: "#22c55e" } },
];

// Infra bottom right
const infraNodes: Node[] = [
  { id: "label-infra", type: "label", position: { x: 700, y: 520 }, data: { label: "Infrastructure", color: "#3b82f6" } },
  { id: "k3s", type: "arch", position: { x: 690, y: 545 }, data: { label: "K3s Cluster", sublabel: "RTX 4080 · 64GB", color: "#3b82f6", icon: "⚙️" } },
  { id: "flux", type: "arch", position: { x: 840, y: 545 }, data: { label: "FluxCD", sublabel: "GitOps", color: "#38bdf8", icon: "🔄" } },
];

const nodes: Node[] = [...searchNodes, ...dataNodes, ...llmNodes, ...indexNodes, ...obsNodes, ...infraNodes];

const edges: Edge[] = [
  // Search flow (vertical, smoothstep is fine)
  { id: "s1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" } },
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
  // Cross-column: agents/retriever → LLM (use bezier for cleaner routing)
  { id: "l1", source: "gateway", sourceHandle: "right-out", target: "vllm", targetHandle: "left-in", type: "bezier", animated: true, style: { stroke: "#ef4444" } },
  { id: "l2", source: "retriever", sourceHandle: "right-out", target: "ollama", targetHandle: "left-in", type: "bezier", style: { stroke: "#64748b", strokeDasharray: "4 4" } },
  { id: "l3", source: "retriever", sourceHandle: "right-out", target: "tei", targetHandle: "left-in", type: "bezier", style: { stroke: "#ef4444", strokeDasharray: "4 4" } },
  // Indexing pipeline (vertical, smoothstep)
  { id: "i1", source: "vault-files", target: "file-watcher", style: { stroke: "#ec4899" } },
  { id: "i2", source: "file-watcher", target: "kafka", animated: true, style: { stroke: "#00d4ff" } },
  { id: "i3", source: "kafka", target: "ner", style: { stroke: "#ec4899" } },
  { id: "i4", source: "ner", target: "indexer", style: { stroke: "#ec4899" } },
  // Indexer → data stores (cross-column, use bezier)
  { id: "i5", source: "indexer", sourceHandle: "right-out", target: "qdrant", targetHandle: "left-in", type: "bezier", animated: true, style: { stroke: "#f97316" } },
  { id: "i6", source: "indexer", sourceHandle: "right-out", target: "postgres", targetHandle: "left-in", type: "bezier", style: { stroke: "#f97316" } },
  // Observability (vertical)
  { id: "o1", source: "prometheus", target: "grafana", style: { stroke: "#22c55e" } },
  { id: "o2", source: "grafana", target: "tempo", style: { stroke: "#22c55e" } },
  { id: "o3", source: "tempo", target: "alertmanager", style: { stroke: "#22c55e" } },
  // Infra
  { id: "f1", source: "k3s", sourceHandle: "right-out", target: "flux", targetHandle: "left-in", style: { stroke: "#38bdf8" } },
];

export default function ReactFlowArch() {
  return (
    <div style={{ width: "100%", height: 750, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={nodes}
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
        <Controls
          showInteractive={false}
          style={{ background: "#0f0f13", border: "1px solid #1e293b", borderRadius: 8 }}
        />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as { color?: string } | undefined;
            return d?.color ?? "#94a3b8";
          }}
          style={{ background: "#0f0f13", border: "1px solid #1e293b", borderRadius: 8 }}
          maskColor="rgba(9, 9, 11, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}
