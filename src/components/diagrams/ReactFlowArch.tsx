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
      <Handle type="target" position={Position.Left} id="left" style={{ background: data.color, width: 5, height: 5 }} />
      {data.icon && <div style={{ fontSize: 16, marginBottom: 2 }}>{data.icon}</div>}
      <div style={{ fontSize: 11, fontWeight: 600, color: data.color }}>{data.label}</div>
      {data.sublabel && (
        <div style={{ fontSize: 9, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", marginTop: 1 }}>
          {data.sublabel}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 5, height: 5 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: data.color, width: 5, height: 5 }} />
    </div>
  );
}

function GroupLabel({ data }: { data: { label: string; color: string } }) {
  return (
    <div style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.15em", textTransform: "uppercase" as const, color: data.color, opacity: 0.6 }}>
      {data.label}
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode, label: GroupLabel };

// === SEARCH FLOW (center column) ===
const searchNodes: Node[] = [
  { id: "user", type: "arch", position: { x: 300, y: 0 }, data: { label: "Claude Code", sublabel: "MCP SSE client", color: "#f1f5f9", icon: "💻" } },
  { id: "mcp", type: "arch", position: { x: 300, y: 90 }, data: { label: "MCP Bridge", sublabel: ":30002 · 29 tools", color: "#3b82f6", icon: "🔌", wide: true } },
  { id: "gateway", type: "arch", position: { x: 300, y: 185 }, data: { label: "RAG Gateway", sublabel: ":30808 · 2 replicas", color: "#a855f7", icon: "🚪", wide: true } },
  { id: "cache", type: "arch", position: { x: 480, y: 185 }, data: { label: "Semantic Cache", sublabel: "73% hit rate", color: "#a855f7" } },
  { id: "fast", type: "arch", position: { x: 160, y: 290 }, data: { label: "FastSearch", sublabel: "<1s · keywords", color: "#22c55e" } },
  { id: "deep", type: "arch", position: { x: 310, y: 290 }, data: { label: "DeepResearch", sublabel: "~10s · semantic", color: "#ec4899" } },
  { id: "oracle", type: "arch", position: { x: 460, y: 290 }, data: { label: "Oracle", sublabel: "15-30s · multi-hop", color: "#ef4444" } },
  { id: "retriever", type: "arch", position: { x: 310, y: 390 }, data: { label: "RAG Retriever", sublabel: ":8001 · 2 replicas", color: "#f97316", icon: "🔍", wide: true } },
];

// === DATA STORES (bottom) ===
const dataNodes: Node[] = [
  { id: "qdrant", type: "arch", position: { x: 160, y: 500 }, data: { label: "Qdrant", sublabel: "148K chunks · 2560d", color: "#f97316", icon: "🔮" } },
  { id: "falkordb", type: "arch", position: { x: 340, y: 500 }, data: { label: "FalkorDB", sublabel: "7.7K nodes · graph", color: "#f97316", icon: "🕸️" } },
  { id: "postgres", type: "arch", position: { x: 520, y: 500 }, data: { label: "vault-postgres", sublabel: "source-of-record", color: "#f97316", icon: "🐘" } },
];

// === LLM LAYER (right side) ===
const llmNodes: Node[] = [
  { id: "label-llm", type: "label", position: { x: 680, y: 260 }, data: { label: "AI / ML Inference", color: "#ef4444" } },
  { id: "vllm", type: "arch", position: { x: 660, y: 290 }, data: { label: "vLLM", sublabel: "Qwen3-8B · GPU", color: "#ef4444", icon: "🎮" } },
  { id: "ollama", type: "arch", position: { x: 660, y: 390 }, data: { label: "Ollama", sublabel: "CPU fallback", color: "#94a3b8", icon: "🦙" } },
  { id: "tei", type: "arch", position: { x: 660, y: 480 }, data: { label: "TEI Embedding", sublabel: "Qwen3-4B · 2560d", color: "#ef4444" } },
];

// === INDEXING PIPELINE (left side) ===
const indexNodes: Node[] = [
  { id: "label-index", type: "label", position: { x: -110, y: 70 }, data: { label: "Indexing Pipeline", color: "#ec4899" } },
  { id: "vault-files", type: "arch", position: { x: -120, y: 100 }, data: { label: "Obsidian Vault", sublabel: "1,917 files", color: "#a855f7", icon: "📂" } },
  { id: "file-watcher", type: "arch", position: { x: -120, y: 195 }, data: { label: "File Watcher", sublabel: "inotify → Kafka", color: "#ec4899", icon: "👁️" } },
  { id: "kafka", type: "arch", position: { x: -120, y: 290 }, data: { label: "Kafka", sublabel: "10+ topics", color: "#00d4ff", icon: "📬", wide: true } },
  { id: "ner", type: "arch", position: { x: -120, y: 390 }, data: { label: "NER Consumer", sublabel: "spaCy · KEDA 0→1", color: "#ec4899" } },
  { id: "indexer", type: "arch", position: { x: -120, y: 480 }, data: { label: "Vault Indexer", sublabel: "delta consumer", color: "#ec4899" } },
];

// === OBSERVABILITY (far right) ===
const obsNodes: Node[] = [
  { id: "label-obs", type: "label", position: { x: 850, y: 70 }, data: { label: "Observability", color: "#22c55e" } },
  { id: "prometheus", type: "arch", position: { x: 850, y: 100 }, data: { label: "Prometheus", sublabel: ":30090", color: "#22c55e", icon: "🔥" } },
  { id: "grafana", type: "arch", position: { x: 850, y: 195 }, data: { label: "Grafana", sublabel: ":30300", color: "#22c55e", icon: "📊" } },
  { id: "tempo", type: "arch", position: { x: 850, y: 290 }, data: { label: "Tempo", sublabel: "distributed traces", color: "#22c55e", icon: "⏱️" } },
  { id: "alertmanager", type: "arch", position: { x: 850, y: 385 }, data: { label: "Alertmanager", sublabel: ":30903", color: "#22c55e" } },
];

// === INFRA (bottom-right) ===
const infraNodes: Node[] = [
  { id: "label-infra", type: "label", position: { x: 660, y: 570 }, data: { label: "Infrastructure", color: "#3b82f6" } },
  { id: "k3s", type: "arch", position: { x: 660, y: 600 }, data: { label: "K3s Cluster", sublabel: "RTX 4080 · 64GB", color: "#3b82f6", icon: "⚙️" } },
  { id: "flux", type: "arch", position: { x: 830, y: 600 }, data: { label: "FluxCD", sublabel: "GitOps", color: "#38bdf8", icon: "🔄" } },
  { id: "harbor", type: "arch", position: { x: 830, y: 500 }, data: { label: "Harbor", sublabel: "registry :30500", color: "#3b82f6", icon: "🏗️" } },
];

const nodes: Node[] = [...searchNodes, ...dataNodes, ...llmNodes, ...indexNodes, ...obsNodes, ...infraNodes];

const edges: Edge[] = [
  // Search flow
  { id: "s1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" } },
  { id: "s2", source: "mcp", target: "gateway", animated: true, style: { stroke: "#a855f7" } },
  { id: "s3", source: "gateway", sourceHandle: "right", target: "cache", targetHandle: "left", style: { stroke: "#a855f7", strokeDasharray: "4 4" } },
  { id: "s4", source: "gateway", target: "fast", style: { stroke: "#22c55e" } },
  { id: "s5", source: "gateway", target: "deep", style: { stroke: "#ec4899" } },
  { id: "s6", source: "gateway", target: "oracle", style: { stroke: "#ef4444" } },
  { id: "s7", source: "fast", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "s8", source: "deep", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "s9", source: "oracle", target: "retriever", style: { stroke: "#94a3b8" } },
  // Retriever → stores
  { id: "d1", source: "retriever", target: "qdrant", animated: true, style: { stroke: "#f97316" } },
  { id: "d2", source: "retriever", target: "falkordb", animated: true, style: { stroke: "#f97316" } },
  // Retriever → LLM
  { id: "l1", source: "oracle", sourceHandle: "right", target: "vllm", targetHandle: "left", animated: true, style: { stroke: "#ef4444" } },
  { id: "l2", source: "retriever", sourceHandle: "right", target: "ollama", targetHandle: "left", style: { stroke: "#94a3b8", strokeDasharray: "4 4" } },
  { id: "l3", source: "tei", target: "qdrant", targetHandle: "left", style: { stroke: "#ef4444", strokeDasharray: "4 4" }, label: "embed", labelStyle: { fill: "#94a3b8", fontSize: 8 } },
  // Indexing pipeline
  { id: "i1", source: "vault-files", target: "file-watcher", style: { stroke: "#ec4899" } },
  { id: "i2", source: "file-watcher", target: "kafka", animated: true, style: { stroke: "#00d4ff" } },
  { id: "i3", source: "kafka", target: "ner", style: { stroke: "#ec4899" } },
  { id: "i4", source: "ner", target: "indexer", style: { stroke: "#ec4899" } },
  { id: "i5", source: "indexer", target: "qdrant", targetHandle: "left", animated: true, style: { stroke: "#f97316" } },
  { id: "i6", source: "indexer", target: "postgres", style: { stroke: "#f97316" } },
  // Observability
  { id: "o1", source: "prometheus", target: "grafana", style: { stroke: "#22c55e" } },
  { id: "o2", source: "prometheus", target: "tempo", style: { stroke: "#22c55e" } },
  { id: "o3", source: "prometheus", target: "alertmanager", style: { stroke: "#22c55e" } },
  // Infra
  { id: "f1", source: "k3s", target: "flux", style: { stroke: "#38bdf8" } },
  { id: "f2", source: "flux", target: "harbor", style: { stroke: "#3b82f6" } },
];

export default function ReactFlowArch() {
  return (
    <div style={{ width: "100%", height: 780, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
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
