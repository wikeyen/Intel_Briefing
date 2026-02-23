// ABOUTME: Chinese (Simplified) locale — all UI strings for the Intel Briefing frontend.
// ABOUTME: Keys use dot notation; values may contain {param} placeholders.

import type { TranslationDict } from '../types'

const zh: TranslationDict = {
  // ── App chrome ──────────────────────────────────────────────────────────────
  'app.title': '情报简报',

  // ── Navigation ──────────────────────────────────────────────────────────────
  'nav.overview': '概览',
  'nav.dashboard': '仪表盘',
  'nav.status': '状态',
  'nav.feed': '信息流',
  'nav.config': '配置',
  'nav.sources': '数据源',
  'nav.pipeline': '管道',
  'nav.ai_summary': 'AI 摘要',
  'nav.credentials': '凭证',
  'nav.errors': '异常',

  // ── Page titles & descriptions ──────────────────────────────────────────────
  'page.dashboard.title': '仪表盘',
  'page.dashboard.desc': '综合摘要、情绪分析与趋势',
  'page.status.title': '状态',
  'page.status.desc': '管道健康、简报与传感器异常',
  'page.connections.title': '凭证',
  'page.connections.desc': '数据源与 AI 的凭证配置',
  'page.pipeline.title': '管道',
  'page.pipeline.desc': '调度、过滤与输出限制',
  'page.sources.title': '数据源',
  'page.sources.desc': '管道中的活跃数据源',
  'page.ai.title': 'AI 摘要',
  'page.ai.desc': 'LLM 提供商、模型与提示词',
  'page.data.title': '信息流',
  'page.data.desc': 'AI 摘要与所有来源的条目',

  // ── Status ticker ───────────────────────────────────────────────────────────
  'ticker.updating': '更新中',
  'ticker.idle': '空闲',
  'ticker.fetched_ago': '获取于 {time}',
  'ticker.summary_ago': '摘要于 {time}',
  'ticker.no_data': '暂无数据',
  'ticker.src': '源',
  'ticker.items': '{count} 条',
  'ticker.risks': '{count} 个风险',
  'ticker.risks_plural': '{count} 个风险',

  // ── Time ago ────────────────────────────────────────────────────────────────
  'time.seconds_ago': '{n}秒前',
  'time.minutes_ago': '{n}分钟前',
  'time.hours_ago': '{n}小时前',
  'time.days_ago': '{n}天前',

  // ── Dashboard widgets ───────────────────────────────────────────────────────
  'dash.exec_summary': '综合摘要',
  'dash.quick_scan': '快速扫描',
  'dash.show_more': '展开更多',
  'dash.show_less': '收起',
  'dash.investment_themes': '投资主题',
  'dash.intelligence': '情报分析',
  'dash.alerts': '{count} 条预警',
  'dash.alerts_plural': '{count} 条预警',
  'dash.risk': '风险',
  'dash.controversies': '争议',
  'dash.shifts': '转向',
  'dash.none_detected': '未检测到',
  'dash.sentiment': '情绪分析',
  'dash.positive': '积极',
  'dash.distribution': '分布',
  'dash.source_health': '数据源健康',
  'dash.ok': '正常',
  'dash.trending': '趋势与动量',
  'dash.view_all': '查看全部',
  'dash.view_full_feed': '查看完整信息流',
  'dash.notable': '{count} 条精选',
  'dash.briefing_updated': '简报已更新',
  'dash.no_data_title': '暂无简报数据',
  'dash.no_data_desc': '从{link}运行管道以获取数据并生成首次简报。',
  'dash.no_data_link': '状态页面',
  'dash.no_domain_data': '该领域暂无数据',
  'dash.rapid': '快速',
  'dash.sustained': '持续',

  // ── Category distribution labels ────────────────────────────────────────────
  'cat.research': '研究',
  'cat.news': '新闻',
  'cat.trend': '趋势',
  'cat.opinion': '观点',

  // ── Domain labels ───────────────────────────────────────────────────────────
  'domain.macro': '宏观与金融',
  'domain.news': '新闻与科技',
  'domain.social': '社交脉搏',
  'domain.china-trend': '中国趋势',
  'domain.research': '研究雷达',
  'domain.opinion': '观点荟萃',
  'domain.china-community': '中文社区',

  // ── Sentiment ───────────────────────────────────────────────────────────────
  'sentiment.bullish': '看涨',
  'sentiment.bearish': '看跌',
  'sentiment.mixed': '分歧',
  'sentiment.neutral': '中性',

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  'sidebar.loading': '加载中\u2026',
  'sidebar.language': '语言',

  // ── Sentiment detail labels ─────────────────────────────────────────────────
  'sent.pos': '正面',
  'sent.neu': '中性',
  'sent.neg': '负面',

  // ── Mobile menu ─────────────────────────────────────────────────────────────
  'menu.open': '打开菜单',
  'menu.close': '关闭菜单',
}

export default zh
