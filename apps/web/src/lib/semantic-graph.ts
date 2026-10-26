import type {
  MetadataSnapshot,
  SemanticModel,
} from "./api/types";
import { isDateType } from "./type-family";

/** A dimension with the source column type the metadata snapshot knows about. */
export interface GraphDimension {
  name: string;
  dataset: string;
  column: string;
  dataType: string;
  isDate: boolean;
  description?: string;
}

export interface GraphMetric {
  name: string;
  dataset: string;
  agg: string;
  description?: string;
}

/**
 * The semantic model as the builder needs it: flat dimension/metric lists with
 * their dataset, plus join reachability from a fact dataset.
 *
 * Joins are directed child -> parent, exactly like the server's planner (D50),
 * so a dimension is offered only when the query can actually reach it.
 */
export interface SemanticGraph {
  datasets: string[];
  dimensions: GraphDimension[];
  metrics: GraphMetric[];
  datasetOfMetric(name: string): string | undefined;
  datasetOfDimension(name: string): string | undefined;
  /** Datasets reachable from `dataset` by following child -> parent joins. */
  reachableFrom(dataset: string): Set<string>;
  /**
   * A sensible starting dataset: the one that joins out the most (a fact
   * table), then the one carrying the most metrics.
   */
  primaryDataset: string | undefined;
  /** Reachable dimensions, nearest first (the fact's own, then parents). */
  dimensionsFor(dataset: string): GraphDimension[];
  metricsFor(dataset: string): GraphMetric[];
  /** The single fact dataset of these metrics, or undefined when mixed. */
  datasetForMetrics(metrics: string[]): string | undefined;
  isDateDimension(name: string): boolean;
}

export function buildSemanticGraph(
  model: SemanticModel,
  metadata: MetadataSnapshot | undefined,
): SemanticGraph {
  const columnTypes = new Map<string, Map<string, string>>();

  for (const schema of metadata?.schemas ?? []) {
    for (const object of schema.objects) {
      columnTypes.set(
        `${schema.name}.${object.name}`,
        new Map(object.columns.map((column) => [column.name, column.dataType])),
      );
    }
  }

  const dimensions: GraphDimension[] = [];
  const metrics: GraphMetric[] = [];

  for (const dataset of model.datasets) {
    const types = columnTypes.get(
      `${dataset.source.schema}.${dataset.source.object}`,
    );

    for (const dimension of dataset.dimensions ?? []) {
      const dataType = types?.get(dimension.column) ?? "";

      dimensions.push({
        name: dimension.name,
        dataset: dataset.name,
        column: dimension.column,
        dataType,
        isDate: isDateType(dataType),
        description: dimension.description,
      });
    }

    for (const metric of dataset.metrics ?? []) {
      metrics.push({
        name: metric.name,
        dataset: dataset.name,
        agg: metric.agg,
        description: metric.description,
      });
    }
  }

  const dimensionByName = new Map(
    dimensions.map((dimension) => [dimension.name, dimension]),
  );
  const metricByName = new Map(metrics.map((metric) => [metric.name, metric]));

  const outgoing = new Map<string, Set<string>>();
  for (const join of model.joins ?? []) {
    const parents = outgoing.get(join.from.dataset) ?? new Set<string>();
    parents.add(join.to.dataset);
    outgoing.set(join.from.dataset, parents);
  }

  const reachableCache = new Map<string, Set<string>>();
  const distanceCache = new Map<string, Map<string, number>>();

  /** Join distance from `dataset` to every reachable dataset (BFS). */
  function distancesFrom(dataset: string): Map<string, number> {
    const cached = distanceCache.get(dataset);
    if (cached) return cached;

    const distances = new Map<string, number>([[dataset, 0]]);
    const queue = [dataset];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nextDistance = (distances.get(current) ?? 0) + 1;

      for (const parent of outgoing.get(current) ?? []) {
        if (distances.has(parent)) continue;
        distances.set(parent, nextDistance);
        queue.push(parent);
      }
    }

    distanceCache.set(dataset, distances);
    return distances;
  }

  function reachableFrom(dataset: string): Set<string> {
    const cached = reachableCache.get(dataset);
    if (cached) return cached;

    const reachable = new Set(distancesFrom(dataset).keys());
    reachableCache.set(dataset, reachable);
    return reachable;
  }

  /**
   * Nearest dimensions first. A metric's own dataset has no joins to walk, so
   * this puts the fact's own columns before one-hop parents and grandparents.
   */
  function dimensionsFor(dataset: string): GraphDimension[] {
    const distances = distancesFrom(dataset);

    return dimensions
      .filter((dimension) => distances.has(dimension.dataset))
      .sort(
        (a, b) =>
          (distances.get(a.dataset) ?? 0) - (distances.get(b.dataset) ?? 0),
      );
  }

  function primaryDataset(): string | undefined {
    let best: string | undefined;
    let bestScore = -1;

    for (const { name } of model.datasets) {
      const score =
        (outgoing.get(name)?.size ?? 0) * 100 +
        metrics.filter((metric) => metric.dataset === name).length;

      if (score > bestScore) {
        best = name;
        bestScore = score;
      }
    }

    return best;
  }

  function datasetForMetrics(names: string[]): string | undefined {
    const datasets = new Set(
      names.map((name) => metricByName.get(name)?.dataset),
    );

    if (datasets.size !== 1) return undefined;
    return [...datasets][0];
  }

  return {
    datasets: model.datasets.map((dataset) => dataset.name),
    dimensions,
    metrics,
    datasetOfMetric: (name) => metricByName.get(name)?.dataset,
    datasetOfDimension: (name) => dimensionByName.get(name)?.dataset,
    reachableFrom,
    primaryDataset: primaryDataset(),
    dimensionsFor,
    metricsFor: (dataset) =>
      metrics.filter((metric) => metric.dataset === dataset),
    datasetForMetrics,
    isDateDimension: (name) => dimensionByName.get(name)?.isDate ?? false,
  };
}
