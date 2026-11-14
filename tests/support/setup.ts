// Vitest の setupFiles: すべてのテストのファイルを、既定で基準日時（TEST_NOW）で動かす（docs/testing.md）。
// 時刻を止めずにずらすので、ジョブの待ち・タイマーはそのまま動く。時間を進めるテストは vi.useFakeTimers({ toFake: ['Date'] }) を使う
import { shiftClock, TEST_NOW } from '@shared/clock'

shiftClock(Date.parse(TEST_NOW) - Date.now())
