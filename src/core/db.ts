// SQLite（node:sqlite）。スキーマの版を持ち、起動時に移行する（FR-S1, S2）。
// リポジトリ層はここに閉じ込める（必要なら better-sqlite3 に替えられるように。decisions.md §3）。
import { statSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
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
  // v3: 決算発表の予定（銘柄情報。FR-I9）
  `ALTER TABLE quotes ADD COLUMN earnings_next TEXT; ALTER TABLE quotes ADD COLUMN earnings_last TEXT; ALTER TABLE quotes ADD COLUMN earnings_est INTEGER;`,
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
    // journal_size_limit: 大きなトランザクション（初回の取得・保存期間の短縮・全データの削除）のあとに、WAL を 64MB まで縮める
    this.raw.exec(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA journal_size_limit = 67108864;',
    )
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
  /**
   * 準備した文を SQL ごとに使い回す（取得・再計算の繰り返しの中で毎回 prepare しないため）。
   * IN (?, ?, …) のように数が変わる文は種類が増えるので、上限を超えたら古いものから捨てる
   */
  private stmts = new Map<string, StatementSync>()
  prepare(sql: string): StatementSync {
    let st = this.stmts.get(sql)
    if (st) {
      // 使った順に並べ直す（Map は挿入順なので、消して入れ直すと最後になる）
      this.stmts.delete(sql)
      this.stmts.set(sql, st)
      return st
    }
    st = this.raw.prepare(sql)
    this.stmts.set(sql, st)
    if (this.stmts.size > 200) this.stmts.delete(this.stmts.keys().next().value!)
    return st
  }
  all<T = Row>(sql: string, ...p: SQLInputValue[]): T[] {
    return this.prepare(sql).all(...p) as T[]
  }
  get<T = Row>(sql: string, ...p: SQLInputValue[]): T | undefined {
    return this.prepare(sql).get(...p) as T | undefined
  }
  /** 変わった行の数を返す */
  run(sql: string, ...p: SQLInputValue[]): number {
    return Number(this.prepare(sql).run(...p).changes)
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
  /** 空き領域を回収する。WAL モードの VACUUM は DB と同じ大きさの WAL を残すので、そのあとも WAL を空にする */
  vacuum(): void {
    this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);')
  }
  close(): void {
    this.stmts.clear()
    this.raw.close()
  }
}
