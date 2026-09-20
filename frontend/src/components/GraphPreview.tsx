import { useMemo } from 'react'
import { Background, ReactFlow, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ObligationNode from './ObligationNode'
import type { ObligationNodeType } from './ObligationNode'
import type { GraphEdge as ApiGraphEdge, GraphNode as ApiGraphNode } from '../lib/api'
import { layoutGraph } from '../lib/graphLayout'

const nodeTypes: NodeTypes = { obligation: ObligationNode }

interface GraphPreviewProps {
  nodes: ApiGraphNode[]
  edges: ApiGraphEdge[]
}

/**
 * A small, read-only preview of the obligation dependency graph for the
 * Dashboard. Reuses the exact same `ObligationNode` component and
 * `layoutGraph` positioning logic as the full `/graph` page — this is
 * NOT a second graph engine, just a smaller, non-interactive rendering
 * of the same React Flow setup (no dragging, no click-to-inspect panel).
 */
export default function GraphPreview({ nodes: apiNodes, edges: apiEdges }: GraphPreviewProps) {
  const nodes = useMemo<ObligationNodeType[]>(() => {
    const positions = layoutGraph(apiNodes, apiEdges)
    return apiNodes.map((node) => {
      const position = positions.get(node.id) ?? { x: 0, y: 0 }
      return {
        id: node.id,
        type: 'obligation',
        position: { x: position.x, y: position.y },
        data: {
          label: node.label,
          status: node.status,
          deadline: node.deadline,
          confidence: node.confidence,
        },
      }
    })
  }, [apiNodes, apiEdges])

  const edges = useMemo(
    () =>
      apiEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        style: { stroke: '#94a3b8' },
      })),
    [apiEdges],
  )

  return (
    <div className="h-full w-full overflow-hidden rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>
    </div>
  )
}
