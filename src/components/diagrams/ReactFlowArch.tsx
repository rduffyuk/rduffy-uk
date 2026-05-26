import { useCallback } from "react";
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

function ArchNode({ data }: { data: { label: string; sublabel?: string; color: string; icon?: string } }) {
  return (
    <div
      style={{
        background: "#0f0f13",
        border: `1px solid ${data.color}44`,
        borderRadius: 10,
        padding: "10px 16px",
        minWidth: 140,
        textAlign: "center",
        boxShadow: `0 0 20px ${data.color}15`,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.color, width: 6, height: 6 }} />
      {data.icon && <div style={{ fontSize: 18, marginBottom: 4 }}>{data.icon}</div>}
      <div style={{ fontSize: 13, fontWeight: 600, color: data.color }}>{data.label}</div>
      {data.sublabel && (
        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
          {data.sublabel}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNode };

const nodes: Node[] = [
  { id: "user", type: "arch", position: { x: 250, y: 0 }, data: { label: "Claude Code", sublabel: "User / AI", color: "#f1f5f9", icon: "💻" } },
  { id: "mcp", type: "arch", position: { x: 250, y: 100 }, data: { label: "MCP Bridge", sublabel: ":30002 · 29 tools", color: "#3b82f6", icon: "🔌" } },
  { id: "gateway", type: "arch", position: { x: 250, y: 210 }, data: { label: "RAG Gateway", sublabel: ":30808 · FastAPI", color: "#a855f7", icon: "🚪" } },
  { id: "fast", type: "arch", position: { x: 60, y: 330 }, data: { label: "FastSearch", sublabel: "<1s", color: "#22c55e" } },
  { id: "deep", type: "arch", position: { x: 250, y: 330 }, data: { label: "DeepResearch", sublabel: "~10s", color: "#ec4899" } },
  { id: "oracle", type: "arch", position: { x: 440, y: 330 }, data: { label: "Oracle", sublabel: "15-30s", color: "#ef4444" } },
  { id: "retriever", type: "arch", position: { x: 250, y: 450 }, data: { label: "RAG Retriever", sublabel: ":8001 · Hybrid", color: "#f97316", icon: "🔍" } },
  { id: "qdrant", type: "arch", position: { x: 140, y: 570 }, data: { label: "Qdrant", sublabel: "148K docs", color: "#f97316", icon: "🔮" } },
  { id: "falkordb", type: "arch", position: { x: 360, y: 570 }, data: { label: "FalkorDB", sublabel: "7.7K nodes", color: "#f97316", icon: "🕸️" } },
];

const edges: Edge[] = [
  { id: "e1", source: "user", target: "mcp", animated: true, style: { stroke: "#3b82f6" } },
  { id: "e2", source: "mcp", target: "gateway", animated: true, style: { stroke: "#a855f7" } },
  { id: "e3", source: "gateway", target: "fast", style: { stroke: "#22c55e" } },
  { id: "e4", source: "gateway", target: "deep", style: { stroke: "#ec4899" } },
  { id: "e5", source: "gateway", target: "oracle", style: { stroke: "#ef4444" } },
  { id: "e6", source: "fast", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "e7", source: "deep", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "e8", source: "oracle", target: "retriever", style: { stroke: "#94a3b8" } },
  { id: "e9", source: "retriever", target: "qdrant", animated: true, style: { stroke: "#f97316" } },
  { id: "e10", source: "retriever", target: "falkordb", animated: true, style: { stroke: "#f97316" } },
];

export default function ReactFlowArch() {
  return (
    <div style={{ width: "100%", height: 700, borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
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
