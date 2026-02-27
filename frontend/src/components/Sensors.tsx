// ABOUTME: Sources page — group-driven sensor configuration with drag-and-drop layout.
// ABOUTME: Groups loaded from API drive the layout; sensors can be dragged between groups and groups can be reordered.
'use client'
import { useState, useEffect, useCallback } from 'react'
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { SENSORS } from '@/lib/sensors/taxonomy'
import { HIDDEN_SENSORS, SENSOR_LOOKBACK_SUPPORT } from '@/components/sources/sections'
import { RssFeedList } from '@/components/sources/RssFeedList'
import { normalizeRssFeeds, type RssFeedEntry } from '@/lib/models'
import { SkeletonCard } from '@/components/Skeleton'
import { AutoSaveIndicator } from '@/components/form-styles'
import { PillInput } from '@/components/sources/PillInput'
import { Badge, CnBadge, type SensorStatus } from '@/components/sources/SensorBadge'
import { GroupCard } from '@/components/sources/GroupCard'
import { GroupForm } from '@/components/sources/GroupForm'
import { GroupPicker } from '@/components/sources/GroupPicker'
import { UngroupedSection } from '@/components/sources/UngroupedSection'
import { SensorDragItem } from '@/components/sources/SensorDragItem'
import { SensorDetailPanel } from '@/components/sources/SensorDetailPanel'
import { GROUP_CARD } from '@/components/sources/group-styles'
import type { SourceGroupTree, CreateGroupPayload, UpdateGroupPayload } from '@/lib/groups/types'

/** Sensor key to language lookup for CN badges. */
const SENSOR_LANGUAGE: Record<string, 'cn' | 'row'> = Object.fromEntries(
  SENSORS.map(s => [s.key, s.language])
) as Record<string, 'cn' | 'row'>

/** Sensor key to SensorDef lookup. */
const SENSOR_MAP: Record<string, { key: string; label: string; desc: string }> = Object.fromEntries(
  SENSORS.map(s => [s.key, s])
)

/** Visible sensors — exclude hidden ones. */
const VISIBLE_SENSORS = SENSORS.filter(s => !HIDDEN_SENSORS.has(s.key))

/** Sensors with complex settings that open a detail panel instead of inline controls. */
const COMPLEX_SENSORS = new Set(['x_accounts', 'bluesky_accounts', 'mastodon_accounts', 'bluesky_topics', 'mastodon_topics', 'rss_news', 'rss_blogs'])

function normalizeXHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

function normalizeMastodonHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

/** CSS to hide number input spinners across browsers */
const HIDE_SPINNERS_CSS = `
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
`

// Sensor keys that get inline controls are handled directly in renderSensorInlineControls:
// Accounts: x_accounts, bluesky_accounts, mastodon_accounts
// Topics: bluesky_topics, mastodon_topics
// RSS: rss_news, rss_blogs

/** Lightweight floating preview shown inside DragOverlay while dragging. */
export function DragPreview({ activeDragId, groups, sensorMap }: {
  activeDragId: string
  groups: SourceGroupTree[]
  sensorMap: Record<string, { key: string; label: string; desc: string }>
}) {
  // Group drag preview
  if (activeDragId.startsWith('group:')) {
    const groupId = activeDragId.slice(6)
    const group = groups.find(g => g.id === groupId)
    if (!group) return null
    return (
      <div style={{
        padding: '0.5rem 0.875rem',
        background: 'var(--surface)',
        border: '2px solid var(--accent)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        fontSize: '0.9375rem',
        fontWeight: 600,
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        maxWidth: 320,
        cursor: 'grabbing',
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: group.color,
          flexShrink: 0,
        }} />
        {group.name}
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--ink-muted)',
          marginLeft: 'auto',
        }}>
          {group.sensors.length} sensors
        </span>
      </div>
    )
  }

  // Sensor drag preview
  const parts = activeDragId.split(':', 2)
  const sensorKey = parts[1]
  const sensor = sensorKey ? sensorMap[sensorKey] : null
  if (!sensor) return null
  return (
    <div style={{
      padding: '0.5rem 0.875rem',
      background: 'var(--surface)',
      border: '2px solid var(--accent)',
      borderRadius: 6,
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      fontSize: '0.8125rem',
      fontWeight: 500,
      color: 'var(--ink)',
      maxWidth: 280,
      cursor: 'grabbing',
    }}>
      {sensor.label}
    </div>
  )
}

