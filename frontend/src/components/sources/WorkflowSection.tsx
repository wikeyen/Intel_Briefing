// ABOUTME: Collapsible workflow configuration section for group cards — analysis toggles, keywords, prompts.
// ABOUTME: Exposes per-group pipeline settings inline with auto-save on change.
'use client'
import { useState } from 'react'
import type { SourceGroupTree, UpdateGroupPayload } from '@/lib/groups/types'
import { TagInput } from '@/components/TagInput'
import { useTranslation } from '@/lib/i18n'

interface WorkflowSectionProps {
  group: SourceGroupTree
  /** Sensor keys in this group that produce topic data (bluesky_topics, mastodon_topics) */
  hasTopicSensors: boolean
  /** Sensor keys in this group that produce account data (x_accounts, bluesky_accounts, mastodon_accounts) */
  hasAccountSensors: boolean
  onUpdate: (data: UpdateGroupPayload) => void
}

/** The four analysis toggle definitions. */
const ANALYSIS_TOGGLES = [
  { key: 'trend_enabled' as const, i18nKey: 'sources.workflow_trend' },
  { key: 'topic_enabled' as const, i18nKey: 'sources.workflow_topic', requiresTopicSensors: true },
  { key: 'social_enabled' as const, i18nKey: 'sources.workflow_social', requiresAccountSensors: true },
  { key: 'sentiment_enabled' as const, i18nKey: 'sources.workflow_sentiment' },
] as const

/** Prompt fields keyed by toggle — summary always shows, others only when their toggle is enabled. */
const PROMPT_FIELDS = [
  { key: 'summary_prompt' as const, i18nKey: 'sources.workflow_summary_prompt', alwaysShow: true },
  { key: 'trend_prompt' as const, i18nKey: 'sources.workflow_trend_prompt', toggleKey: 'trend_enabled' as const },
  { key: 'topic_prompt' as const, i18nKey: 'sources.workflow_topic_prompt', toggleKey: 'topic_enabled' as const },
  { key: 'social_prompt' as const, i18nKey: 'sources.workflow_social_prompt', toggleKey: 'social_enabled' as const },
] as const

/** Section heading style — matches GroupForm's label style. */
const SECTION_LABEL: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
  marginBottom: '0.375rem',
}

/** Subtle divider between sub-sections. */
const DIVIDER: React.CSSProperties = {
  borderBottom: '1px solid var(--border-subtle)',
  margin: '0.75rem 0',
}

