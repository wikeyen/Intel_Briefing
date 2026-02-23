// ABOUTME: English locale — all UI strings for the Intel Briefing frontend.
// ABOUTME: Keys use dot notation; values may contain {param} placeholders.

import type { TranslationDict } from '../types'

const en: TranslationDict = {
  // ── App chrome ──────────────────────────────────────────────────────────────
  'app.title': 'Intel Briefing',

  // ── Navigation ──────────────────────────────────────────────────────────────
  'nav.overview': 'Overview',
  'nav.dashboard': 'Dashboard',
  'nav.status': 'Status',
  'nav.feed': 'Feed',
  'nav.config': 'Config',
  'nav.sources': 'Sources',
  'nav.pipeline': 'Pipeline',
  'nav.ai_summary': 'AI Summary',
  'nav.credentials': 'Credentials',
  'nav.errors': 'errors',

  // ── Page titles & descriptions ──────────────────────────────────────────────
  'page.dashboard.title': 'Dashboard',
  'page.dashboard.desc': 'Executive summary, sentiment, and trending',
  'page.status.title': 'Status',
  'page.status.desc': 'Pipeline health, briefing, and sensor errors',
  'page.connections.title': 'Credentials',
  'page.connections.desc': 'Credentials for data sources and AI',
  'page.pipeline.title': 'Pipeline',
  'page.pipeline.desc': 'Scheduling, filters, and output limits',
  'page.sources.title': 'Sources',
  'page.sources.desc': 'Active data sources for your pipeline',
  'page.ai.title': 'AI Summary',
  'page.ai.desc': 'LLM provider, model, and prompts',
  'page.data.title': 'Feed',
  'page.data.desc': 'AI summary and items from all sources',

  // ── Status ticker ───────────────────────────────────────────────────────────
  'ticker.updating': 'Updating',
  'ticker.idle': 'Idle',
  'ticker.fetched_ago': 'Fetched {time}',
  'ticker.summary_ago': 'Summary {time}',
  'ticker.no_data': 'No data',
  'ticker.src': 'src',
  'ticker.items': '{count} items',
  'ticker.risks': '{count} risk',
  'ticker.risks_plural': '{count} risks',

  // ── Time ago ────────────────────────────────────────────────────────────────
  'time.seconds_ago': '{n}s ago',
  'time.minutes_ago': '{n}m ago',
  'time.hours_ago': '{n}h ago',
  'time.days_ago': '{n}d ago',

  // ── Dashboard widgets ───────────────────────────────────────────────────────
  'dash.exec_summary': 'Executive Summary',
  'dash.quick_scan': 'Quick Scan',
  'dash.show_more': 'Show more',
  'dash.show_less': 'Show less',
  'dash.investment_themes': 'Investment Themes',
  'dash.intelligence': 'Intelligence',
  'dash.alerts': '{count} alert',
  'dash.alerts_plural': '{count} alerts',
  'dash.risk': 'Risk',
  'dash.controversies': 'Controversies',
  'dash.shifts': 'Shifts',
  'dash.none_detected': 'None detected',
  'dash.sentiment': 'Sentiment',
  'dash.positive': 'POSITIVE',
  'dash.distribution': 'Distribution',
  'dash.source_health': 'Source Health',
  'dash.ok': 'ok',
  'dash.trending': 'Trending & Momentum',
  'dash.view_all': 'View all',
  'dash.view_full_feed': 'View full feed',
  'dash.notable': '{count} notable',
  'dash.briefing_updated': 'Briefing updated',
  'dash.no_data_title': 'No briefing data yet',
  'dash.no_data_desc': 'Run the pipeline from the {link} to fetch data and generate your first briefing.',
  'dash.no_data_link': 'Status page',
  'dash.no_domain_data': 'No data available for this domain',
  'dash.rapid': 'RAPID',
  'dash.sustained': 'SUSTAINED',

  // ── Category distribution labels ────────────────────────────────────────────
  'cat.research': 'Research',
  'cat.news': 'News',
  'cat.trend': 'Trend',
  'cat.opinion': 'Opinion',

  // ── Domain labels ───────────────────────────────────────────────────────────
  'domain.macro': 'Macro & Finance',
  'domain.news': 'News & Tech',
  'domain.social': 'Social Pulse',
  'domain.china-trend': 'China Trend',
  'domain.research': 'Research Radar',
  'domain.opinion': 'Opinion Digest',
  'domain.china-community': 'China Community',

  // ── Sentiment ───────────────────────────────────────────────────────────────
  'sentiment.bullish': 'Bullish',
  'sentiment.bearish': 'Bearish',
  'sentiment.mixed': 'Mixed',
  'sentiment.neutral': 'Neutral',

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  'sidebar.loading': 'loading\u2026',
  'sidebar.language': 'Language',

  // ── Sentiment detail labels ─────────────────────────────────────────────────
  'sent.pos': 'pos',
  'sent.neu': 'neu',
  'sent.neg': 'neg',

  // ── Mobile menu ─────────────────────────────────────────────────────────────
  'menu.open': 'Open menu',
  'menu.close': 'Close menu',
}

export default en
