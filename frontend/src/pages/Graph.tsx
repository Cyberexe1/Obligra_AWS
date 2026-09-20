import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ApiError, fetchObligationGraph } from '../lib/api'
import type { GraphEdge as ApiGraphEdge, GraphNode as ApiGraphNode, RelationshipType } from '../lib/api'
import { layoutGraph } from '../lib/graphLayout'
import ObligationNode from '../components/ObligationNode'
import type { ObligationNodeType } from '../components/ObligationNode'

type ObligationEdgeType = Edge<{ reason: string; confidence: number; relationshipType: RelationshipType }, 'obligation'>

const nodeTypes: NodeTypes = { obligation: ObligationNode }

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  depends_on: 'Depends on',
  blocks: 'Blocks',
  follows: 'Follows',
  conditional_on: 'Conditional on',
}

function toFlowNodes(apiNodes: ApiGraphNode[], edges: ApiGraphEdge[]): ObligationNodeType[] {
  const positions = layoutGraph(apiNodes, edges)

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
}

function toFlowEdges(apiEdges: ApiGraphEdge[]): ObligationEdgeType[] {
  return apiEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#94a3b8' },
    labelStyle: { fill: '#475569', fontSize: 11 },
    data: {
      reason: edge.reason,
      confidence: edge.confidence,
      relationshipType: edge.type,
    },
  }))
}

export default function Graph() {
  const [apiNodes, setApiNodes] = useState<ApiGraphNode[]>([])
  const [apiEdges, setApiEdges] = useState<ApiGraphEdge[]>([])
  const [cycles, setCycles] = useState<string[][]>([])
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<ObligationNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<ObligationEdgeType>([])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoadState('loading')
      setSelectedNodeId(null)
      setSelectedEdgeId(null)

      try {
        const response = await fetchObligationGraph()
        if (cancelled) return
        setApiNodes(response.nodes)
        setApiEdges(response.edges)
        setCycles(response.cycles_detected)
        setLoadState('loaded')
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Failed to load the obligation graph.'
        setError(message)
        setLoadState('error')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [refreshToken])

  useEffect(() => {
    setNodes(toFlowNodes(apiNodes, apiEdges))
    setEdges(toFlowEdges(apiEdges))
  }, [apiNodes, apiEdges, setNodes, setEdges])

  const selectedNode = useMemo(
    () => apiNodes.find((node) => node.id === selectedNodeId) ?? null,
    [apiNodes, selectedNodeId],
  )
  const selectedEdge = useMemo(
    () => apiEdges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [apiEdges, selectedEdgeId],
  )

  return (
    <section aria-labelledby="graph-heading" className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="graph-heading" className="font-headline-md text-headline-md font-bold text-on-surface">
            Obligation Graph
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Visualizes detected dependencies between obligations. Click a node or a connection
            for details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshToken((token) => token + 1)}
          className="shrink-0 rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 font-label-md text-label-md font-medium text-on-surface shadow-sm hover:bg-surface-container-low"
        >
          Refresh
        </button>
      </div>

      {cycles.length > 0 && (
        <div className="rounded-lg border border-[#f59e0b]/20 bg-[#fffbeb] p-3 font-body-md text-body-md text-[#b45309]">
          <p className="font-medium">
            {cycles.length} dependency cycle{cycles.length > 1 ? 's' : ''} detected. This may indicate an
            invalid dependency chain.
          </p>
        </div>
      )}

      {loadState === 'loading' && (
        <p className="font-body-md text-body-md text-on-surface-variant">Loading obligation graph&hellip;</p>
      )}

      {loadState === 'error' && (
        <div className="rounded-lg border border-error/20 bg-error-container p-4 font-body-md text-body-md text-on-error-container">
          {error || 'Failed to load the obligation graph.'}
        </div>
      )}

      {loadState === 'loaded' && apiNodes.length === 0 && (
        <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            No obligations yet. Upload a document, extract obligations, and run dependency
            analysis to populate the graph.
          </p>
        </div>
      )}

      {loadState === 'loaded' && apiNodes.length > 0 && (
        <div className="flex flex-1 gap-4">
          <div className="min-h-[500px] flex-1 overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest shadow-card">
            <ReactFlow<ObligationNodeType, ObligationEdgeType>
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id)
                setSelectedEdgeId(null)
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id)
                setSelectedNodeId(null)
              }}
              onPaneClick={() => {
                setSelectedNodeId(null)
                setSelectedEdgeId(null)
              }}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          {(selectedNode || selectedEdge) && (
            <aside className="w-72 shrink-0 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-card">
              {selectedNode && (
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-title-md text-title-md font-semibold text-on-surface">Obligation details</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(null)}
                      className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface"
                      aria-label="Close details"
                    >
                      Close
                    </button>
                  </div>
                  <dl className="mt-3 space-y-2 font-body-sm text-body-sm text-on-surface-variant">
                    <div>
                      <dt className="font-medium text-on-surface-variant/70">Action</dt>
                      <dd className="mt-0.5">{selectedNode.label ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-on-surface-variant/70">Status</dt>
                      <dd className="mt-0.5 capitalize">{selectedNode.status.replace('_', ' ')}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-on-surface-variant/70">Deadline</dt>
                      <dd className="mt-0.5">{selectedNode.deadline ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-on-surface-variant/70">Confidence</dt>
                      <dd className="mt-0.5">{Math.round(selectedNode.confidence * 100)}%</dd>
                    </div>
                  </dl>
                </div>
              )}

              {selectedEdge && (
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-title-md text-title-md font-semibold text-on-surface">Relationship details</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedEdgeId(null)}
                      className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface"
                      aria-label="Close details"
                    >
                      Close
                    </button>
                  </div>
                  <dl className="mt-3 space-y-2 font-body-sm text-body-sm text-on-surface-variant">
                    <div>
                      <dt className="font-medium text-on-surface-variant/70">Type</dt>
                      <dd className="mt-0.5">{RELATIONSHIP_LABELS[selectedEdge.type]}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-on-surface-variant/70">Reason</dt>
                      <dd className="mt-0.5">{selectedEdge.reason}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-on-surface-variant/70">Confidence</dt>
                      <dd className="mt-0.5">{Math.round(selectedEdge.confidence * 100)}%</dd>
                    </div>
                  </dl>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </section>
  )
}
