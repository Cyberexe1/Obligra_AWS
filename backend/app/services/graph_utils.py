"""Graph utilities for obligation dependency relationships.

Pure functions with no AWS or I/O dependencies, so they're easy to reason
about and test in isolation from the Bedrock/DynamoDB integration.
"""


def detect_cycles(edges: list[tuple[str, str]]) -> list[list[str]]:
    """Detect cycles in a directed graph of obligation relationships.

    `edges` is a list of (from_id, to_id) pairs. Returns a list of cycles,
    each expressed as the ordered list of node IDs forming the cycle
    (first and last element are the same node). Uses DFS with a
    recursion-stack marker, which finds one representative cycle per
    strongly-connected loop encountered — sufficient for flagging invalid
    dependency chains without needing an exhaustive enumeration of every
    cycle variant.
    """
    adjacency: dict[str, list[str]] = {}
    for source, target in edges:
        adjacency.setdefault(source, []).append(target)
        adjacency.setdefault(target, [])

    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {node: WHITE for node in adjacency}
    path: list[str] = []
    cycles: list[list[str]] = []

    def visit(node: str) -> None:
        color[node] = GRAY
        path.append(node)

        for neighbor in adjacency.get(node, []):
            if color.get(neighbor, WHITE) == WHITE:
                visit(neighbor)
            elif color.get(neighbor) == GRAY:
                # Found a back-edge into the current path: extract the cycle.
                cycle_start = path.index(neighbor)
                cycles.append([*path[cycle_start:], neighbor])

        path.pop()
        color[node] = BLACK

    for node in list(adjacency.keys()):
        if color[node] == WHITE:
            visit(node)

    return cycles
