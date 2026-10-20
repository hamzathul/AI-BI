import type { CatalogRows } from './postgres.introspection.js';
import { assembleDiscoveredDatabase } from './postgres.introspection.js';

describe('assembleDiscoveredDatabase', () => {
  it('assembles schemas, objects, columns, keys, and relations', () => {
    const rows: CatalogRows = {
      schemas: [{ name: 'hr' }, { name: 'public' }],
      objects: [
        { schema_name: 'hr', object_name: 'employees', kind: 'table' },
        { schema_name: 'hr', object_name: 'headcount', kind: 'view' },
      ],
      columns: [
        {
          schema_name: 'hr',
          object_name: 'employees',
          column_name: 'id',
          data_type: 'integer',
          nullable: false,
          default_value: null,
          comment: null,
          ordinal_position: 1,
        },
        {
          schema_name: 'hr',
          object_name: 'employees',
          column_name: 'salary',
          data_type: 'numeric(10,2)',
          nullable: false,
          default_value: null,
          comment: 'Annual gross salary.',
          ordinal_position: 2,
        },
        {
          schema_name: 'hr',
          object_name: 'headcount',
          column_name: 'department',
          data_type: 'character varying(100)',
          nullable: true,
          default_value: null,
          comment: null,
          ordinal_position: 1,
        },
      ],
      primaryKeys: [
        { schema_name: 'hr', object_name: 'employees', column_name: 'id' },
      ],
      relations: [
        {
          name: 'employees_manager_id_fkey',
          from_schema: 'hr',
          from_object: 'employees',
          from_column: 'manager_id',
          to_schema: 'hr',
          to_object: 'employees',
          to_column: 'id',
        },
      ],
    };

    const result = assembleDiscoveredDatabase(rows);

    expect(result.schemas).toHaveLength(2);
    expect(result.schemas[0]).toMatchObject({
      name: 'hr',
      objects: [
        {
          name: 'employees',
          kind: 'table',
          primaryKey: ['id'],
          columns: [
            {
              name: 'id',
              dataType: 'integer',
              nullable: false,
              ordinalPosition: 1,
            },
            {
              name: 'salary',
              dataType: 'numeric(10,2)',
              comment: 'Annual gross salary.',
              ordinalPosition: 2,
            },
          ],
        },
        {
          name: 'headcount',
          kind: 'view',
          primaryKey: [],
          columns: [
            {
              name: 'department',
              dataType: 'varchar(100)',
              nullable: true,
            },
          ],
        },
      ],
    });
    expect(result.schemas[1]).toEqual({ name: 'public', objects: [] });
    expect(result.relations).toEqual([
      {
        name: 'employees_manager_id_fkey',
        from: { schema: 'hr', object: 'employees', column: 'manager_id' },
        to: { schema: 'hr', object: 'employees', column: 'id' },
      },
    ]);
  });

  it('ignores catalog rows for objects that were not selected', () => {
    const result = assembleDiscoveredDatabase({
      schemas: [{ name: 'hr' }],
      objects: [],
      columns: [
        {
          schema_name: 'hr',
          object_name: 'ghost',
          column_name: 'id',
          data_type: 'integer',
          nullable: false,
          default_value: null,
          comment: null,
          ordinal_position: 1,
        },
      ],
      primaryKeys: [
        { schema_name: 'hr', object_name: 'ghost', column_name: 'id' },
      ],
      relations: [],
    });

    expect(result).toEqual({
      schemas: [{ name: 'hr', objects: [] }],
      relations: [],
    });
  });
});
