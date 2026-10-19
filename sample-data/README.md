# sample-data — Acme Inc.

A small, realistic **source database** for local development: the database AI BI
later introspects, syncs, and queries. It deliberately contains two domains —
HR and sales — so we never bake in a single-domain assumption (D3).

> **Destructive and dev-only.** Loading drops and recreates the whole `acme`
> database. Never point `seed.sql` at anything but your local Docker Postgres.

## Layout

| Schema | Objects |
|---|---|
| `hr` | `departments`, `employees`, view `department_headcount` |
| `sales` | `customers`, `products`, `orders`, `order_items`, view `order_totals` |

`acme_reader` is the read-only role the app uses: `CONNECT` + `SELECT` only —
no writes, no DDL, not even temporary tables.

Data is deterministic: fixed dates and `generate_series` instead of `random()`.
Reloading always produces the same numbers, which keeps later aggregate tests
and AI evals reproducible.

## Load

```bash
docker compose up -d     # make sure Postgres is running
pnpm db:seed             # from the repo root; safe to re-run anytime
```

Raw equivalent, if you want to see what the script does:

```bash
docker compose cp sample-data/seed.sql postgres:/tmp/acme-seed.sql
docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/acme-seed.sql
```

## Verify as the read-only user

Connect over TCP (`-h 127.0.0.1`) so we test the same path the app will use —
password and grants included — not the container's local trust socket.

```bash
docker compose exec -T -e PGPASSWORD=acme_reader_dev postgres \
  psql -h 127.0.0.1 -U acme_reader -d acme -c "SELECT count(*) FROM hr.employees;"

docker compose exec -T -e PGPASSWORD=acme_reader_dev postgres \
  psql -h 127.0.0.1 -U acme_reader -d acme -c "
    SELECT d.name AS department, count(*) AS active_headcount
    FROM hr.departments d
    JOIN hr.employees e ON e.department_id = d.id
    WHERE e.is_active
    GROUP BY d.name
    ORDER BY 2 DESC;"

docker compose exec -T -e PGPASSWORD=acme_reader_dev postgres \
  psql -h 127.0.0.1 -U acme_reader -d acme -c "
    SELECT date_trunc('month', o.order_date) AS month,
           sum(i.quantity * i.unit_price) AS revenue
    FROM sales.orders o
    JOIN sales.order_items i ON i.order_id = o.id
    WHERE o.status <> 'cancelled'
    GROUP BY 1
    ORDER BY 1;"
```

Writes must fail — that is the point of the role:

```bash
docker compose exec -T -e PGPASSWORD=acme_reader_dev postgres \
  psql -h 127.0.0.1 -U acme_reader -d acme -c "INSERT INTO hr.departments (name) VALUES ('nope');"
# ERROR:  permission denied for table departments
```

## Connection string

The app reads the source database from `SOURCE_DATABASE_URL` (added in step
2.1a-ii):

```
postgresql://acme_reader:acme_reader_dev@localhost:5433/acme
```
