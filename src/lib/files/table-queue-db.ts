/**
 * A tiny stand-in for getDb() in tests of thin database code: each query
 * answers with the next result queued for the table it reads, updates, or
 * deletes from, and `execute` with the next raw result. Queries are not interpreted;
 * the code under test owns the SQL, and the pure rules carry the decisions.
 * Not for production code.
 */

type Settle = (value: unknown) => unknown;

/** Builds the fake. `byTable` maps a Drizzle table to the results its queries get, in order. */
export function createTableQueueDb(byTable: ReadonlyMap<unknown, unknown[]>, executeResults: unknown[] = []) {
  function next(table: unknown): unknown {
    const queue = byTable.get(table);
    if (!queue || queue.length === 0) throw new Error("The fake database has no result queued for that table.");
    return queue.shift();
  }

  function query(table: unknown) {
    const chain = {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      returning: () => chain,
      then: (resolve: Settle, reject: Settle) => Promise.resolve().then(() => next(table)).then(resolve, reject),
    };
    return chain;
  }

  const select = () => ({ from: query });
  return {
    select,
    selectDistinct: select,
    delete: query,
    update: (table: unknown) => ({ set: () => query(table) }),
    execute: () => Promise.resolve(executeResults.shift()),
  };
}
