// ABOUTME: Sources page — group-driven sensor configuration with drag-and-drop layout.
// ABOUTME: Groups loaded from API drive the layout; sensors can be dragged between groups.
'use client'
import { useState, useEffect, useCallback } from 'react'
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
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
import { Toggle } from '@/components/sources/Toggle'
import { PillInput } from '@/components/sources/PillInput'
import { Badge, CnBadge, type SensorStatus } from '@/components/sources/SensorBadge'
import { GroupCard } from '@/components/sources/GroupCard'
import { GroupForm } from '@/components/sources/GroupForm'
import { GroupPicker } from '@/components/sources/GroupPicker'
import { UngroupedSection } from '@/components/sources/UngroupedSection'
import { SensorDragItem } from '@/components/sources/SensorDragItem'
import { ADD_GROUP_BTN } from '@/components/sources/group-styles'
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

/** Social sensor keys that get special inline controls. */
const SOCIAL_SENSOR_KEYS = new Set(['x', 'bluesky', 'mastodon'])

/** RSS sensor keys that get special inline controls. */
const RSS_SENSOR_KEYS = new Set(['rss_feeds'])

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
  const [blueskyTopicsEnabled, setBlueskyTopicsEnabled] = useState(true)
  const [mastodonTopicsEnabled, setMastodonTopicsEnabled] = useState(true)
  const [mastodonTrendsEnabled, setMastodonTrendsEnabled] = useState(true)
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
      bluesky_topics_enabled: blueskyTopicsEnabled,
      mastodon_topics_enabled: mastodonTopicsEnabled,
      mastodon_trends_enabled: mastodonTrendsEnabled,
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
      setBlueskyTopicsEnabled(cfg.bluesky_topics_enabled ?? true)
      setMastodonTopicsEnabled(cfg.mastodon_topics_enabled ?? true)
      setMastodonTrendsEnabled(cfg.mastodon_trends_enabled ?? true)
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = async (event: DragEndEvent) => {
    setOverGroupId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Parse "groupId:sensorKey" format
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

  /** Check if a group or its children contain any social sensors. */
  const groupHasSocial = (group: SourceGroupTree): boolean =>
    group.sensors.some(k => SOCIAL_SENSOR_KEYS.has(k)) ||
    group.children.some(groupHasSocial)

  /** Check if a group or its children contain RSS sensors. */
  const groupHasRss = (group: SourceGroupTree): boolean =>
    group.sensors.some(k => RSS_SENSOR_KEYS.has(k)) ||
    group.children.some(groupHasRss)

  /** Check if topics section should be active. */
  const topicsOn = (blueskyTopicsEnabled && (enabled.bluesky ?? true)) ||
    (mastodonTopicsEnabled && (enabled.mastodon ?? true))

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
        isLast={isLast}
      />
    )
  }

  /** Renders social controls for a specific social sensor. */
  const renderSocialControlsForSensor = (sensorKey: string) => {
    const isOn = enabled[sensorKey] ?? true
    if (!isOn) return null

    if (sensorKey === 'x') {
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
        </div>
      )
    }

    if (sensorKey === 'bluesky') {
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
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginTop: '0.375rem',
            cursor: hasBlueskyCredentials ? 'pointer' : 'not-allowed',
            opacity: hasBlueskyCredentials ? 1 : 0.4,
          }}>
            <input
              type="checkbox"
              checked={followingBluesky}
              disabled={!hasBlueskyCredentials}
              onChange={(e) => { setFollowingBluesky(e.target.checked); trigger() }}
              style={{ accentColor: 'var(--brand-bluesky)', cursor: 'inherit' }}
            />
            <span style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
              {t('sources.include_following')}
            </span>
          </label>
        </div>
      )
    }

    if (sensorKey === 'mastodon') {
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
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginTop: '0.375rem',
            cursor: hasMastodonCredentials ? 'pointer' : 'not-allowed',
            opacity: hasMastodonCredentials ? 1 : 0.4,
          }}>
            <input
              type="checkbox"
              checked={followingMastodon}
              disabled={!hasMastodonCredentials}
              onChange={(e) => { setFollowingMastodon(e.target.checked); trigger() }}
              style={{ accentColor: 'var(--brand-mastodon)', cursor: 'inherit' }}
            />
            <span style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
              {t('sources.include_following')}
            </span>
          </label>
        </div>
      )
    }

    return null
  }

  /** Renders all social controls (accounts + topics) for sensors in a group. */
  const renderGroupSocialControls = (group: SourceGroupTree) => {
    const socialSensorsInGroup = group.sensors.filter(k => SOCIAL_SENSOR_KEYS.has(k))
    if (socialSensorsInGroup.length === 0) return null

    return (
      <>
        {socialSensorsInGroup.map(key => {
          const ctrl = renderSocialControlsForSensor(key)
          return ctrl ? <div key={`social-${key}`}>{ctrl}</div> : null
        })}

        {/* Topics section — only if this group has social sensors */}
        {renderTopicsSection()}
      </>
    )
  }

  /** Renders the topics section (keyword search across social platforms). */
  const renderTopicsSection = () => {
    return (
      <div style={{
        borderTop: '1px solid var(--border-soft)',
      }}>
        {/* Topics toggle + platform checkboxes */}
        <div
          className="sensor-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem 0.875rem',
            borderBottom: topicsOn ? '1px solid var(--border-soft)' : 'none',
            transition: 'background 120ms',
            gap: '0.5rem',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
        >
          <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
            <Toggle on={topicsOn} onClick={() => {
              if (topicsOn) {
                setBlueskyTopicsEnabled(false)
                setMastodonTopicsEnabled(false)
              } else {
                if (enabled.bluesky ?? true) setBlueskyTopicsEnabled(true)
                if (enabled.mastodon ?? true) setMastodonTopicsEnabled(true)
              }
              trigger()
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: topicsOn ? 'var(--ink)' : 'var(--ink-faint)',
              }}>
                {t('sources.topics')}
              </div>
            </div>
          </div>
          <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
            {topicsOn && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.1875rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={blueskyTopicsEnabled}
                    onChange={(e) => { setBlueskyTopicsEnabled(e.target.checked); trigger() }}
                    style={{ accentColor: 'var(--brand-bluesky)' }} />
                  <span style={{ fontSize: '0.625rem', color: 'var(--ink-muted)' }}>Bluesky</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.1875rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={mastodonTopicsEnabled}
                    onChange={(e) => { setMastodonTopicsEnabled(e.target.checked); trigger() }}
                    style={{ accentColor: 'var(--brand-mastodon)' }} />
                  <span style={{ fontSize: '0.625rem', color: 'var(--ink-muted)' }}>Mastodon</span>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Keywords input with per-topic controls */}
        {topicsOn && (
          <div style={{ padding: '0.5rem 0.875rem', background: 'var(--canvas)' }}>
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
        )}
      </div>
    )
  }

  /** Renders the RSS feed controls for a group containing rss_feeds sensor. */
  const renderGroupRssControls = (group: SourceGroupTree) => {
    const hasRss = group.sensors.includes('rss_feeds')
    if (!hasRss) return null
    const isOn = enabled.rss_feeds ?? true
    if (!isOn) return null

    return (
      <div style={{
        padding: '0.625rem 0.875rem',
        background: 'var(--canvas)',
        borderTop: '1px solid var(--border-soft)',
      }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.375rem' }}>
          {t('sources.rss_feeds')}
        </div>
        <RssFeedList
          feeds={rssFeeds}
          onChange={(feeds) => { setRssFeeds(feeds); trigger() }}
          onAdd={(url) => {
            setRssFeeds(prev => [{ url, type: 'other' }, ...prev])
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

  /** Renders a Mastodon Trends virtual toggle row (not a real sensor). */
  const renderMastodonTrendsRow = () => {
    return (
      <div
        className="sensor-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.875rem',
          borderBottom: '1px solid var(--border-soft)',
          transition: 'background 120ms',
          gap: '0.5rem',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
      >
        <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
          <Toggle on={mastodonTrendsEnabled} onClick={() => { setMastodonTrendsEnabled(!mastodonTrendsEnabled); trigger() }} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: mastodonTrendsEnabled ? 'var(--ink)' : 'var(--ink-faint)',
            }}>
              {t('sources.mastodon_trends')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /** Renders a single group card with its DnD context. */
  const renderGroup = (group: SourceGroupTree) => {
    const sortableIds = group.sensors
      .filter(k => !HIDDEN_SENSORS.has(k))
      .map(k => `${group.id}:${k}`)

    const hasSocial = groupHasSocial(group)
    const hasRss = groupHasRss(group)

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
          renderSocialControls={hasSocial ? () => renderGroupSocialControls(group) : undefined}
        />

        {/* RSS controls below the card sensors if this group has rss_feeds */}
        {hasRss && renderGroupRssControls(group)}

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
    <div>
      {/* Safe: HIDE_SPINNERS_CSS is a hardcoded CSS string constant — no user/external input. */}
      <style dangerouslySetInnerHTML={{ __html: HIDE_SPINNERS_CSS }} />

      <div className="page-header" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.125rem' }}>
            {t('sources.title')}
          </h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          {t('sources.desc')}
        </p>
      </div>

      <div style={{ paddingBottom: '4rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* ── Defaults ─────────────────────────────────────────────── */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-card)',
            padding: '1.25rem 1.5rem',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('sources.default_limit')}
                </label>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
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
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                {t('sources.default_limit_desc')}
              </p>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('sources.default_lookback')}
                </label>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
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
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                {t('sources.default_lookback_desc')}
              </p>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('sources.default_topic_limit')}
                </label>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
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
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                {t('sources.default_topic_limit_desc')}
              </p>
            </div>
          </div>

          {/* ── New Group button ──────────────────────────────────────── */}
          {!creatingGroup && !editingGroup && (
            <button
              type="button"
              onClick={() => setCreatingGroup(true)}
              style={ADD_GROUP_BTN}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
            >
              + {t('sources.new_group')}
            </button>
          )}

          {/* ── Create Group form ─────────────────────────────────────── */}
          {creatingGroup && (
            <GroupForm
              onSubmit={handleCreateGroup}
              onCancel={() => setCreatingGroup(false)}
            />
          )}

          {/* ── Edit Group form ───────────────────────────────────────── */}
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

          {/* ── Group cards ───────────────────────────────────────────── */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragOver={(event) => {
              const overId = event.over?.id ? String(event.over.id) : null
              if (overId?.includes(':')) {
                setOverGroupId(overId.split(':')[0])
              } else {
                setOverGroupId(overId)
              }
            }}
          >
            {groups.map(group => renderGroup(group))}

            {/* ── Ungrouped section ─────────────────────────────────── */}
            <SortableContext items={ungroupedSortableIds} strategy={verticalListSortingStrategy}>
              <UngroupedSection
                sensorKeys={ungroupedSensorKeys}
                renderSensorRow={(key, isLast) => renderDragItem(key, 'ungrouped', isLast)}
              />
            </SortableContext>
          </DndContext>

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

        </div>
      </div>
    </div>
  )
}
