// ABOUTME: Tests for source credibility framework additions to overall summary prompts.
// ABOUTME: Validates both English and Chinese prompts contain credibility tiers and updated format instructions.
import { describe, it, expect } from 'vitest'
import { DEFAULT_OVERALL_PROMPT, DEFAULT_OVERALL_PROMPT_EN } from '../prompts'

describe('Source Credibility Framework — English prompt', () => {
  it('contains the Source Credibility Framework section', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('Source Credibility Framework')
  })

  it('contains FACTUAL tier definition', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('FACTUAL sources')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('verified news and research')
  })

  it('contains CONTEXTUAL tier definition', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('CONTEXTUAL sources')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('discussions, opinions, social sentiment')
  })

  it('contains attribution examples for contextual sources', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('Social media discussions suggest')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('According to blog commentary')
  })

  it('prohibits presenting contextual material as fact', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('Never present contextual source material as established fact')
  })

  it('describes unified narrative format with paragraph breaks and bullet points', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('unified narrative')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('paragraph breaks')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('bullet points')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('4-8 paragraphs')
  })

  it('preserves existing accuracy requirements', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('never fabricate')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('All facts, figures, names')
  })

  it('preserves existing sentiment analysis section', () => {
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('overall_mood')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('controversies')
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('risk_flags')
  })
})

describe('Source Credibility Framework — Chinese prompt', () => {
  it('contains the credibility framework section in Chinese', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('信源可信度框架')
  })

  it('contains FACTUAL tier definition in Chinese', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('FACTUAL')
    expect(DEFAULT_OVERALL_PROMPT).toContain('事实性')
  })

  it('contains CONTEXTUAL tier definition in Chinese', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('CONTEXTUAL')
    expect(DEFAULT_OVERALL_PROMPT).toContain('参考性')
  })

  it('contains attribution examples in Chinese', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('社交媒体讨论显示')
    expect(DEFAULT_OVERALL_PROMPT).toContain('博客评论认为')
  })

  it('prohibits presenting contextual material as fact in Chinese', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('严禁将参考性来源的内容以确定性事实方式呈现')
  })

  it('describes unified narrative format with paragraph breaks and bullet points', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('统一叙述')
    expect(DEFAULT_OVERALL_PROMPT).toContain('换行符')
    expect(DEFAULT_OVERALL_PROMPT).toContain('列表')
    expect(DEFAULT_OVERALL_PROMPT).toContain('4-8段')
  })

  it('preserves existing accuracy requirements', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('严禁编造')
    expect(DEFAULT_OVERALL_PROMPT).toContain('所有事实、数字、名称、金额必须来自原文')
  })

  it('preserves existing sentiment analysis section', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('overall_mood')
    expect(DEFAULT_OVERALL_PROMPT).toContain('controversies')
    expect(DEFAULT_OVERALL_PROMPT).toContain('risk_flags')
  })
})
