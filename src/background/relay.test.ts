import { describe, expect, it } from 'vitest'
import { type Poll, RelayError, pollUntil } from './relay'

/** A clock that only moves when the code sleeps or a poll takes time. */
function clock() {
  let t = 0
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms
      return Promise.resolve()
    },
    pass: (ms: number) => {
      t += ms
    },
  }
}

describe('pollUntil', () => {
  it('returns the value when it arrives', async () => {
    const c = clock()
    const rounds: Poll<string>[] = [
      { kind: 'pending' },
      { kind: 'pending' },
      { kind: 'ready', value: 'x' },
    ]
    const v = await pollUntil(
      120_000,
      () => Promise.resolve(rounds.shift() ?? { kind: 'gone' }),
      c.now,
      c.sleep,
    )
    expect(v).toBe('x')
  })

  it('returns null when the resource is gone or time runs out', async () => {
    const c = clock()
    expect(
      await pollUntil(10_000, () => Promise.resolve({ kind: 'gone' }), c.now, c.sleep),
    ).toBeNull()
    const waits: number[] = []
    const v = await pollUntil(
      90_000,
      (wait) => {
        waits.push(wait)
        c.pass(wait * 1000)
        return Promise.resolve({ kind: 'pending' })
      },
      c.now,
      c.sleep,
    )
    expect(v).toBeNull()
    expect(waits).toEqual([60, 30])
  })

  it('retries connection problems but not refusals', async () => {
    const c = clock()
    let calls = 0
    const v = await pollUntil(
      60_000,
      () => {
        calls++
        if (calls < 3) return Promise.reject(new RelayError(0, 'unreachable', 'down'))
        return Promise.resolve({ kind: 'ready', value: 1 })
      },
      c.now,
      c.sleep,
    )
    expect(v).toBe(1)
    await expect(
      pollUntil(
        60_000,
        () => Promise.reject(new RelayError(403, 'not_paired', '')),
        c.now,
        c.sleep,
      ),
    ).rejects.toThrow('403')
  })
})
