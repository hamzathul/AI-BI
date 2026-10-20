import type {
  ConnectionTest,
  MetadataColumn,
  MetadataObject,
  MetadataSnapshot,
  SourceStatus,
  SyncResult,
} from "@/lib/api/types";

function column(
  id: string,
  name: string,
  dataType: string,
  overrides: Partial<MetadataColumn> = {},
): MetadataColumn {
  return {
    id,
    name,
    dataType,
    nullable: false,
    defaultValue: null,
    comment: null,
    isPrimaryKey: false,
    ordinalPosition: 1,
    ...overrides,
  };
}

const departments: MetadataObject = {
  id: "object-departments",
  name: "departments",
  kind: "TABLE",
  primaryKey: ["id"],
  columns: [
    column("col-dept-id", "id", "integer", {
      isPrimaryKey: true,
      defaultValue: "nextval('hr.departments_id_seq'::regclass)",
      ordinalPosition: 1,
    }),
    column("col-dept-name", "name", "text", {
      nullable: false,
      ordinalPosition: 2,
    }),
  ],
};

const employees: MetadataObject = {
  id: "object-employees",
  name: "employees",
  kind: "TABLE",
  primaryKey: ["id"],
  columns: [
    column("col-emp-id", "id", "integer", {
      isPrimaryKey: true,
      ordinalPosition: 1,
    }),
    column("col-emp-first", "first_name", "text", { ordinalPosition: 2 }),
    column("col-emp-last", "last_name", "text", { ordinalPosition: 3 }),
    column("col-emp-salary", "salary", "numeric(10,2)", {
      ordinalPosition: 4,
      comment: "Annual gross salary.",
    }),
    column("col-emp-dept", "department_id", "integer", {
      nullable: true,
      ordinalPosition: 5,
    }),
    column("col-emp-manager", "manager_id", "integer", {
      nullable: true,
      ordinalPosition: 6,
    }),
  ],
};

const headcountView: MetadataObject = {
  id: "object-headcount",
  name: "headcount_by_department",
  kind: "VIEW",
  primaryKey: [],
  columns: [
    column("col-view-dept", "department", "text", { ordinalPosition: 1 }),
    column("col-view-count", "headcount", "bigint", { ordinalPosition: 2 }),
  ],
};

export const metadataSnapshot: MetadataSnapshot = {
  syncedAt: "2026-10-20T08:15:01.250Z",
  schemas: [
    {
      name: "hr",
      objects: [departments, employees, headcountView],
    },
  ],
  relations: [
    {
      id: "relation-dept",
      name: "employees_department_id_fkey",
      from: {
        schema: "hr",
        object: "employees",
        column: "department_id",
      },
      to: { schema: "hr", object: "departments", column: "id" },
    },
    {
      id: "relation-manager",
      name: "employees_manager_id_fkey",
      from: { schema: "hr", object: "employees", column: "manager_id" },
      to: { schema: "hr", object: "employees", column: "id" },
    },
  ],
};

export const sourceStatusNoSync: SourceStatus = {
  configured: true,
  database: "acme",
  lastSync: null,
};

export const sourceStatusFailed: SourceStatus = {
  configured: true,
  database: "acme",
  lastSync: {
    status: "FAILED",
    startedAt: "2026-10-20T08:15:00.000Z",
    finishedAt: "2026-10-20T08:15:01.250Z",
    error: "The source database rejected the credentials.",
  },
};

export const connectionTest: ConnectionTest = {
  serverVersion: "18.6",
  database: "acme",
  readOnly: true,
  latencyMs: 4,
};

export const syncResult: SyncResult = {
  id: "sync-run-1",
  status: "SUCCEEDED",
  startedAt: "2026-10-20T08:15:00.000Z",
  finishedAt: "2026-10-20T08:15:01.250Z",
  error: null,
  counts: { schemas: 2, objects: 8, columns: 38, relations: 5 },
};
