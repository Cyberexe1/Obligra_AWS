import type { GraphEdge, GraphNode } from './api'

export interface PositionedNode {
  id: string
  x: number
  y: number
}

const COLUMN_WIDTH = 260
const ROW_HEIGHT = 160

/**
 * Assigns a simple layered position to each node based on dependency
 * depth: nodes with no incoming edges start at depth 0, and each edge
 * source -> target places the target at least one layer to the right of
 * its source. Nodes involved in a cycle (which can't be topologically
 * layered) and disconnected nodes fall back to being placed in order
 * after the layered nodes.
 *
 * This is intentionally simple — it only needs to produce a readable,
 * non-overlapping layout for a dependency graph, not a general-purpose
 * graph drawing algorithm.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Map<string, PositionedNode> {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const outgoing = new Map<string, string[]>()
  const incomingCount = new Map<string, number>()

  for (const node of nodes) {
    outgoing.set(node.id, [])
    incomingCount.set(node.id, 0)
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    outgoing.get(edge.source)?.push(edge.target)
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
  }

  const depth = new Map<string, number>()
  const queue: string[] = []

  for (const node of nodes) {
    if ((incomingCount.get(node.id) ?? 0) === 0) {
      depth.set(node.id, 0)
      queue.push(node.id)
    }
  }

  const remainingIncoming = new Map(incomingCount)
  let cursor = 0
  while (cursor < queue.length) {
    const current = queue[cursor]
    cursor += 1
    const currentDepth = depth.get(current) ?? 0

    for (const next of outgoing.get(current) ?? []) {
      const nextRemaining = (remainingIncoming.get(next) ?? 0) - 1
      remainingIncoming.set(next, nextRemaining)
      depth.set(next, Math.max(depth.get(next) ?? 0, currentDepth + 1))
      if (nextRemaining <= 0 && !queue.includes(next)) {
        queue.push(next)
      }
    }
  }

  // Any node never assigned a depth is part of a cycle or otherwise
  // unreachable from a zero-in-degree node — place it after the deepest
  // layered node so it doesn't overlap the main layout.
  const maxLayeredDepth = Math.max(0, ...Array.from(depth.values()))
  let fallbackDepth = maxLayeredDepth + 1
  for (const node of nodes) {
    if (!depth.has(node.id)) {
      depth.set(node.id, fallbackDepth)
      fallbackDepth += 1
    }
  }

  const countPerDepth = new Map<number, number>()
  const positions = new Map<string, PositionedNode>()

  for (const node of nodes) {
    const nodeDepth = depth.get(node.id) ?? 0
    const row = countPerDepth.get(nodeDepth) ?? 0
    countPerDepth.set(nodeDepth, row + 1)

    positions.set(node.id, {
      id: node.id,
      x: nodeDepth * COLUMN_WIDTH,
      y: row * ROW_HEIGHT,
    })
  }

  return positions
}
