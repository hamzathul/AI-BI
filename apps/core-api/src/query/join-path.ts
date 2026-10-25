/**
 * Deterministic join planning for the QuerySpec compiler (D50).
 *
 * Joins are directed child -> parent (FK direction). A query starts at one fact
 * dataset and walks outward to the dimension datasets it needs. BFS is enough:
 * every edge is many-to-one, so no row can be duplicated by a hop.
 */

export type JoinType = 'left' | 'inner';

export interface JoinEdge {
  name: string;
  fromDataset: string;
  fromColumn: string;
  toDataset: string;
  toColumn: string;
  type: JoinType;
}

interface ParentEdge {
  edge: JoinEdge;
  depth: number;
}

export interface JoinPlan {
  /** Edges in the order they must be emitted (parent before child). */
  edges: JoinEdge[];
  /** Dataset name -> SQL alias. The base dataset is always `t0`. */
  aliases: Map<string, string>;
  /** Required datasets that cannot be reached from the base. */
  unreachable: string[];
}

function sortedJoins(joins: readonly JoinEdge[]): JoinEdge[] {
  return [...joins].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Finds one shortest path from `fromDataset` to `toDataset`.
 *
 * Ties are broken by join name so generated SQL is stable. Returns `[]` when
 * both endpoints are the same dataset.
 */
export function findJoinPath(
  joins: readonly JoinEdge[],
  fromDataset: string,
  toDataset: string,
): JoinEdge[] | null {
  if (fromDataset === toDataset) return [];

  const queue = [fromDataset];
  const visited = new Set([fromDataset]);
  const parent = new Map<string, JoinEdge>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of sortedJoins(joins)) {
      if (edge.fromDataset !== current) continue;
      if (visited.has(edge.toDataset)) continue;

      visited.add(edge.toDataset);
      parent.set(edge.toDataset, edge);

      if (edge.toDataset === toDataset) {
        const path: JoinEdge[] = [];
        let dataset = toDataset;
        while (dataset !== fromDataset) {
          const step = parent.get(dataset);
          if (!step) return null;
          path.unshift(step);
          dataset = step.fromDataset;
        }
        return path;
      }

      queue.push(edge.toDataset);
    }
  }

  return null;
}

/**
 * Plans all joins needed for a query.
 *
 * One BFS from the base records a parent edge for every reachable dataset.
 * Required datasets contribute the union of their paths; aliases are assigned
 * by (depth, join name), so a dataset closer to the fact table always gets the
 * lower alias number.
 */
export function planJoins(
  joins: readonly JoinEdge[],
  baseDataset: string,
  requiredDatasets: readonly string[],
): JoinPlan {
  const ordered = sortedJoins(joins);
  const queue = [baseDataset];
  const visited = new Set([baseDataset]);
  const parent = new Map<string, ParentEdge>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth =
      current === baseDataset ? 0 : (parent.get(current)?.depth ?? 0);

    for (const edge of ordered) {
      if (edge.fromDataset !== current) continue;
      if (visited.has(edge.toDataset)) continue;

      visited.add(edge.toDataset);
      parent.set(edge.toDataset, { edge, depth: depth + 1 });
      queue.push(edge.toDataset);
    }
  }

  const needed = new Map<string, ParentEdge>();
  const unreachable: string[] = [];

  for (const requested of new Set(requiredDatasets)) {
    if (requested === baseDataset) continue;

    if (!visited.has(requested)) {
      unreachable.push(requested);
      continue;
    }

    let dataset = requested;
    while (dataset !== baseDataset) {
      const step = parent.get(dataset);
      if (!step) break;
      needed.set(step.edge.name, step);
      dataset = step.edge.fromDataset;
    }
  }

  const edges = [...needed.values()]
    .sort((a, b) => a.depth - b.depth || a.edge.name.localeCompare(b.edge.name))
    .map((entry) => entry.edge);

  const aliases = new Map<string, string>([[baseDataset, 't0']]);
  edges.forEach((edge, index) => {
    aliases.set(edge.toDataset, `t${index + 1}`);
  });

  return { edges, aliases, unreachable };
}
