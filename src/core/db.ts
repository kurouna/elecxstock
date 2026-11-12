// SQLite（node:sqlite）。スキーマの版を持ち、起動時に移行する（FR-S1, S2）。
// リポジトリ層はここに閉じ込める（必要なら better-sqlite3 に替えられるように。decisions.md §3）。
import { statSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { METRIC_COLUMNS } from '@shared/fields'

export type Row = Record<string, SQLInputValue>

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE instruments (
    id TEXT PRIMARY KEY, code TEXT NOT NULL, name_ja TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL, kind TEXT NOT NULL, sector_ja TEXT NOT NULL DEFAULT '', sector_en TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active', user_added INTEGER NOT NULL DEFAULT 0, yahoo TEXT NOT NULL,
    updated TEXT
  );
  CREATE TABLE daily_bars (
    id TEXT NOT NULL, d TEXT NOT NULL, o REAL, h REAL, l REAL, c REAL, v REAL, prov INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, d)
  ) WITHOUT ROWID;
  CREATE TABLE monthly_bars (
    id TEXT NOT NULL, m TEXT NOT NULL, o REAL, h REAL, l REAL, c REAL, v REAL,
    PRIMARY KEY (id, m)
  ) WITHOUT ROWID;
  CREATE TABLE actions (
    id TEXT NOT NULL, d TEXT NOT NULL, type TEXT NOT NULL, value REAL NOT NULL,
    PRIMARY KEY (id, d, type)
  ) WITHOUT ROWID;
  CREATE TABLE quotes (
    id TEXT PRIMARY KEY, t TEXT, price REAL, open REAL, high REAL, low REAL, volume REAL, prev_close REAL,
    per REAL, pbr REAL, market_cap REAL, shares REAL, bps REAL, eps REAL, fetched TEXT
  );
  CREATE TABLE fetch_state (
    id TEXT PRIMARY KEY, last_daily TEXT, last_full TEXT, last_monthly TEXT, fails INTEGER NOT NULL DEFAULT 0,
    last_error TEXT, last_error_at TEXT
  );
  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, status TEXT NOT NULL, items TEXT NOT NULL,
    pos INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL
  );
  ${metricsTable()}
  `,
  // v2: 指標の列を足した（P2）。metrics は日足から作り直せるので、表を作り直して起動時に再計算する
  `DROP TABLE metrics; ${metricsTable()}
   INSERT INTO meta(key, value) VALUES('metricsStale', '1') ON CONFLICT(key) DO UPDATE SET value = '1';`,
]

/** metrics 表（FR-S10）。列は登録表の METRIC_COLUMNS から作る。列を足したら MIGRATIONS に作り直しを足す */
function metricsTable(): string {
  return `CREATE TABLE metrics (
    id TEXT PRIMARY KEY, as_of TEXT, prov INTEGER NOT NULL DEFAULT 0, record_months TEXT NOT NULL DEFAULT '',
    gap_suspect INTEGER NOT NULL DEFAULT 0, anomaly INTEGER NOT NULL DEFAULT 0,
    ${METRIC_COLUMNS.map((c) => `${c} REAL`).join(', ')}
  );`
}

export class Db {
  readonly raw: DatabaseSync
  constructor(readonly file: string) {
    this.raw = new DatabaseSync(file)
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
    this.migrate()
  }
  private migrate(): void {
    const v = Number((this.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
    for (let i = v; i < MIGRATIONS.length; i++) {
      this.tx(() => {
        this.raw.exec(MIGRATIONS[i]!)
        this.raw.exec(`PRAGMA user_version = ${i + 1}`)
      })
    }
  }
  tx<T>(f: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE')
    try {
      const r = f()
      this.raw.exec('COMMIT')
      return r
    } catch (e) {
      this.raw.exec('ROLLBACK')
      throw e
    }
  }
  all<T = Row>(sql: string, ...p: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...p) as T[]
  }
  get<T = Row>(sql: string, ...p: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...p) as T | undefined
  }
  run(sql: string, ...p: SQLInputValue[]): void {
    this.raw.prepare(sql).run(...p)
  }
  meta(key: string): string | null {
    return (this.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value as string | undefined) ?? null
  }
  setMeta(key: string, value: string): void {
    this.run('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }
  bytes(): number {
    let n = 0
    for (const s of ['', '-wal']) {
      try {
        n += statSync(this.file + s).size
      } catch {
        /* none */
      }
    }
    return n
  }
  vacuum(): void {
    this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;')
  }
  close(): void {
    this.raw.close()
  }
}
