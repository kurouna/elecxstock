// Yahoo の失敗の分類（FR-F3）。429 は 24 時間、間隔を遅くするきっかけ（FR-F2）なので、取り違えないことを確かめる。
// 失敗の形は yahoo-finance2 4.x（HTTPError は code に HTTP の状態・message に本文。JSON の誤りは code の名前の Error）
import { classifyError } from '@core/providers/yahoo'
import { describe, expect, it } from 'vitest'

const httpError = (code: number, body: string) => Object.assign(new Error(body), { name: 'HTTPError', code })

describe('失敗の分類と 429 の見分け（FR-F2・FR-F3）', () => {
  it('HTTP の状態が 429 ならプロバイダ単位の 429', () => {
    const e = classifyError(httpError(429, 'Too Many Requests'))
    expect([e.scope, e.status]).toEqual(['provider', 429])
    expect(classifyError(httpError(429, '')).status).toBe(429)
  })
  it('クランブの取得の「status 429」・JSON の TooManyRequests・rate limit の文も 429', () => {
    expect(classifyError(new Error('Failed to get crumb, status 429, statusText: Too Many Requests')).status).toBe(429)
    expect(classifyError(Object.assign(new Error('架空の説明'), { name: 'TooManyRequestsError' })).status).toBe(429)
    expect(classifyError(new Error('Rate limit exceeded')).status).toBe(429)
  })
  it('本文に数字の 429 があるだけでは 429 にしない（24 時間ずっと遅くならないように）', () => {
    const e = classifyError(httpError(500, '<html>error id 4291 at line 429</html>'))
    expect([e.scope, e.status]).toEqual(['provider', 500])
    expect(classifyError(new Error('No data found, symbol may be delisted (ref 429)')).status).toBe(404)
  })
  it('5xx の状態はプロバイダ単位、404・データなしは銘柄単位、通信断はオフライン', () => {
    expect(classifyError(httpError(503, '')).scope).toBe('provider')
    expect(classifyError(httpError(404, 'Not Found')).scope).toBe('symbol')
    expect(classifyError(new Error('No data found, symbol may be delisted')).scope).toBe('symbol')
    expect(classifyError(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })).scope).toBe('offline')
  })
})
