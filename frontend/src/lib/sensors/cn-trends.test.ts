// ABOUTME: Unit tests for the 7 Chinese trend sensors (baidu_tieba, douyin, toutiao, netease, kr_trending, juejin, baidu).
// ABOUTME: Verifies response parsing, HTTP error handling, empty/malformed data, and limit parameter compliance.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defaultConfig } from '../models'
import { fetchBaiduTieba } from './baidu_tieba'
import { fetchDouyin } from './douyin'
import { fetchToutiao } from './toutiao'
import { fetchNetease } from './netease'
import { fetchKrTrending } from './kr_trending'
import { fetchJuejin } from './juejin'
import { fetchBaidu } from './baidu'

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

const config = defaultConfig()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchJson(body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  })
}

function mockFetchError(status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status })
}

/** Build N topic entries for Baidu Tieba mock data. */
function makeTiebaTopics(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    topic_id: `${1000 + i}`,
    topic_name: `贴吧话题 ${i + 1}`,
    topic_desc: `Discussion about topic ${i + 1}`,
    discuss_num: (i + 1) * 500,
    topic_url: `https://tieba.baidu.com/hottopic/browse/topicList?topic_id=${1000 + i}`,
  }))
}

/** Build N word entries for Douyin mock data. */
function makeDouyinWords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    group_id: `${2000 + i}`,
    word: `抖音热搜 ${i + 1}`,
    hot_value: (i + 1) * 1000,
    sentence_id: `sentence-${i}`,
    word_cover: { url_list: [`https://p3.douyinpic.com/img/${i}.jpg`] },
  }))
}

/** Build N data entries for Toutiao mock data. */
function makeToutiaoStories(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ClusterId: `${3000 + i}`,
    Title: `头条新闻 ${i + 1}`,
    HotValue: (i + 1) * 2000,
    ClusterIdStr: `${3000 + i}`,
    Image: { url: `https://p3.toutiaoimg.com/${i}.jpg` },
  }))
}

/** Build N list entries for Netease mock data. */
function makeNeteaseArticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    skipID: `netease-skip-${i}`,
    title: `网易新闻 ${i + 1}`,
    _keyword: `keyword-${i}`,
    imgsrc: `https://nimg.ws.126.net/${i}.jpg`,
    url: `https://www.163.com/dy/article/netease-skip-${i}.html`,
  }))
}

/** Build N hotRankList entries for 36Kr Trending mock data. */
function makeKrArticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    itemId: `${4000 + i}`,
    templateMaterial: {
      widgetTitle: `36氪文章 ${i + 1}`,
      widgetImage: `https://img.36krcdn.com/${i}.jpg`,
      statRead: (i + 1) * 5000,
    },
  }))
}

/** Build N data entries for Juejin mock data. */
function makeJuejinPosts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    content: {
      content_id: `${5000 + i}`,
      title: `掘金文章 ${i + 1}`,
    },
    content_counter: {
      hot_rank: (i + 1) * 50,
    },
  }))
}

/** Build N content entries for Baidu Hot Search mock data. */
function makeBaiduSearches(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    word: `百度热搜 ${i + 1}`,
    index: i + 1,
    newHotName: `trending-${i}`,
    url: `https://www.baidu.com/s?wd=百度热搜+${i + 1}`,
  }))
}

