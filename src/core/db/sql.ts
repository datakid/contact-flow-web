export type SqlValue = string | number | null | Uint8Array | bigint;

export interface SqlStatement {
  bind(values: readonly SqlValue[]): SqlStatement;
  step(): boolean;
  reset(): SqlStatement;
  finalize(): void;
}

export interface SqlDb {
  exec(sql: string | { sql: string; bind?: readonly SqlValue[] }): unknown;
  prepare(sql: string): SqlStatement;
  selectArrays(sql: string, bind?: readonly SqlValue[]): unknown[][];
  selectObjects(sql: string, bind?: readonly SqlValue[]): Array<Record<string, unknown>>;
  selectValue(sql: string, bind?: readonly SqlValue[]): unknown;
  selectValues(sql: string, bind?: readonly SqlValue[]): unknown[];
  transaction<T>(callback: () => T): T;
  changes(): number;
  close(): void;
}

export function num(value: unknown): number {
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function placeholders(count: number): string {
  return new Array<string>(count).fill("?").join(",");
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function normalizeBinds(db: SqlDb): SqlDb {
  const bindOf = (bind?: readonly SqlValue[]): readonly SqlValue[] | undefined => (bind && bind.length > 0 ? bind : undefined);
  return {
    exec: (sql) => {
      if (typeof sql === "string") return db.exec(sql);
      return bindOf(sql.bind) ? db.exec(sql) : db.exec(sql.sql);
    },
    prepare: (sql) => db.prepare(sql),
    selectArrays: (sql, bind) => db.selectArrays(sql, bindOf(bind)),
    selectObjects: (sql, bind) => db.selectObjects(sql, bindOf(bind)),
    selectValue: (sql, bind) => db.selectValue(sql, bindOf(bind)),
    selectValues: (sql, bind) => db.selectValues(sql, bindOf(bind)),
    transaction: (callback) => db.transaction(callback),
    changes: () => db.changes(),
    close: () => db.close()
  };
}
