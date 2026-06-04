declare module "sql.js" {
  interface SqlJsStatic {
    Database: typeof Database;
  }

  interface Database {
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    run(sql: string, params?: unknown[]): Database;
    close(): void;
    export(): Uint8Array;
  }

  interface Statement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(params?: unknown[]): Record<string, unknown>;
    run(params?: unknown[]): void;
    free(): boolean;
    reset(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
  export { Database, Statement, QueryExecResult, SqlJsStatic };
}