// ===========================================================================
// Baidu Tieba
// ===========================================================================
describe('BaiduTiebaSensor', () => {
  it('parses a successful response into IntelItems', async () => {
    mockFetchJson({
      errmsg: 'success',
      data: { bang_topic: { topic_list: makeTiebaTopics(3) } },
    })
    const items = await fetchBaiduTieba(config, 10)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('baidu_tieba')
      expect(item.id).toMatch(/^tieba-/)
      expect(item.title).toBeTruthy()
      expect(item.url).toBeTruthy()
    }
    expect(items[0].heat).toBe('500')
    expect(items[2].heat).toBe('1500')
  })

  it('throws on HTTP error', async () => {
    mockFetchError(500)
    await expect(fetchBaiduTieba(config, 5)).rejects.toThrow('HTTP 500')
  })

  it('returns empty array when errmsg is not success', async () => {
    mockFetchJson({ errmsg: 'error', data: {} })
    const items = await fetchBaiduTieba(config, 5)
    expect(items).toHaveLength(0)
  })

  it('returns empty array when topic_list is missing', async () => {
    mockFetchJson({ errmsg: 'success', data: {} })
    const items = await fetchBaiduTieba(config, 5)
    expect(items).toHaveLength(0)
  })

  it('respects the limit parameter', async () => {
    mockFetchJson({
      errmsg: 'success',
      data: { bang_topic: { topic_list: makeTiebaTopics(20) } },
    })
    const items = await fetchBaiduTieba(config, 5)
    expect(items).toHaveLength(5)
  })

  it('skips entries with empty topic_name', async () => {
    mockFetchJson({
      errmsg: 'success',
      data: { bang_topic: { topic_list: [
        { topic_id: '1', topic_name: '', discuss_num: 100 },
        { topic_id: '2', topic_name: '有效话题', discuss_num: 200 },
      ] } },
    })
    const items = await fetchBaiduTieba(config, 10)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('有效话题')
  })

  it('sets heat to null when discuss_num is 0', async () => {
    mockFetchJson({
      errmsg: 'success',
      data: { bang_topic: { topic_list: [
        { topic_id: '1', topic_name: '零讨论', discuss_num: 0 },
      ] } },
    })
    const items = await fetchBaiduTieba(config, 10)
    expect(items[0].heat).toBeNull()
  })
})

// ===========================================================================
// Douyin
// ===========================================================================
describe('DouyinSensor', () => {
  it('parses a successful response into IntelItems', async () => {
    mockFetchJson({
      status_code: 0,
      data: { word_list: makeDouyinWords(3) },
    })
    const items = await fetchDouyin(config, 10)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('douyin')
      expect(item.id).toMatch(/^douyin-/)
      expect(item.url).toContain('douyin.com/hot/')
    }
    expect(items[0].heat).toBe('1000')
    expect(items[1].heat).toBe('2000')
  })

  it('throws on HTTP error', async () => {
    mockFetchError(503)
    await expect(fetchDouyin(config, 5)).rejects.toThrow('HTTP 503')
  })

  it('returns empty array when status_code is not 0', async () => {
    mockFetchJson({ status_code: -1, data: {} })
    const items = await fetchDouyin(config, 5)
    expect(items).toHaveLength(0)
  })

  it('returns empty array when word_list is missing', async () => {
    mockFetchJson({ status_code: 0, data: {} })
    const items = await fetchDouyin(config, 5)
    expect(items).toHaveLength(0)
  })

  it('respects the limit parameter', async () => {
    mockFetchJson({
      status_code: 0,
      data: { word_list: makeDouyinWords(20) },
    })
    const items = await fetchDouyin(config, 5)
    expect(items).toHaveLength(5)
  })

  it('skips entries with empty word', async () => {
    mockFetchJson({
      status_code: 0,
      data: { word_list: [
        { group_id: '1', word: '', hot_value: 100, sentence_id: 'a' },
        { group_id: '2', word: '有效词条', hot_value: 200, sentence_id: 'b' },
      ] },
    })
    const items = await fetchDouyin(config, 10)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('有效词条')
  })

  it('sets heat to null when hot_value is 0', async () => {
    mockFetchJson({
      status_code: 0,
      data: { word_list: [
        { group_id: '1', word: '冷门话题', hot_value: 0, sentence_id: 'x' },
      ] },
    })
    const items = await fetchDouyin(config, 10)
    expect(items[0].heat).toBeNull()
  })

  it('encodes sentence_id in the URL', async () => {
    mockFetchJson({
      status_code: 0,
      data: { word_list: [
        { group_id: '1', word: '话题', hot_value: 100, sentence_id: '你好世界' },
      ] },
    })
    const items = await fetchDouyin(config, 10)
    expect(items[0].url).toContain(encodeURIComponent('你好世界'))
  })
})

