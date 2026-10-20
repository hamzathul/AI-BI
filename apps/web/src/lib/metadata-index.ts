import type {
  MetadataObject,
  MetadataRelation,
  MetadataSnapshot,
} from "./api/types";

export interface IndexedObject extends MetadataObject {
  schema: string;
  key: string;
  columnCount: number;
}

export interface ObjectRelations {
  outgoing: MetadataRelation[];
  incoming: MetadataRelation[];
}

export interface MetadataIndex {
  objects: IndexedObject[];
  schemas: { name: string; objects: IndexedObject[] }[];
  counts: {
    schemas: number;
    objects: number;
    columns: number;
    relations: number;
  };
  /** Column key → relations where this column is either side of the FK. */
  fkByColumn: Map<string, MetadataRelation[]>;
  relationsByObject: Map<string, ObjectRelations>;
}

export function objectKey(schema: string, object: string): string {
  return `${schema}.${object}`;
}

export function columnKey(
  schema: string,
  object: string,
  column: string,
): string {
  return `${schema}.${object}.${column}`;
}

/**
 * Turns the API tree + flat relation list into the lookups the browser needs.
 * Pure and unit-tested, so the React component stays mostly presentational.
 */
export function buildMetadataIndex(snapshot: MetadataSnapshot): MetadataIndex {
  const objects: IndexedObject[] = [];
  const schemas = snapshot.schemas.map((schema) => ({
    name: schema.name,
    objects: [] as IndexedObject[],
  }));
  const schemaMap = new Map(schemas.map((schema) => [schema.name, schema]));

  for (const schema of snapshot.schemas) {
    for (const object of schema.objects) {
      const indexed: IndexedObject = {
        ...object,
        schema: schema.name,
        key: objectKey(schema.name, object.name),
        columnCount: object.columns.length,
      };

      objects.push(indexed);
      schemaMap.get(schema.name)?.objects.push(indexed);
    }
  }

  const fkByColumn = new Map<string, MetadataRelation[]>();
  const relationsByObject = new Map<string, ObjectRelations>();

  for (const object of objects) {
    relationsByObject.set(object.key, { outgoing: [], incoming: [] });
  }

  for (const relation of snapshot.relations) {
    const fromKey = objectKey(relation.from.schema, relation.from.object);
    const toKey = objectKey(relation.to.schema, relation.to.object);
    const fromColumn = columnKey(
      relation.from.schema,
      relation.from.object,
      relation.from.column,
    );
    const toColumn = columnKey(
      relation.to.schema,
      relation.to.object,
      relation.to.column,
    );

    for (const key of new Set([fromColumn, toColumn])) {
      const existing = fkByColumn.get(key) ?? [];
      existing.push(relation);
      fkByColumn.set(key, existing);
    }

    relationsByObject.get(fromKey)?.outgoing.push(relation);
    relationsByObject.get(toKey)?.incoming.push(relation);
  }

  return {
    objects,
    schemas,
    counts: {
      schemas: snapshot.schemas.length,
      objects: objects.length,
      columns: objects.reduce((sum, object) => sum + object.columnCount, 0),
      relations: snapshot.relations.length,
    },
    fkByColumn,
    relationsByObject,
  };
}
