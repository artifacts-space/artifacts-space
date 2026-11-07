import { getTableColumns, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";

/**
 * A small in-memory stand-in for getDb() in project tests. It understands
 * what src/lib/projects runs: selects, inserts, updates, and deletes on one
 * table whose WHERE is a chain of `column = value` joined by AND (other
 * comparisons are ignored). Not for production code.
 */

type Row = Record<string, unknown>;

const dialect = new PgDialect();
const equality = /"(\w+)" = \$(\d+)/g;

/** Maps SQL column names to the row's field names, per table. */
function fieldNames(table: PgTable): Map<string, string> {
  return new Map(Object.entries(getTableColumns(table)).map(([field, column]) => [column.name, field]));
}

/** A thenable query result, so `await db.select()...` works with or without `.limit()`. */
function result<T>(produce: () => T) {
  return {
    limit: () => Promise.resolve(produce()),
    returning: () => Promise.resolve(produce()),
    then: <R>(resolve: (value: T) => R, reject?: (reason: unknown) => R) => Promise.resolve().then(produce).then(resolve, reject),
  };
}

/** Builds a fake database over the given tables. `log` records every write, in order. */
export function createFakeDb(tables: ReadonlyMap<unknown, Row[]>) {
  const log: { op: "insert" | "update" | "delete"; table: PgTable; values: Row }[] = [];

  function rowsOf(table: PgTable): Row[] {
    const rows = tables.get(table);
    if (!rows) throw new Error("The fake database has no such table.");
    return rows;
  }

  function matcher(table: PgTable, condition: SQL | undefined) {
    if (!condition) return () => true;
    const fields = fieldNames(table);
    const { sql, params } = dialect.sqlToQuery(condition);
    const checks = [...sql.matchAll(equality)].map(([, column = "", index = "0"]) => ({ field: fields.get(column) ?? column, value: params[Number(index) - 1] }));
    return (row: Row) => checks.every((check) => row[check.field] === check.value);
  }

  const db = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: PgTable) => ({
        where: (condition?: SQL) =>
          result(() => {
            const rows = rowsOf(table).filter(matcher(table, condition));
            return fields && "total" in fields ? [{ total: rows.length }] : rows;
          }),
      }),
    }),
    insert: (table: PgTable) => ({
      values: (values: Row) => ({
        onConflictDoNothing: () =>
          result(() => {
            const rows = rowsOf(table);
            const clash = rows.some((row) => row.nameKey === values.nameKey && row.userId === values.userId && row.teamId === values.teamId);
            if (!clash) rows.push({ ...values });
            log.push({ op: "insert", table, values });
            return [];
          }),
      }),
    }),
    update: (table: PgTable) => ({
      set: (values: Row) => ({
        where: (condition?: SQL) =>
          result(() => {
            const matching = rowsOf(table).filter(matcher(table, condition));
            for (const row of matching) Object.assign(row, values);
            log.push({ op: "update", table, values });
            return matching;
          }),
      }),
    }),
    delete: (table: PgTable) => ({
      where: (condition?: SQL) =>
        result(() => {
          const rows = rowsOf(table);
          const keep = rows.filter((row) => !matcher(table, condition)(row));
          log.push({ op: "delete", table, values: {} });
          rows.splice(0, rows.length, ...keep);
          return [];
        }),
    }),
  };
  return { db, log };
}