// ===========================================================================
// Toutiao
// ===========================================================================
describe('ToutiaoSensor', () => {
  it('parses a successful response into IntelItems', async () => {
    mockFetchJson({
      status: 'success',
      data: makeToutiaoStories(3),
    })
    const items = await fetchToutiao(config, 10)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('toutiao')
      expect(item.id).toMatch(/^toutiao-/)
      expect(item.url).toContain('toutiao.com/trending/')
    }
    expect(items[0].heat).toBe('2000')
    expect(items[2].heat).toBe('6000')
  })

  it('throws on HTTP error', async () => {
    mockFetchError(502)
    await expect(fetchToutiao(config, 5)).rejects.toThrow('HTTP 502')
  })

  it('returns empty array when status is not success', async () => {
    mockFetchJson({ status: 'fail', data: [] })
    const items = await fetchToutiao(config, 5)
    expect(items).toHaveLength(0)
  })

  it('returns empty array when data is missing', async () => {
    mockFetchJson({ status: 'success' })
    const items = await fetchToutiao(config, 5)
    expect(items).toHaveLength(0)
  })

  it('respects the limit parameter', async () => {
    mockFetchJson({
      status: 'success',
      data: makeToutiaoStories(20),
    })
    const items = await fetchToutiao(config, 5)
    expect(items).toHaveLength(5)
  })

  it('skips entries with empty Title', async () => {
    mockFetchJson({
      status: 'success',
      data: [
        { ClusterId: '1', Title: '', HotValue: 100, ClusterIdStr: '1' },
        { ClusterId: '2', Title: '有效新闻', HotValue: 200, ClusterIdStr: '2' },
      ],
    })
    const items = await fetchToutiao(config, 10)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('有效新闻')
  })

  it('sets heat to null when HotValue is 0', async () => {
    mockFetchJson({
      status: 'success',
      data: [{ ClusterId: '1', Title: '冷门', HotValue: 0, ClusterIdStr: '1' }],
    })
    const items = await fetchToutiao(config, 10)
    expect(items[0].heat).toBeNull()
  })

  it('uses ClusterIdStr for URL path', async () => {
    mockFetchJson({
      status: 'success',
      data: [{ ClusterId: '999', Title: '新闻', HotValue: 100, ClusterIdStr: 'str-999' }],
    })
    const items = await fetchToutiao(config, 10)
    expect(items[0].url).toBe('https://www.toutiao.com/trending/str-999/')
  })
})

// ===========================================================================
// Netease
// ===========================================================================
describe('NeteaseSensor', () => {
  it('parses a successful response into IntelItems', async () => {
    mockFetchJson({
      msg: 'success',
      data: { list: makeNeteaseArticles(3) },
    })
    const items = await fetchNetease(config, 10)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('netease')
      expect(item.id).toMatch(/^netease-/)
      expect(item.url).toContain('163.com')
    }
  })

  it('throws on HTTP error', async () => {
    mockFetchError(500)
    await expect(fetchNetease(config, 5)).rejects.toThrow('HTTP 500')
  })

  it('returns empty array when msg is not success', async () => {
    mockFetchJson({ msg: 'error', data: {} })
    const items = await fetchNetease(config, 5)
    expect(items).toHaveLength(0)
  })

  it('returns empty array when list is missing', async () => {
    mockFetchJson({ msg: 'success', data: {} })
    const items = await fetchNetease(config, 5)
    expect(items).toHaveLength(0)
  })

  it('respects the limit parameter', async () => {
    mockFetchJson({
      msg: 'success',
      data: { list: makeNeteaseArticles(20) },
    })
    const items = await fetchNetease(config, 5)
    expect(items).toHaveLength(5)
  })

  it('skips entries with empty title', async () => {
    mockFetchJson({
      msg: 'success',
      data: { list: [
        { skipID: '1', title: '', url: 'https://163.com' },
        { skipID: '2', title: '有效新闻', url: 'https://163.com' },
      ] },
    })
    const items = await fetchNetease(config, 10)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('有效新闻')
  })

  it('constructs URL from skipID', async () => {
    mockFetchJson({
      msg: 'success',
      data: { list: [
        { skipID: 'ABC123', title: '文章', url: 'https://163.com/original' },
      ] },
    })
    const items = await fetchNetease(config, 10)
    expect(items[0].url).toBe('https://www.163.com/dy/article/ABC123.html')
  })

  it('falls back to entry url when skipID is empty', async () => {
    mockFetchJson({
      msg: 'success',
      data: { list: [
        { skipID: '', title: '无ID文章', url: 'https://www.163.com/fallback' },
      ] },
    })
    const items = await fetchNetease(config, 10)
    expect(items[0].url).toBe('https://www.163.com/fallback')
  })
})