export function Sensors() {
  const { t } = useTranslation()
  const showToast = useToast()

  const validateX = (v: string): string | null => {
    const clean = v.startsWith('@') ? v : `@${v}`
    if (!/^@[A-Za-z0-9_]{1,50}$/.test(clean)) return t('sources.invalid_x_handle')
    return null
  }
  const validateBsky = (v: string): string | null => {
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/.test(v)) return t('sources.invalid_bluesky_handle')
    return null
  }
  const validateMasto = (v: string): string | null => {
    const clean = v.startsWith('@') ? v : `@${v}`
    if (!/^@[A-Za-z0-9_]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(clean)) return t('sources.invalid_mastodon_handle')
    return null
  }

  /* ── Core state (preserved from original) ────────────────────────────────── */
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<Record<string, SensorStatus>>({})
  const [socialAccountsX, setSocialAccountsX] = useState<string[]>([])
  const [socialAccountsBluesky, setSocialAccountsBluesky] = useState<string[]>([])
  const [socialAccountsMastodon, setSocialAccountsMastodon] = useState<string[]>([])
  const [disabledAccounts, setDisabledAccounts] = useState<Set<string>>(new Set())
  const [socialTopicsKeywords, setSocialTopicsKeywords] = useState<string[]>([])
  const [followingBluesky, setFollowingBluesky] = useState(false)
  const [followingMastodon, setFollowingMastodon] = useState(false)
  const [hasBlueskyCredentials, setHasBlueskyCredentials] = useState(false)
  const [hasMastodonCredentials, setHasMastodonCredentials] = useState(false)
  // NOTE: blueskyTopicsEnabled, mastodonTopicsEnabled, mastodonTrendsEnabled have been
  // migrated to per-sensor enabled state (enabled.bluesky_topics, enabled.mastodon_topics,
  // enabled.mastodon_trends). Kept in auto-save for backward compat during transition.
  const [rssFeeds, setRssFeeds] = useState<RssFeedEntry[]>([])
  const [sensorLimits, setSensorLimits] = useState<Record<string, number>>({})
  const [sensorLookback, setSensorLookback] = useState<Record<string, number>>({})
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [defaultLookback, setDefaultLookback] = useState(48)
  const [topicLimits, setTopicLimits] = useState<Record<string, number>>({})
  const [defaultTopicLimit, setDefaultTopicLimit] = useState(25)
  const [topicLookback, setTopicLookback] = useState<Record<string, number>>({})
  const [xScraperProvider, setXScraperProvider] = useState<'twitter-scraper' | 'apify' | 'mixed'>('twitter-scraper')
  const [loaded, setLoaded] = useState(false)

  /* ── Groups state ────────────────────────────────────────────────────────── */
  const [groups, setGroups] = useState<SourceGroupTree[]>([])
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<SourceGroupTree | null>(null)
  const [creatingSubGroupParentId, setCreatingSubGroupParentId] = useState<string | null>(null)
  const [pickerSensorKey, setPickerSensorKey] = useState<string | null>(null)
  const [overGroupId, setOverGroupId] = useState<string | null>(null)
  const [detailSensorKey, setDetailSensorKey] = useState<string | null>(null)

  /* ── Auto-save ───────────────────────────────────────────────────────────── */
  const { status: saveStatus, trigger } = useAutoSave(
    () => ({
      sensors_enabled: enabled,
      social_accounts_x: socialAccountsX,
      social_accounts_bluesky: socialAccountsBluesky,
      social_accounts_mastodon: socialAccountsMastodon,
      social_accounts_disabled: [...disabledAccounts],
      social_topics_keywords: socialTopicsKeywords,
      social_following_bluesky: followingBluesky,
      social_following_mastodon: followingMastodon,
      rss_feed_urls: rssFeeds,
      sensor_limits: sensorLimits,
      sensor_lookback_hours: sensorLookback,
      x_scraper_provider: xScraperProvider,
      default_limit: defaultLimit,
      default_lookback_hours: defaultLookback,
      topic_limits: topicLimits,
      default_topic_limit: defaultTopicLimit,
      topic_lookback_hours: topicLookback,
    }),
    { onError: (e) => showToast(t('sources.save_failed', { error: e.message })) },
  )

  /* ── Load config + groups ────────────────────────────────────────────────── */
  const refreshGroups = useCallback(() => {
    api.getGroups().then(setGroups).catch(() => {})
  }, [])

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const defaults: Record<string, boolean> = {}
      for (const s of SENSORS) defaults[s.key] = true
      setEnabled({ ...defaults, ...cfg.sensors_enabled })
      setSocialAccountsX(cfg.social_accounts_x)
      setSocialAccountsBluesky(cfg.social_accounts_bluesky)
      setSocialAccountsMastodon(cfg.social_accounts_mastodon)
      setDisabledAccounts(new Set(cfg.social_accounts_disabled ?? []))
      setSocialTopicsKeywords(cfg.social_topics_keywords)
      setFollowingBluesky(cfg.social_following_bluesky ?? false)
      setFollowingMastodon(cfg.social_following_mastodon ?? false)
      setHasBlueskyCredentials(!!cfg.bluesky_handle && !!cfg.bluesky_app_password)
      setHasMastodonCredentials(!!cfg.mastodon_token)
      setRssFeeds(normalizeRssFeeds(cfg.rss_feed_urls ?? []))
      setSensorLimits(cfg.sensor_limits ?? {})
      setSensorLookback(cfg.sensor_lookback_hours ?? {})
      setDefaultLimit(cfg.default_limit)
      setDefaultLookback(cfg.default_lookback_hours ?? 48)
      setTopicLimits(cfg.topic_limits ?? {})
      setDefaultTopicLimit(cfg.default_topic_limit ?? 25)
      setTopicLookback(cfg.topic_lookback_hours ?? {})
      setXScraperProvider(cfg.x_scraper_provider ?? 'twitter-scraper')
      setLoaded(true)
    })
    refreshGroups()
    const fetchStatuses = () => {
      api.getLatest().then((report) => {
        const map: Record<string, SensorStatus> = {}
        for (const key of report.sources_ok) map[key] = 'ok'
        for (const key of report.sources_failed) map[key] = 'failed'
        setStatuses(map)
      }).catch(() => {})
    }
    fetchStatuses()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchStatuses() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshGroups])

  /* ── Sensor control handlers ─────────────────────────────────────────────── */
  const toggle = (key: string) => {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))
    trigger()
  }

  const toggleAccountDisabled = (account: string) => {
    setDisabledAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(account)) next.delete(account)
      else next.add(account)
      return next
    })
    trigger()
  }

  const enableAllAccounts = (accounts: string[]) => {
    setDisabledAccounts((prev) => {
      const next = new Set(prev)
      for (const a of accounts) next.delete(a)
      return next
    })
    trigger()
  }

  const disableAllAccounts = (accounts: string[]) => {
    setDisabledAccounts((prev) => {
      const next = new Set(prev)
      for (const a of accounts) next.add(a)
      return next
    })
    trigger()
  }

  const updateSensorLimit = (key: string, value: number) => {
    setSensorLimits((prev) => ({ ...prev, [key]: value }))
    trigger()
  }

  const updateSensorLookback = (key: string, value: number) => {
    setSensorLookback((prev) => ({ ...prev, [key]: value }))
    trigger()
  }

  const updateTopicLimit = (keyword: string, value: number) => {
    setTopicLimits((prev) => ({ ...prev, [keyword]: value }))
    trigger()
  }

  const updateTopicLookback = (keyword: string, value: number) => {
    setTopicLookback((prev) => ({ ...prev, [keyword]: value }))
    trigger()
  }

  const getBadge = (key: string): SensorStatus | undefined =>
    !enabled[key] ? 'disabled' : statuses[key]

  /* ── Group mutation handlers ─────────────────────────────────────────────── */
  const handleCreateGroup = async (data: CreateGroupPayload) => {
    try {
      await api.createGroup(data)
      setCreatingGroup(false)
      setCreatingSubGroupParentId(null)
      refreshGroups()
    } catch (e) {
      showToast(t('sources.save_failed', { error: (e as Error).message }))
    }
  }

  const handleUpdateGroup = async (data: CreateGroupPayload) => {
    if (!editingGroup) return
    try {
      const update: UpdateGroupPayload = { name: data.name, color: data.color, processing: data.processing }
      await api.updateGroup(editingGroup.id, update)
      setEditingGroup(null)
      refreshGroups()
    } catch (e) {
      showToast(t('sources.save_failed', { error: (e as Error).message }))
    }
  }

  const handleDeleteGroup = async (id: string) => {
    if (!window.confirm(t('sources.delete_group_confirm'))) return
    try {
      await api.deleteGroup(id)
      refreshGroups()
    } catch (e) {
      showToast(t('sources.save_failed', { error: (e as Error).message }))
    }
  }

  const handleAddToGroup = async (groupId: string, sensorKey: string) => {
    try {
      await api.addGroupMember(groupId, sensorKey)
      refreshGroups()
    } catch (e) {
      showToast(t('sources.save_failed', { error: (e as Error).message }))
    }
  }

  const handleRemoveFromGroup = async (groupId: string, sensorKey: string) => {
    try {
      await api.removeGroupMember(groupId, sensorKey)
      refreshGroups()
    } catch (e) {
      showToast(t('sources.save_failed', { error: (e as Error).message }))
    }
  }

  const handlePickerToggle = async (groupId: string) => {
    if (!pickerSensorKey) return
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    if (group.sensors.includes(pickerSensorKey)) {
      await handleRemoveFromGroup(groupId, pickerSensorKey)
    } else {
      await handleAddToGroup(groupId, pickerSensorKey)
    }
  }

  /* ── DnD ─────────────────────────────────────────────────────────────────── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragCancel = () => {
    setActiveDragId(null)
    setOverGroupId(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setOverGroupId(null)
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeData = active.data.current
    const activeId = String(active.id)
    const overId = String(over.id)

    // Group-level reorder: both active and over are groups
    if (activeData?.type === 'group') {
      const activeGroupId = activeData.groupId as string
      const overData = over.data.current
      // Determine the target group ID — could be a group sortable or a sensor within a group
      let targetGroupId: string | null = null
      if (overData?.type === 'group') {
        targetGroupId = overData.groupId as string
      } else if (overData?.type === 'sensor') {
        targetGroupId = overData.groupId as string
      }
      if (!targetGroupId || activeGroupId === targetGroupId) return

      const oldIndex = groups.findIndex(g => g.id === activeGroupId)
      const newIndex = groups.findIndex(g => g.id === targetGroupId)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(groups, oldIndex, newIndex)
      setGroups(reordered)

      try {
        await api.reorderGroups(reordered.map(g => g.id))
      } catch (e) {
        showToast(t('sources.save_failed', { error: (e as Error).message }))
        refreshGroups()
      }
      return
    }

    // Sensor-level drag: parse "groupId:sensorKey" format
    const [sourceGroupId, sourceSensorKey] = activeId.includes(':') ? activeId.split(':', 2) : [null, null]
    const [targetGroupId] = overId.includes(':') ? overId.split(':', 2) : [overId, null]

    if (!sourceSensorKey || !sourceGroupId || !targetGroupId) return
    if (sourceGroupId === targetGroupId) return

    // Move sensor: remove from source, add to target
    try {
      if (sourceGroupId !== 'ungrouped') {
        await api.removeGroupMember(sourceGroupId, sourceSensorKey)
      }
      if (targetGroupId !== 'ungrouped') {
        await api.addGroupMember(targetGroupId, sourceSensorKey)
      }
      refreshGroups()
    } catch (e) {
      showToast(t('sources.save_failed', { error: (e as Error).message }))
    }
  }

  /* ── Derived data ────────────────────────────────────────────────────────── */

  /** Set of all sensor keys assigned to at least one group. */
  const groupedSensorKeys = new Set<string>()
  const collectGroupedKeys = (gs: SourceGroupTree[]) => {
    for (const g of gs) {
      for (const k of g.sensors) groupedSensorKeys.add(k)
      collectGroupedKeys(g.children)
    }
  }
  collectGroupedKeys(groups)

  /** Sensors not in any group. */
  const ungroupedSensorKeys = VISIBLE_SENSORS
    .filter(s => !groupedSensorKeys.has(s.key))
    .map(s => s.key)

  /** Find which group IDs a sensor belongs to. */
  const sensorGroupMembership = (sensorKey: string): Set<string> => {
    const result = new Set<string>()
    const walk = (gs: SourceGroupTree[]) => {
      for (const g of gs) {
        if (g.sensors.includes(sensorKey)) result.add(g.id)
        walk(g.children)
      }
    }
    walk(groups)
    return result
  }

  /* ── Render helpers ──────────────────────────────────────────────────────── */

  /** Renders a SensorDragItem for a given sensor key within a group context. */
  const renderDragItem = (sensorKey: string, groupId: string, isLast: boolean) => {
    const sensor = SENSOR_MAP[sensorKey]
    if (!sensor || HIDDEN_SENSORS.has(sensorKey)) return null
    const hasLookback = sensorKey in SENSOR_LOOKBACK_SUPPORT
    return (
      <SensorDragItem
        key={`${groupId}:${sensorKey}`}
        sensorKey={sensorKey}
        sensorLabel={sensor.label}
        sensorDesc={sensor.desc}
        language={SENSOR_LANGUAGE[sensorKey] ?? 'row'}
        groupId={groupId}
        enabled={enabled[sensorKey] ?? true}
        status={getBadge(sensorKey)}
        limit={sensorLimits[sensorKey] ?? defaultLimit}
        lookbackHours={hasLookback ? (sensorLookback[sensorKey] ?? SENSOR_LOOKBACK_SUPPORT[sensorKey]) : null}
        defaultLimit={defaultLimit}
        onToggle={() => toggle(sensorKey)}
        onUpdateLimit={(v) => updateSensorLimit(sensorKey, v)}
        onUpdateLookback={hasLookback ? (v) => updateSensorLookback(sensorKey, v) : undefined}
        onAddToGroup={() => setPickerSensorKey(sensorKey)}
        onRemoveFromGroup={() => handleRemoveFromGroup(groupId, sensorKey)}
        onOpenDetail={COMPLEX_SENSORS.has(sensorKey) ? () => setDetailSensorKey(sensorKey) : undefined}
        isLast={isLast}
      />
    )
  }

  /** Renders the topics keyword list (shared between bluesky_topics and mastodon_topics). */
  const renderTopicsSection = () => {
    return (
      <div style={{
        padding: '0.5rem 0.875rem',
        background: 'var(--canvas)',
        borderBottom: '1px solid var(--border-soft)',
      }}>
        {socialTopicsKeywords.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.625rem' }}>
            {socialTopicsKeywords.map((keyword) => (
              <div
                key={keyword}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0',
                }}
              >
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--accent)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {keyword}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                  <PillInput
                    label={t('sources.items')}
                    value={topicLimits[keyword] ?? defaultTopicLimit}
                    min={1}
                    max={100}
                    onChange={(v) => updateTopicLimit(keyword, v)}
                  />
                  <PillInput
                    label={t('sources.lookback')}
                    value={topicLookback[keyword] ?? 48}
                    min={1}
                    max={336}
                    suffix="h"
                    onChange={(v) => updateTopicLookback(keyword, v)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSocialTopicsKeywords(socialTopicsKeywords.filter(k => k !== keyword))
                      setTopicLimits((prev) => { const next = { ...prev }; delete next[keyword]; return next })
                      setTopicLookback((prev) => { const next = { ...prev }; delete next[keyword]; return next })
                      trigger()
                    }}
                    style={{
                      color: 'var(--ink-faint)',
                      fontSize: '1rem',
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      padding: '0.125rem',
                      transition: 'color 120ms',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--err)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-faint)' }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <input
          type="text"
          placeholder={t('sources.placeholder_topics')}
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '0.75rem 1rem',
            fontSize: '0.9375rem',
            color: 'var(--ink)',
            outline: 'none',
            transition: 'border-color 120ms, box-shadow 120ms',
            fontFamily: 'inherit',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.boxShadow = 'var(--focus-ring)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.boxShadow = 'none'
            const val = e.currentTarget.value.trim()
            if (val && !socialTopicsKeywords.includes(val)) {
              setSocialTopicsKeywords([...socialTopicsKeywords, val])
              trigger()
            }
            e.currentTarget.value = ''
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const val = (e.currentTarget as HTMLInputElement).value.trim()
              if (val && !socialTopicsKeywords.includes(val)) {
                setSocialTopicsKeywords([...socialTopicsKeywords, val])
                trigger()
              }
              (e.currentTarget as HTMLInputElement).value = ''
            }
            if (e.key === 'Backspace' && !(e.currentTarget as HTMLInputElement).value && socialTopicsKeywords.length) {
              setSocialTopicsKeywords(socialTopicsKeywords.slice(0, -1))
              trigger()
            }
          }}
        />
      </div>
    )
  }

  /** Renders inline controls below a specific sensor row (accounts, topics, or feeds). */
  const renderSensorInlineControls = (sensorKey: string) => {
    const isOn = enabled[sensorKey] ?? true
    if (!isOn) return null

    // X Accounts
    if (sensorKey === 'x_accounts') {
      return (
        <div style={{
          padding: '0.625rem 0.875rem',
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border-soft)',
        }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)' }} />
            {t('sources.accounts')}
          </div>
          <TagInput
            tags={socialAccountsX}
            onChange={(tags) => { setSocialAccountsX(tags.map(normalizeXHandle)); trigger() }}
            placeholder={t('sources.placeholder_twitter')}
            validate={validateX}
            disabledTags={disabledAccounts}
            onToggleDisabled={toggleAccountDisabled}
            onEnableAll={() => enableAllAccounts(socialAccountsX)}
            onDisableAll={() => disableAllAccounts(socialAccountsX)}
          />
          {/* X scraper provider */}
          <div style={{ marginTop: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
              {t('sources.x_scraper_provider')}
            </span>
            <select
              value={xScraperProvider}
              onChange={(e) => { setXScraperProvider(e.target.value as typeof xScraperProvider); trigger() }}
              style={{
                fontSize: '0.6875rem',
                padding: '0.125rem 0.375rem',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--surface)',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              <option value="twitter-scraper">twitter-scraper</option>
              <option value="apify">apify</option>
              <option value="mixed">mixed</option>
            </select>
          </div>
        </div>
      )
    }

    // Bluesky Accounts
    if (sensorKey === 'bluesky_accounts') {
      return (
        <div style={{
          padding: '0.625rem 0.875rem',
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border-soft)',
        }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-bluesky)' }} />
            {t('sources.accounts')}
          </div>
          <TagInput
            tags={socialAccountsBluesky}
            onChange={(tags) => { setSocialAccountsBluesky(tags); trigger() }}
            placeholder={t('sources.placeholder_bluesky')}
            validate={validateBsky}
            disabledTags={disabledAccounts}
            onToggleDisabled={toggleAccountDisabled}
            onEnableAll={() => enableAllAccounts(socialAccountsBluesky)}
            onDisableAll={() => disableAllAccounts(socialAccountsBluesky)}
          />
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem',
            cursor: hasBlueskyCredentials ? 'pointer' : 'not-allowed',
            opacity: hasBlueskyCredentials ? 1 : 0.4,
          }}>
            <input type="checkbox" checked={followingBluesky}
              disabled={!hasBlueskyCredentials}
              onChange={(e) => { setFollowingBluesky(e.target.checked); trigger() }}
              style={{ accentColor: 'var(--brand-bluesky)', cursor: 'inherit' }} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>{t('sources.include_following')}</span>
          </label>
        </div>
      )
    }

    // Mastodon Accounts
    if (sensorKey === 'mastodon_accounts') {
      return (
        <div style={{
          padding: '0.625rem 0.875rem',
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border-soft)',
        }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-mastodon)' }} />
            {t('sources.accounts')}
          </div>
          <TagInput
            tags={socialAccountsMastodon}
            onChange={(tags) => { setSocialAccountsMastodon(tags.map(normalizeMastodonHandle)); trigger() }}
            placeholder={t('sources.placeholder_mastodon')}
            validate={validateMasto}
            disabledTags={disabledAccounts}
            onToggleDisabled={toggleAccountDisabled}
            onEnableAll={() => enableAllAccounts(socialAccountsMastodon)}
            onDisableAll={() => disableAllAccounts(socialAccountsMastodon)}
          />
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem',
            cursor: hasMastodonCredentials ? 'pointer' : 'not-allowed',
            opacity: hasMastodonCredentials ? 1 : 0.4,
          }}>
            <input type="checkbox" checked={followingMastodon}
              disabled={!hasMastodonCredentials}
              onChange={(e) => { setFollowingMastodon(e.target.checked); trigger() }}
              style={{ accentColor: 'var(--brand-mastodon)', cursor: 'inherit' }} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>{t('sources.include_following')}</span>
          </label>
        </div>
      )
    }

    // Bluesky Topics / Mastodon Topics — shared keyword list
    if (sensorKey === 'bluesky_topics' || sensorKey === 'mastodon_topics') {
      return renderTopicsSection()
    }

    // RSS News / RSS Blogs — filtered feed management
    if (sensorKey === 'rss_news' || sensorKey === 'rss_blogs') {
      const feedType = sensorKey === 'rss_news' ? 'news' : 'blog'

      return (
        <div style={{
          padding: '0.625rem 0.875rem',
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border-soft)',
        }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.375rem' }}>
            {t('sources.rss_feeds')}
          </div>
          <RssFeedList
            feeds={rssFeeds}
            filterType={feedType === 'news' ? ['news'] : ['blog', 'other']}
            onChange={(feeds) => { setRssFeeds(feeds); trigger() }}
            onAdd={(url) => {
              setRssFeeds(prev => [{ url, type: feedType as 'news' | 'blog' }, ...prev])
              api.discoverRssFeed(url).then((result) => {
                if (result.type === 'discovered' && result.feedUrl) {
                  setRssFeeds((prev) => prev.map((f) => f.url === url ? { ...f, url: result.feedUrl! } : f))
                  showToast(t('sources.feed_discovered', { title: result.feedTitle ?? result.feedUrl ?? '' }))
                } else if (result.type === 'not_found') {
                  setRssFeeds((prev) => prev.filter((f) => f.url !== url))
                  showToast(t('sources.feed_not_found'))
                } else if (result.type === 'error') {
                  setRssFeeds((prev) => prev.filter((f) => f.url !== url))
                  showToast(t('sources.feed_discovery_failed', { error: result.message ?? '' }))
                }
                trigger()
              }).catch(() => { trigger() })
            }}
          />
        </div>
      )
    }

    return null
  }

  /** Renders a single group card with its DnD context. */
  const renderGroup = (group: SourceGroupTree) => {
    const sortableIds = group.sensors
      .filter(k => !HIDDEN_SENSORS.has(k))
      .map(k => `${group.id}:${k}`)

    return (
      <SortableContext key={group.id} items={sortableIds} strategy={verticalListSortingStrategy}>
        <GroupCard
          group={group}
          enabled={enabled}
          statuses={statuses}
          sensorLimits={sensorLimits}
          sensorLookback={sensorLookback}
          defaultLimit={defaultLimit}
          defaultLookback={defaultLookback}
          isOver={overGroupId === group.id}
          onToggle={toggle}
          onUpdateLimit={updateSensorLimit}
          onUpdateLookback={updateSensorLookback}
          onEditGroup={() => setEditingGroup(group)}
          onDeleteGroup={() => handleDeleteGroup(group.id)}
          onAddSubGroup={!group.parent_id ? () => setCreatingSubGroupParentId(group.id) : undefined}
          renderSensorRow={(sensorKey, isLast) => renderDragItem(sensorKey, group.id, isLast)}
          renderSubGroup={(child) => renderGroup(child)}
          renderSensorControls={undefined}
        />

        {/* Sub-group creation form */}
        {creatingSubGroupParentId === group.id && (
          <div style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
            <GroupForm
              parentId={group.id}
              onSubmit={handleCreateGroup}
              onCancel={() => setCreatingSubGroupParentId(null)}
            />
          </div>
        )}
      </SortableContext>
    )
  }

  /* ── Loading skeleton ──────────────────────────────────────────────────── */
  if (!loaded) {
    return (
      <div>
        <div className="page-header" style={{ paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.125rem' }}>
            {t('sources.title')}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {t('sources.desc')}
          </p>
        </div>
        <div style={{ paddingBottom: '4rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={5} />
            <SkeletonCard lines={3} />
          </div>
        </div>
      </div>
    )
  }

  /* ── Ungrouped DnD IDs ─────────────────────────────────────────────────── */
  const ungroupedSortableIds = ungroupedSensorKeys.map(k => `ungrouped:${k}`)

  /* ── Main render ───────────────────────────────────────────────────────── */
  return (
    <div className="sources-root page-padding" style={{ maxWidth: 1360, margin: '0 auto', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}>
      {/* Safe: HIDE_SPINNERS_CSS is a hardcoded CSS string constant — no user/external input. */}
      <style dangerouslySetInnerHTML={{ __html: HIDE_SPINNERS_CSS }} />

      {/* Header row: uses sources-columns grid so button aligns with main column right edge */}
      <div className="sources-columns" style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div className="page-header" style={{ paddingBottom: 0 }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.125rem' }}>
              {t('sources.title')}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, margin: 0 }}>
              {t('sources.desc')}
            </p>
          </div>
          {!creatingGroup && !editingGroup && (
            <button
              type="button"
              onClick={() => setCreatingGroup(true)}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: 6,
                fontSize: '0.8125rem',
                fontWeight: 600,
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              + {t('sources.new_group')}
            </button>
          )}
        </div>
        <div>{/* sidebar column spacer */}</div>
      </div>
      <AutoSaveIndicator status={saveStatus} />

      <div style={{ paddingBottom: '4rem' }}>
        <div className="sources-columns">

          {/* ── Main column: groups ───────────────────────────────────── */}
          <div className="sources-main">

            {/* ── Create Group form ────────────────────────────────── */}
            {creatingGroup && (
              <GroupForm
                onSubmit={handleCreateGroup}
                onCancel={() => setCreatingGroup(false)}
              />
            )}

            {/* ── Edit Group form ──────────────────────────────────── */}
            {editingGroup && (
              <GroupForm
                initial={{
                  name: editingGroup.name,
                  color: editingGroup.color,
                  processing: editingGroup.processing,
                }}
                parentId={editingGroup.parent_id}
                onSubmit={handleUpdateGroup}
                onCancel={() => setEditingGroup(null)}
              />
            )}

            {/* ── Group cards ──────────────────────────────────────── */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              onDragOver={(event) => {
                const overId = event.over?.id ? String(event.over.id) : null
                if (!overId) { setOverGroupId(null); return }
                // Group sortable IDs use "group:<id>" prefix
                if (overId.startsWith('group:')) {
                  setOverGroupId(overId.slice(6))
                } else if (overId.includes(':')) {
                  // Sensor sortable IDs use "<groupId>:<sensorKey>" format
                  setOverGroupId(overId.split(':')[0])
                } else {
                  setOverGroupId(overId)
                }
              }}
            >
              <SortableContext items={groups.map(g => `group:${g.id}`)} strategy={verticalListSortingStrategy}>
                {groups.map(group => renderGroup(group))}
              </SortableContext>

              {/* ── Ungrouped section ──────────────────────────────── */}
              <SortableContext items={ungroupedSortableIds} strategy={verticalListSortingStrategy}>
                <UngroupedSection
                  sensorKeys={ungroupedSensorKeys}
                  renderSensorRow={(key, isLast) => renderDragItem(key, 'ungrouped', isLast)}
                />
              </SortableContext>

              {/* Drag overlay — floating preview that follows cursor */}
              <DragOverlay dropAnimation={null}>
                {activeDragId ? (
                  <DragPreview
                    activeDragId={activeDragId}
                    groups={groups}
                    sensorMap={SENSOR_MAP}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* ── Sidebar: config defaults ──────────────────────────────── */}
          <div className="sources-sidebar">
            <div style={{ ...GROUP_CARD, padding: '1rem 1.25rem' }}>
              <div style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                color: 'var(--ink-muted)',
                marginBottom: '0.875rem',
              }}>
                {t('sources.defaults_heading', 'Defaults')}
              </div>

              {/* Default items slider */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                    {t('sources.default_limit')}
                  </label>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
                    {defaultLimit}
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={200}
                  value={defaultLimit}
                  onChange={(e) => { setDefaultLimit(Number(e.target.value)); trigger() }}
                />
                <p style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)', lineHeight: 1.4, marginTop: '0.375rem' }}>
                  {t('sources.default_limit_desc')}
                </p>
              </div>

              {/* Default lookback slider */}
              <div style={{ marginTop: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                    {t('sources.default_lookback')}
                  </label>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
                    {defaultLookback}h
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={336}
                  value={defaultLookback}
                  onChange={(e) => { setDefaultLookback(Number(e.target.value)); trigger() }}
                />
                <p style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)', lineHeight: 1.4, marginTop: '0.375rem' }}>
                  {t('sources.default_lookback_desc')}
                </p>
              </div>

              {/* Default topic items slider */}
              <div style={{ marginTop: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                    {t('sources.default_topic_limit')}
                  </label>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
                    {defaultTopicLimit}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={defaultTopicLimit}
                  onChange={(e) => { setDefaultTopicLimit(Number(e.target.value)); trigger() }}
                />
                <p style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)', lineHeight: 1.4, marginTop: '0.375rem' }}>
                  {t('sources.default_topic_limit_desc')}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Group picker popover ──────────────────────────────────── */}
      {pickerSensorKey && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setPickerSensorKey(null)}>
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <GroupPicker
              groups={groups}
              memberOf={sensorGroupMembership(pickerSensorKey)}
              onToggle={handlePickerToggle}
              onClose={() => setPickerSensorKey(null)}
            />
          </div>
        </div>
      )}

      {/* ── Sensor detail panel ──────────────────────────────────── */}
      <AnimatePresence>
        {detailSensorKey && (
          <SensorDetailPanel
            sensorKey={detailSensorKey}
            onClose={() => setDetailSensorKey(null)}
            socialAccountsX={socialAccountsX}
            setSocialAccountsX={setSocialAccountsX}
            xScraperProvider={xScraperProvider}
            setXScraperProvider={setXScraperProvider}
            socialAccountsBluesky={socialAccountsBluesky}
            setSocialAccountsBluesky={setSocialAccountsBluesky}
            followingBluesky={followingBluesky}
            setFollowingBluesky={setFollowingBluesky}
            hasBlueskyCredentials={hasBlueskyCredentials}
            socialAccountsMastodon={socialAccountsMastodon}
            setSocialAccountsMastodon={setSocialAccountsMastodon}
            followingMastodon={followingMastodon}
            setFollowingMastodon={setFollowingMastodon}
            hasMastodonCredentials={hasMastodonCredentials}
            disabledAccounts={disabledAccounts}
            onToggleAccountDisabled={toggleAccountDisabled}
            onEnableAllAccounts={enableAllAccounts}
            onDisableAllAccounts={disableAllAccounts}
            socialTopicsKeywords={socialTopicsKeywords}
            setSocialTopicsKeywords={setSocialTopicsKeywords}
            topicLimits={topicLimits}
            defaultTopicLimit={defaultTopicLimit}
            topicLookback={topicLookback}
            onUpdateTopicLimit={updateTopicLimit}
            onUpdateTopicLookback={updateTopicLookback}
            onRemoveTopicKeyword={(keyword) => {
              setSocialTopicsKeywords(socialTopicsKeywords.filter(k => k !== keyword))
              setTopicLimits((prev) => { const next = { ...prev }; delete next[keyword]; return next })
              setTopicLookback((prev) => { const next = { ...prev }; delete next[keyword]; return next })
              trigger()
            }}
            rssFeeds={rssFeeds}
            setRssFeeds={setRssFeeds}
            onAddRssFeed={(url) => {
              const feedType = detailSensorKey === 'rss_news' ? 'news' : 'blog'
              setRssFeeds(prev => [{ url, type: feedType as 'news' | 'blog' }, ...prev])
              api.discoverRssFeed(url).then((result) => {
                if (result.type === 'discovered' && result.feedUrl) {
                  setRssFeeds((prev) => prev.map((f) => f.url === url ? { ...f, url: result.feedUrl! } : f))
                  showToast(t('sources.feed_discovered', { title: result.feedTitle ?? result.feedUrl ?? '' }))
                } else if (result.type === 'not_found') {
                  setRssFeeds((prev) => prev.filter((f) => f.url !== url))
                  showToast(t('sources.feed_not_found'))
                } else if (result.type === 'error') {
                  setRssFeeds((prev) => prev.filter((f) => f.url !== url))
                  showToast(t('sources.feed_discovery_failed', { error: result.message ?? '' }))
                }
                trigger()
              }).catch(() => { trigger() })
            }}
            validateX={validateX}
            validateBsky={validateBsky}
            validateMasto={validateMasto}
            trigger={trigger}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
