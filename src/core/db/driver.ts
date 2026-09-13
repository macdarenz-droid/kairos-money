export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;
export interface Driver {
  query(sql: string, values?: readonly SqlValue[]): Promise<SqlRow[]>;
  execute(sql: string, values?: readonly SqlValue[]): Promise<void>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
