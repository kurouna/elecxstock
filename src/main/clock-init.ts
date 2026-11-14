// テストの時刻（ELECXSTOCK_NOW。スタブのときだけ）。ほかのモジュールが日時を読む前にずらすため、入口の最初に読み込む（Core は src/core/clock-init.ts）
import { clockOffsetFrom, shiftClock } from '@shared/clock'

export const clockOffset = clockOffsetFrom(process.env)
if (clockOffset != null) shiftClock(clockOffset)
