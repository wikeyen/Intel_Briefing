// ABOUTME: Tests for the Semaphore concurrency limiter.
// ABOUTME: Validates acquire/release, queuing, and concurrency guarantees.
import { describe, it, expect } from 'vitest'
import { Semaphore } from './semaphore'

describe('Semaphore', () => {
  it('blocks acquisition beyond capacity', async () => {
    const sem = new Semaphore(1)
    const r1 = await sem.acquire()
    let secondAcquired = false
    const p2 = sem.acquire().then(release => {
      secondAcquired = true
      return release
    })
    // Give the microtask queue a tick
    await new Promise(r => setTimeout(r, 10))
    expect(secondAcquired).toBe(false)
    r1() // release first slot
    const r2 = await p2
    expect(secondAcquired).toBe(true)
    r2()
  })

  it('processes queued tasks in order', async () => {
    const sem = new Semaphore(1)
    const order: number[] = []
    const r1 = await sem.acquire()

    const p2 = sem.acquire().then(release => { order.push(2); release() })
    const p3 = sem.acquire().then(release => { order.push(3); release() })

    r1()
    await Promise.all([p2, p3])
    expect(order).toEqual([2, 3])
  })

  it('run() limits concurrency', async () => {
    const sem = new Semaphore(2)
    let active = 0
    let maxActive = 0

    const task = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 20))
      active--
    }

    await Promise.all(Array.from({ length: 6 }, () => sem.run(task)))
    expect(maxActive).toBe(2)
  })

  it('rejects concurrency < 1', () => {
    expect(() => new Semaphore(0)).toThrow('Semaphore concurrency must be >= 1')
    expect(() => new Semaphore(-1)).toThrow('Semaphore concurrency must be >= 1')
  })
})
