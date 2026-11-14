// テストの時刻（ELECXSTOCK_NOW）。main が渡したときだけ、renderer の Date を main・Core と同じだけずらす。main.ts の最初に読み込む
import { shiftClock } from '@shared/clock'

const offset = (window as { elecxstock?: { clockOffset?: number } }).elecxstock?.clockOffset
if (offset != null) shiftClock(offset)
