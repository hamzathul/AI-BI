import type { PoolClient } from 'pg';
import type {
  DiscoveredColumn,
  DiscoveredDatabase,
  DiscoveredObject,
  DiscoveredRelation,
  DiscoveredSchema,
} from '../connector.types.js';
import { canonicalType } from './postgres.types.js';

/**
 * Catalog introspection (D40).
 *
 * We read `pg_catalog` rather than `information_schema` because it exposes
 * comments, defaults, identity/partition details, and stable OIDs. All queries
 * are ordered — Postgres returns rows in the requested order, and we rely on
 * that to keep columns and keys in their natural position.
 *
 * Visibility rules: only schemas the role can USAGE, and only objects it can
 * SELECT. Metadata should describe what the app may actually query, not what
 * happens to exist on the server.
 */

interface SchemaRow {
  name: string;
}

interface ObjectRow {
  schema_name: string;
  object_name: string;
  kind: 'table' | 'view';
}

interface ColumnRow {
  schema_name: string;
  object_name: string;
  column_name: string;
  data_type: string;
  nullable: boolean;
  default_value: string | null;
  comment: string | null;
  ordinal_position: number;
}

interface PrimaryKeyRow {
  schema_name: string;
  object_name: string;
  column_name: string;
}

interface RelationRow {
  name: string;
  from_schema: string;
  from_object: string;
  from_column: string;
  to_schema: string;
  to_object: string;
  to_column: string;
}

export interface CatalogRows {
  schemas: SchemaRow[];
  objects: ObjectRow[];
  columns: ColumnRow[];
  primaryKeys: PrimaryKeyRow[];
  relations: RelationRow[];
}

const SCHEMAS_SQL = `
  SELECT n.nspname AS name
  FROM pg_catalog.pg_namespace n
  WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND has_schema_privilege(n.oid, 'USAGE')
  ORDER BY n.nspname
`;

const OBJECTS_SQL = `
  SELECT n.nspname AS schema_name,
         c.relname AS object_name,
         CASE WHEN c.relkind IN ('v', 'm') THEN 'view' ELSE 'table' END AS kind
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'f', 'v', 'm')
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND has_schema_privilege(n.oid, 'USAGE')
    AND has_table_privilege(c.oid, 'SELECT')
  ORDER BY n.nspname, c.relname
`;

const COLUMNS_SQL = `
  SELECT n.nspname AS schema_name,
         c.relname AS object_name,
         a.attname AS column_name,
         pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
         NOT a.attnotnull AS nullable,
         pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_value,
         pg_catalog.col_description(c.oid, a.attnum) AS comment,
         a.attnum AS ordinal_position
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND c.relkind IN ('r', 'p', 'f', 'v', 'm')
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND has_schema_privilege(n.oid, 'USAGE')
    AND has_table_privilege(c.oid, 'SELECT')
  ORDER BY n.nspname, c.relname, a.attnum
`;

const PRIMARY_KEYS_SQL = `
  SELECT n.nspname AS schema_name,
         c.relname AS object_name,
         a.attname AS column_name
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
  JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid AND a.attnum = k.attnum
  WHERE i.indisprimary
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND has_schema_privilege(n.oid, 'USAGE')
    AND has_table_privilege(c.oid, 'SELECT')
  ORDER BY n.nspname, c.relname, k.ord
`;

const RELATIONS_SQL = `
  SELECT con.conname AS name,
         n.nspname AS from_schema,
         c.relname AS from_object,
         a.attname AS from_column,
         fn.nspname AS to_schema,
         fc.relname AS to_object,
         fa.attname AS to_column
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_class fc ON fc.oid = con.confrelid
  JOIN pg_catalog.pg_namespace fn ON fn.oid = fc.relnamespace
  JOIN LATERAL unnest(con.conkey, con.confkey)
    WITH ORDINALITY AS k(from_attnum, to_attnum, ord) ON true
  JOIN pg_catalog.pg_attribute a
    ON a.attrelid = con.conrelid AND a.attnum = k.from_attnum
  JOIN pg_catalog.pg_attribute fa
    ON fa.attrelid = con.confrelid AND fa.attnum = k.to_attnum
  WHERE con.contype = 'f'
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND fn.nspname !~ '^pg_'
    AND fn.nspname <> 'information_schema'
    AND has_schema_privilege(n.oid, 'USAGE')
    AND has_schema_privilege(fn.oid, 'USAGE')
    AND has_table_privilege(c.oid, 'SELECT')
    AND has_table_privilege(fc.oid, 'SELECT')
  ORDER BY n.nspname, c.relname, con.conname, k.ord
`;

/** Runs the five catalog reads on one client (inside the caller's transaction). */
export async function readCatalog(client: PoolClient): Promise<CatalogRows> {
  const schemas = await client.query<SchemaRow>(SCHEMAS_SQL);
  const objects = await client.query<ObjectRow>(OBJECTS_SQL);
  const columns = await client.query<ColumnRow>(COLUMNS_SQL);
  const primaryKeys = await client.query<PrimaryKeyRow>(PRIMARY_KEYS_SQL);
  const relations = await client.query<RelationRow>(RELATIONS_SQL);

  return {
    schemas: schemas.rows,
    objects: objects.rows,
    columns: columns.rows,
    primaryKeys: primaryKeys.rows,
    relations: relations.rows,
  };
}

function objectKey(schema: string, object: string): string {
  return `${schema}\u0000${object}`;
}

/**
 * Pure assembly step: flat catalog rows → the nested contract shape.
 * Kept separate from the driver so it is easy to test with fixtures.
 */
export function assembleDiscoveredDatabase(
  rows: CatalogRows,
): DiscoveredDatabase {
  const schemas: DiscoveredSchema[] = rows.schemas.map((row) => ({
    name: row.name,
    objects: [],
  }));
  const schemaByName = new Map(schemas.map((schema) => [schema.name, schema]));
  const objectByKey = new Map<string, DiscoveredObject>();

  for (const row of rows.objects) {
    const schema = schemaByName.get(row.schema_name);
    if (!schema) continue;

    const object: DiscoveredObject = {
      name: row.object_name,
      kind: row.kind,
      columns: [],
      primaryKey: [],
    };

    schema.objects.push(object);
    objectByKey.set(objectKey(row.schema_name, row.object_name), object);
  }

  for (const row of rows.columns) {
    const object = objectByKey.get(objectKey(row.schema_name, row.object_name));
    if (!object) continue;

    const column: DiscoveredColumn = {
      name: row.column_name,
      dataType: canonicalType(row.data_type),
      nullable: row.nullable,
      defaultValue: row.default_value,
      comment: row.comment,
      ordinalPosition: row.ordinal_position,
    };

    object.columns.push(column);
  }

  for (const row of rows.primaryKeys) {
    objectByKey
      .get(objectKey(row.schema_name, row.object_name))
      ?.primaryKey.push(row.column_name);
  }

  const relations: DiscoveredRelation[] = rows.relations.map((row) => ({
    name: row.name,
    from: {
      schema: row.from_schema,
      object: row.from_object,
      column: row.from_column,
    },
    to: {
      schema: row.to_schema,
      object: row.to_object,
      column: row.to_column,
    },
  }));

  return { schemas, relations };
}
