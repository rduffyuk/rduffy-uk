import { useMemo } from "react";
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
const NODE_H = 65;

function ArchNode({ data }: { data: { label: string; sublabel?: string; color: string; icon?: string } }) {
  return (
    <div
      style={{
        background: "#0f0f13",
        border: `1px solid ${data.color}44`,
        borderRadius: 10,
        padding: "8px 12px",
        width: NODE_W,
        textAlign: "center",
        boxShadow: `0 0 16px ${data.color}12`,
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

function ZoneLabel({ data }: { data: { label: string; color: string } }) {
  return (
    <div style={{
      fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
      letterSpacing: "0.1em", textTransform: "uppercase" as const,
      color: data.color, padding: "4px 10px",
      border: `1px dashed ${data.color}40`, borderRadius: 8,
      background: `${data.color}08`, pointerEvents: "none" as const,
    }}>
      {data.label}
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode, zone: ZoneLabel };

// Define nodes WITHOUT positions — dagre will calculate them
const rawNodes: Node[] = [
  // Zone labels (placed manually after layout)
  { id: "zone-host", type: "zone", position: { x: 0, y: 0 }, data: { label: "🖥️ Host VM · 100.113.76.79", color: "#94a3b8" } },
  { id: "zone-remote", type: "zone", position: { x: 0, y: 0 }, data: { label: "💻 MacBook · Tailscale", color: "#f1f5f9" } },
  { id: "zone-k3s", type: "zone", position: { x: 0, y: 0 }, data: { label: "⚙️ K3s · RTX 4080 · 64GB · 29 ns · 150+ pods", color: "#3b82f6" } },

  // Host VM
  { id: "vault-files", type: "arch", position: { x: 0, y: 0 }, data: { label: "Obsidian Vault", sublabel: "1,917 files · hostPath", color: "#a855f7", icon: "📂" } },
  { id: "ollama", type: "arch", position: { x: 0, y: 0 }, data: { label: "Ollama", sublabel: "CPU · systemd", color: "#64748b", icon: "🦙" } },

  // Remote
  { id: "user", type: "arch", position: { x: 0, y: 0 }, data: { label: "Claude Code", sublabel: "MCP SSE client", color: "#f1f5f9", icon: "💻" } },

  // K3s: Search flow
  { id: "mcp", type: "arch", position: { x: 0, y: 0 }, data: { label: "MCP Bridge", sublabel: ":30002 · 29 tools", color: "#3b82f6", icon: "🔌" } },
  { id: "gateway", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Gateway", sublabel: ":30808 · 2 replicas", color: "#a855f7", icon: "🚪" } },
  { id: "fast", type: "arch", position: { x: 0, y: 0 }, data: { label: "FastSearch", sublabel: "<1s · keywords", color: "#22c55e" } },
  { id: "deep", type: "arch", position: { x: 0, y: 0 }, data: { label: "DeepResearch", sublabel: "~10s · semantic", color: "#ec4899" } },
  { id: "oracle", type: "arch", position: { x: 0, y: 0 }, data: { label: "Oracle", sublabel: "15-30s · multi-hop", color: "#ef4444" } },
  { id: "retriever", type: "arch", position: { x: 0, y: 0 }, data: { label: "RAG Retriever", sublabel: ":8001 · 2 replicas", color: "#f97316", icon: "🔍" } },

  // K3s: Data stores
  { id: "qdrant", type: "arch", position: { x: 0, y: 0 }, data: { label: "Qdrant", sublabel: "148K chunks · 2560d", color: "#f97316", icon: "🔮" } },
  { id: "falkordb", type: "arch", position: { x: 0, y: 0 }, data: { label: "FalkorDB", sublabel: "7.7K nodes", color: "#f97316", icon: "🕸️" } },
  { id: "postgres", type: "arch", position: { x: 0, y: 0 }, data: { label: "vault-postgres", sublabel: "source-of-record", color: "#f97316", icon: "🐘" } },

  // K3s: LLM
  { id: "vllm", type: "arch", position: { x: 0, y: 0 }, data: { label: "vLLM", sublabel: "Qwen3-8B · RTX 4080", color: "#ef4444", icon: "🎮" } },
  { id: "tei", type: "arch", position: { x: 0, y: 0 }, data: { label: "TEI Embedding", sublabel: "Qwen3-4B · 2560d", color: "#ef4444" } },

  // K3s: Indexing
  { id: "file-watcher", type: "arch", position: { x: 0, y: 0 }, data: { label: "File Watcher", sublabel: "inotify → Kafka", color: "#ec4899", icon: "👁️" } },
  { id: "kafka", type: "arch", position: { x: 0, y: 0 }, data: { label: "Kafka", sublabel: "10+ topics", color: "#00d4ff", icon: "📬" } },
  { id: "ner", type: "arch", position: { x: 0, y: 0 }, data: { label: "NER Consumer", sublabel: "spaCy · KEDA 0→1", color: "#ec4899" } },
  { id: "indexer", type: "arch", position: { x: 0, y: 0 }, data: { label: "Vault Indexer", sublabel: "delta consumer", color: "#ec4899" } },

  // K3s: Observability
  { id: "prometheus", type: "arch", position: { x: 0, y: 0 }, data: { label: "Prometheus", sublabel: ":30090", color: "#22c55e", icon: "🔥" } },
  { id: "grafana", type: "arch", position: { x: 0, y: 0 }, data: { label: "Grafana", sublabel: ":30300", color: "#22c55e", icon: "📊" } },
  { id: "tempo", type: "arch", position: { x: 0, y: 0 }, data: { label: "Tempo", sublabel: "traces", color: "#22c55e", icon: "⏱️" } },

  // K3s: Infra
  { id: "flux", type: "arch", position: { x: 0, y: 0 }, data: { label: "FluxCD", sublabel: "GitOps → GitLab", color: "#38bdf8", icon: "🔄" } },
  { id: "harbor", type: "arch", position: { x: 0, y: 0 }, data: { label: "Harbor", sublabel: "registry :30500", color: "#3b82f6", icon: "🏗️" } },
];

const edges: Edge[] = [
  // Host → K3s
  { id: "h1", source: "vault-files", target: "file-watcher", style: { stroke: "#a855f7" } },
  // Remote → K3s
  { id: "s1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" } },
  // Search flow
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
  { id: "d3", source: "retriever", target: "postgres", style: { stroke: "#f97316", strokeDasharray: "4 4" } },
  // Gateway → LLM
  { id: "l1", source: "gateway", target: "vllm", animated: true, style: { stroke: "#ef4444" } },
  // Retriever → embedding
  { id: "l2", source: "tei", target: "qdrant", style: { stroke: "#ef4444", strokeDasharray: "4 4" } },
  // Indexing pipeline
  { id: "i1", source: "file-watcher", target: "kafka", animated: true, style: { stroke: "#00d4ff" } },
  { id: "i2", source: "kafka", target: "ner", style: { stroke: "#ec4899" } },
  { id: "i3", source: "ner", target: "indexer", style: { stroke: "#ec4899" } },
  { id: "i4", source: "indexer", target: "qdrant", animated: true, style: { stroke: "#f97316" } },
  { id: "i5", source: "indexer", target: "postgres", style: { stroke: "#f97316" } },
  // Observability chain
  { id: "o1", source: "prometheus", target: "grafana", style: { stroke: "#22c55e" } },
  { id: "o2", source: "prometheus", target: "tempo", style: { stroke: "#22c55e" } },
  // Infra
  { id: "f1", source: "flux", target: "harbor", style: { stroke: "#3b82f6" } },
];

function layoutWithDagre(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 60,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });

  const layoutableIds = new Set<string>();
  for (const n of nodes) {
    if (n.type === "zone") continue;
    layoutableIds.add(n.id);
    g.setNode(n.id, { width: NODE_W + 20, height: NODE_H + 10 });
  }

  for (const e of edges) {
    if (layoutableIds.has(e.source) && layoutableIds.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((node) => {
    if (node.type === "zone") return node;
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H / 2,
      },
    };
  });
}

function placeZoneLabels(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const hostIds = ["vault-files", "ollama"];
  const remoteIds = ["user"];

  function bounds(ids: string[]) {
    let minX = Infinity, minY = Infinity;
    for (const id of ids) {
      const n = byId.get(id);
      if (n) { minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y); }
    }
    return { x: minX - 15, y: minY - 35 };
  }

  const allK3sIds = nodes.filter((n) => n.type === "arch" && !hostIds.includes(n.id) && !remoteIds.includes(n.id)).map((n) => n.id);

  return nodes.map((n) => {
    if (n.id === "zone-host") return { ...n, position: bounds(hostIds) };
    if (n.id === "zone-remote") return { ...n, position: bounds(remoteIds) };
    if (n.id === "zone-k3s") return { ...n, position: bounds(allK3sIds) };
    return n;
  });
}

export default function ReactFlowArch() {
  const layoutedNodes = useMemo(() => {
    const afterDagre = layoutWithDagre(rawNodes, edges);
    return placeZoneLabels(afterDagre);
  }, []);

  return (
    <div style={{ width: "100%", height: "calc(100vh - 180px)", minHeight: 550, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={layoutedNodes}
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
      </ReactFlow>
    </div>
  );
}