// ===========================================================================
// 36Kr Trending
// ===========================================================================
describe('KrTrendingSensor', () => {
  it('parses a successful response into IntelItems', async () => {
    mockFetchJson({
      code: 0,
      data: { hotRankList: makeKrArticles(3) },
    })
    const items = await fetchKrTrending(config, 10)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('36kr_trending')
      expect(item.id).toMatch(/^36kr-hot-/)
      expect(item.url).toContain('36kr.com/p/')
    }
    expect(items[0].heat).toBe('5000')
    expect(items[2].heat).toBe('15000')
  })

  it('throws on HTTP error', async () => {
    mockFetchError(500)
    await expect(fetchKrTrending(config, 5)).rejects.toThrow('HTTP 500')
  })

  it('returns empty array when code is not 0', async () => {
    mockFetchJson({ code: -1, data: {} })
    const items = await fetchKrTrending(config, 5)
    expect(items).toHaveLength(0)
  })

  it('returns empty array when hotRankList is missing', async () => {
    mockFetchJson({ code: 0, data: {} })
    const items = await fetchKrTrending(config, 5)
    expect(items).toHaveLength(0)
  })

  it('respects the limit parameter', async () => {
    mockFetchJson({
      code: 0,
      data: { hotRankList: makeKrArticles(20) },
    })
    const items = await fetchKrTrending(config, 5)
    expect(items).toHaveLength(5)
  })

  it('skips entries with empty widgetTitle', async () => {
    mockFetchJson({
      code: 0,
      data: { hotRankList: [
        { itemId: '1', templateMaterial: { widgetTitle: '', statRead: 100 } },
        { itemId: '2', templateMaterial: { widgetTitle: '有效文章', statRead: 200 } },
      ] },
    })
    const items = await fetchKrTrending(config, 10)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('有效文章')
  })

  it('sets heat to null when statRead is 0', async () => {
    mockFetchJson({
      code: 0,
      data: { hotRankList: [
        { itemId: '1', templateMaterial: { widgetTitle: '零阅读', statRead: 0 } },
      ] },
    })
    const items = await fetchKrTrending(config, 10)
    expect(items[0].heat).toBeNull()
  })

  it('sends a POST request with expected body', async () => {
    mockFetchJson({ code: 0, data: { hotRankList: [] } })
    await fetchKrTrending(config, 5)
    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [, opts] = fetchFn.mock.calls[0]
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.partner_id).toBe('wap')
    expect(body.param.siteId).toBe(1)
  })
})

// ===========================================================================
// Juejin
// ===========================================================================
describe('JuejinSensor', () => {
  it('parses a successful response into IntelItems', async () => {
    mockFetchJson({
      err_msg: 'success',
      data: makeJuejinPosts(3),
    })
    const items = await fetchJuejin(config, 10)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('juejin')
      expect(item.id).toMatch(/^juejin-/)
      expect(item.url).toContain('juejin.cn/post/')
    }
    expect(items[0].heat).toBe('50')
    expect(items[2].heat).toBe('150')
  })

  it('throws on HTTP error', async () => {
    mockFetchError(500)
    await expect(fetchJuejin(config, 5)).rejects.toThrow('HTTP 500')
  })

  it('returns empty array when err_msg is not success', async () => {
    mockFetchJson({ err_msg: 'fail', data: [] })
    const items = await fetchJuejin(config, 5)
    expect(items).toHaveLength(0)
  })

  it('returns empty array when data is missing', async () => {
    mockFetchJson({ err_msg: 'success' })
    const items = await fetchJuejin(config, 5)
    expect(items).toHaveLength(0)
  })

  it('respects the limit parameter', async () => {
    mockFetchJson({
      err_msg: 'success',
      data: makeJuejinPosts(20),
    })
    const items = await fetchJuejin(config, 5)
    expect(items).toHaveLength(5)
  })

  it('skips entries with empty title', async () => {
    mockFetchJson({
      err_msg: 'success',
      data: [
        { content: { content_id: '1', title: '' }, content_counter: { hot_rank: 10 } },
        { content: { content_id: '2', title: '有效文章' }, content_counter: { hot_rank: 20 } },
      ],
    })
    const items = await fetchJuejin(config, 10)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('有效文章')
  })

  it('sets heat to null when hot_rank is 0', async () => {
    mockFetchJson({
      err_msg: 'success',
      data: [{ content: { content_id: '1', title: '冷门' }, content_counter: { hot_rank: 0 } }],
    })
    const items = await fetchJuejin(config, 10)
    expect(items[0].heat).toBeNull()
  })

  it('constructs correct juejin.cn URL from content_id', async () => {
    mockFetchJson({
      err_msg: 'success',
      data: [{ content: { content_id: '7890' }, content_counter: { hot_rank: 5 } }],
    })
    // content_id '7890' has no title, so it will be skipped — use a titled entry
    mockFetchJson({
      err_msg: 'success',
      data: [{ content: { content_id: '7890', title: '测试' }, content_counter: { hot_rank: 5 } }],
    })
    const items = await fetchJuejin(config, 10)
    expect(items[0].url).toBe('https://juejin.cn/post/7890')
  })
})

