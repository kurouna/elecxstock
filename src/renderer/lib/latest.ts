// 最後に出した要求の応答だけを受け取る（古い応答で新しい結果を上書きしない。NFR-A8 と同じ考え方）。
// 使い方: const fresh = latest()。要求の前に const ok = fresh()、応答のあとに if (!ok()) return
export function latest(): () => () => boolean {
  let n = 0
  return () => {
    const my = ++n
    return () => my === n
  }
}
