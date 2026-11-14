// テストの時刻（ELECXSTOCK_NOW。スタブのときだけ）。ほかのモジュールが日時を読む前にずらすため、main と Core の入口の最初に読み込む
import { clockOffsetFrom, shiftClock } from '@shared/clock'

export const clockOffset = clockOffsetFrom(process.env)
if (clockOffset != null) shiftClock(clockOffset)
