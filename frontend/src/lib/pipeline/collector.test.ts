// ABOUTME: Integration tests for the collect() pipeline with mocked sensors.
// ABOUTME: Validates IntelReport structure, sensor failure isolation, and cache write.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings, IntelItem } from '../models'
import { defaultConfig } from '../models'

// Mock SQLite cache adapter
const mockWriteReport = vi.fn()
vi.mock('./cache', () => ({
  writeReport: (...args: unknown[]) => mockWriteReport(...args),
  writePipelineStatus: vi.fn(),
  readPipelineStatus: vi.fn(),
  readReport: vi.fn(),
  isStale: vi.fn(),
}))

// Mock sensors
const mockSensorFns: Record<string, ReturnType<typeof vi.fn>> = {}
vi.mock('../sensors', () => ({
  SENSOR_REGISTRY: new Proxy({}, {
    get: (_target, prop: string) => mockSensorFns[prop],
    ownKeys: () => Object.keys(mockSensorFns),
    getOwnPropertyDescriptor: (_target, prop: string) => {
      if (prop in mockSensorFns) {
        return { configurable: true, enumerable: true, value: mockSensorFns[prop] }
      }
      return undefined
    },
  }),
}))

const { collect } = await import('./collector')

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

function makeItem(id: string, source = 'hn'): IntelItem {
  return { id, source, title: `Item ${id}`, url: `https://example.com/${id}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Clear all sensor mocks
  for (const key of Object.keys(mockSensorFns)) {
    delete mockSensorFns[key]
  }
})

describe('collect', () => {
  it('returns valid report with no sensors', async () => {
    const config = makeConfig({ sensors_enabled: {} })
    const report = await collect(config)
    expect(report).toBeDefined()
    expect(report.date).toBeTruthy()
    expect(report.fetched_at).toBeTruthy()
    expect(report.items.tech_trends).toBeDefined()
    expect(mockWriteReport).toHaveBeenCalled()
  })

  it('failed sensor goes to sources_failed', async () => {
    mockSensorFns['failing_sensor'] = vi.fn().mockRejectedValue(new Error('Connection refused'))
    mockSensorFns['ok_sensor'] = vi.fn().mockResolvedValue([makeItem('1', 'ok_sensor')])

    const config = makeConfig({
      sensors_enabled: { failing_sensor: true, ok_sensor: true },
    })
    const report = await collect(config)
    expect(report.sources_failed).toContain('failing_sensor')
    expect(report.sources_ok).toContain('ok_sensor')
  })

  it('disabled sensor not called', async () => {
    const spyFn = vi.fn().mockResolvedValue([])
    mockSensorFns['my_sensor'] = spyFn

    const config = makeConfig({ sensors_enabled: { my_sensor: false } })
    await collect(config)
    expect(spyFn).not.toHaveBeenCalled()
  })

  it('cache is written after collect', async () => {
    const config = makeConfig({ sensors_enabled: {} })
    await collect(config)
    expect(mockWriteReport).toHaveBeenCalled()
  })

  it('items routed to correct sections', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])
    mockSensorFns['arxiv'] = vi.fn().mockResolvedValue([makeItem('arxiv1', 'arxiv')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true, arxiv: true },
    })
    const report = await collect(config)
    expect(report.items.tech_trends.some((i) => i.id === 'hn1')).toBe(true)
    expect(report.items.research.some((i) => i.id === 'arxiv1')).toBe(true)
  })

  it('dedup within section applied', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([
      makeItem('1', 'hacker_news'),
      { id: '2', source: 'hacker_news', title: 'Item 1', url: 'https://example.com/dup' },
    ])

    const config = makeConfig({ sensors_enabled: { hacker_news: true } })
    const report = await collect(config)
    expect(report.items.tech_trends).toHaveLength(1)
  })
})