export function WorkflowSection({ group, hasTopicSensors, hasAccountSensors, onUpdate }: WorkflowSectionProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null)
  const [promptDraft, setPromptDraft] = useState('')

  /** Check if a toggle is greyed out due to missing sensor types. */
  const isGreyedOut = (toggle: typeof ANALYSIS_TOGGLES[number]): boolean => {
    if ('requiresTopicSensors' in toggle && toggle.requiresTopicSensors && !hasTopicSensors) return true
    if ('requiresAccountSensors' in toggle && toggle.requiresAccountSensors && !hasAccountSensors) return true
    return false
  }

  /** Get the tooltip for a greyed-out toggle. */
  const greyedOutTooltip = (toggle: typeof ANALYSIS_TOGGLES[number]): string | undefined => {
    if ('requiresTopicSensors' in toggle && toggle.requiresTopicSensors && !hasTopicSensors) return t('sources.workflow_no_topic_sensors')
    if ('requiresAccountSensors' in toggle && toggle.requiresAccountSensors && !hasAccountSensors) return t('sources.workflow_no_account_sensors')
    return undefined
  }

  /** Handle clicking an analysis toggle pill. */
  const handleToggle = (key: typeof ANALYSIS_TOGGLES[number]['key']) => {
    onUpdate({ [key]: !group[key] })
  }

  /** Start editing a prompt. */
  const handleStartEdit = (promptKey: string, currentValue: string | null) => {
    setEditingPrompt(promptKey)
    setPromptDraft(currentValue ?? '')
  }

  /** Save the prompt edit. */
  const handleSavePrompt = (promptKey: string) => {
    const value = promptDraft.trim() || null
    onUpdate({ [promptKey]: value } as UpdateGroupPayload)
    setEditingPrompt(null)
    setPromptDraft('')
  }

  /** Reset a prompt to default (null). */
  const handleResetPrompt = (promptKey: string) => {
    onUpdate({ [promptKey]: null } as UpdateGroupPayload)
    if (editingPrompt === promptKey) {
      setEditingPrompt(null)
      setPromptDraft('')
    }
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--surface)',
    }}>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          width: '100%',
          padding: '0.5rem 1rem 0.5rem 1.25rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink-muted)',
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-flex',
          fontSize: '0.5rem',
          transition: 'transform 200ms ease',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>
          ▼
        </span>
        {t('sources.workflow')}
      </button>

      {expanded && (
        <div style={{ padding: '0 1rem 0.75rem 1.25rem' }}>
          {/* ── Analysis toggles ──────────────────────────────────── */}
          <div style={SECTION_LABEL}>{t('sources.workflow_analysis')}</div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {ANALYSIS_TOGGLES.map(toggle => {
              const isEnabled = group[toggle.key]
              const greyed = isGreyedOut(toggle)
              const tooltip = greyedOutTooltip(toggle)

              return (
                <button
                  key={toggle.key}
                  type="button"
                  disabled={greyed}
                  title={tooltip}
                  onClick={() => !greyed && handleToggle(toggle.key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.25rem 0.625rem',
                    borderRadius: 999,
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    cursor: greyed ? 'not-allowed' : 'pointer',
                    opacity: greyed ? 0.4 : 1,
                    transition: 'background 120ms, color 120ms, opacity 120ms',
                    ...(isEnabled && !greyed
                      ? {
                          background: 'var(--accent)',
                          color: 'white',
                          border: '1px solid var(--accent)',
                        }
                      : {
                          background: 'none',
                          color: 'var(--ink-muted)',
                          border: '1px solid var(--border)',
                        }),
                  }}
                >
                  {t(toggle.i18nKey)}
                </button>
              )
            })}
          </div>

          <div style={DIVIDER} />

          {/* ── Keywords ──────────────────────────────────────────── */}
          <div style={SECTION_LABEL}>{t('sources.workflow_keywords')}</div>

          {/* Suppress keywords */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              fontSize: '0.625rem',
              fontWeight: 500,
              color: 'var(--ink-faint)',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {t('sources.workflow_suppress')}
            </div>
            <TagInput
              tags={group.suppress_keywords}
              onChange={(tags) => onUpdate({ suppress_keywords: tags })}
              placeholder="keyword — press Enter"
            />
          </div>

          {/* Boost keywords */}
          <div>
            <div style={{
              fontSize: '0.625rem',
              fontWeight: 500,
              color: 'var(--ink-faint)',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {t('sources.workflow_boost')}
            </div>
            <TagInput
              tags={group.boost_keywords}
              onChange={(tags) => onUpdate({ boost_keywords: tags })}
              placeholder="keyword — press Enter"
            />
          </div>

          <div style={DIVIDER} />

          {/* ── Prompts ───────────────────────────────────────────── */}
          <div style={SECTION_LABEL}>{t('sources.workflow_prompts')}</div>

          {PROMPT_FIELDS.map(field => {
            // Only show prompt row if alwaysShow or its toggle is enabled
            if (!('alwaysShow' in field && field.alwaysShow)) {
              const toggleKey = 'toggleKey' in field ? field.toggleKey : undefined
              if (toggleKey && !group[toggleKey]) return null
            }

            const currentValue = group[field.key]
            const hasCustom = currentValue !== null && currentValue !== ''
            const isEditing = editingPrompt === field.key

            return (
              <div key={field.key} style={{ marginBottom: '0.5rem' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  minHeight: '1.5rem',
                }}>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: 'var(--ink)',
                  }}>
                    {t(field.i18nKey)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{
                      fontSize: '0.625rem',
                      color: hasCustom ? 'var(--accent)' : 'var(--ink-faint)',
                      fontWeight: 500,
                    }}>
                      {hasCustom ? t('sources.workflow_custom_prompt') : t('sources.workflow_using_default')}
                    </span>
                    {!hasCustom && !isEditing && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(field.key, currentValue)}
                        style={{
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          color: 'var(--accent)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0.125rem 0.25rem',
                          borderRadius: 4,
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                        }}
                      >
                        {t('sources.workflow_customize')}
                      </button>
                    )}
                    {hasCustom && !isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(field.key, currentValue)}
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            color: 'var(--accent)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.125rem 0.25rem',
                            borderRadius: 4,
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPrompt(field.key)}
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            color: 'var(--ink-muted)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.125rem 0.25rem',
                            borderRadius: 4,
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                          }}
                        >
                          {t('sources.workflow_reset')}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Textarea when editing */}
                {isEditing && (
                  <div style={{ marginTop: '0.375rem' }}>
                    <textarea
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '6rem',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.8125rem',
                        color: 'var(--ink)',
                        background: 'var(--canvas)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        outline: 'none',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        transition: 'border-color 120ms',
                      }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = 'var(--accent)'
                        e.currentTarget.style.boxShadow = 'var(--focus-ring)'
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', marginTop: '0.375rem' }}>
                      <button
                        type="button"
                        onClick={() => { setEditingPrompt(null); setPromptDraft('') }}
                        style={{
                          padding: '0.25rem 0.625rem',
                          fontSize: '0.6875rem',
                          fontWeight: 500,
                          color: 'var(--ink-muted)',
                          background: 'none',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSavePrompt(field.key)}
                        style={{
                          padding: '0.25rem 0.625rem',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          color: 'white',
                          background: 'var(--accent)',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