// ===========================================================================
// Baidu Hot Search
// ===========================================================================
describe('BaiduSensor', () => {
  it('parses a successful response into IntelItems', async () => {
    mockFetchJson({
      success: true,
      data: { cards: [{ content: makeBaiduSearches(3) }] },
    })
    const items = await fetchBaidu(config, 10)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('baidu')
      expect(item.id).toMatch(/^baidu-/)
      expect(item.url).toContain('baidu.com/s?wd=')
    }
  })

  it('throws on HTTP error', async () => {
    mockFetchError(500)
    await expect(fetchBaidu(config, 5)).rejects.toThrow('HTTP 500')
  })

  it('throws when success is false', async () => {
    mockFetchJson({ success: false, data: {} })
    await expect(fetchBaidu(config, 5)).rejects.toThrow('success: false')
  })

  it('throws when cards is empty', async () => {
    mockFetchJson({ success: true, data: { cards: [] } })
    await expect(fetchBaidu(config, 5)).rejects.toThrow('no cards')
  })

  it('throws when content is missing from first card', async () => {
    mockFetchJson({ success: true, data: { cards: [{}] } })
    await expect(fetchBaidu(config, 5)).rejects.toThrow('empty content')
  })

  it('respects the limit parameter', async () => {
    mockFetchJson({
      success: true,
      data: { cards: [{ content: makeBaiduSearches(20) }] },
    })
    const items = await fetchBaidu(config, 5)
    expect(items).toHaveLength(5)
  })

  it('skips entries with empty word', async () => {
    mockFetchJson({
      success: true,
      data: { cards: [{ content: [
        { word: '', index: 1 },
        { word: '有效搜索', index: 2 },
      ] }] },
    })
    const items = await fetchBaidu(config, 10)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('有效搜索')
  })

  it('generates deterministic IDs from word hash', async () => {
    mockFetchJson({
      success: true,
      data: { cards: [{ content: [
        { word: '测试词条', index: 1 },
      ] }] },
    })
    const items1 = await fetchBaidu(config, 10)
    mockFetchJson({
      success: true,
      data: { cards: [{ content: [
        { word: '测试词条', index: 1 },
      ] }] },
    })
    const items2 = await fetchBaidu(config, 10)
    expect(items1[0].id).toBe(items2[0].id)
  })

  it('URL-encodes the search word', async () => {
    mockFetchJson({
      success: true,
      data: { cards: [{ content: [
        { word: '中文 搜索', index: 1 },
      ] }] },
    })
    const items = await fetchBaidu(config, 10)
    expect(items[0].url).toBe(`https://www.baidu.com/s?wd=${encodeURIComponent('中文 搜索')}`)
  })

  it('does not set heat field', async () => {
    mockFetchJson({
      success: true,
      data: { cards: [{ content: makeBaiduSearches(2) }] },
    })
    const items = await fetchBaidu(config, 10)
    // Baidu sensor does not populate heat — it should be undefined
    for (const item of items) {
      expect(item.heat).toBeUndefined()
    }
  })
})
