// ABOUTME: Unit tests for extracted and new group-based UI components.
// ABOUTME: Covers Toggle, PillInput, Badge, CnBadge, SensorDragItem, GroupCard, GroupForm, GroupPicker, UngroupedSection.
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { Toggle } from '../Toggle'
import { PillInput } from '../PillInput'
import { Badge, CnBadge } from '../SensorBadge'
import { SensorDragItem } from '../SensorDragItem'
import { GroupCard } from '../GroupCard'
import { GroupForm } from '../GroupForm'
import { GroupPicker } from '../GroupPicker'
import { UngroupedSection } from '../UngroupedSection'
import type { SourceGroupTree } from '@/lib/groups/types'

// Mock i18n — components use useTranslation for labels
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'sources.badge_ok': 'OK',
        'sources.badge_failed': 'Failed',
        'sources.badge_off': 'Off',
        'sources.items': 'Items',
        'sources.lookback': 'Lookback',
        'sources.edit_group': 'Edit',
        'sources.delete_group': 'Delete',
        'sources.add_subgroup': 'Add sub-group',
        'sources.ungrouped': 'Ungrouped',
        'sources.ungrouped_desc': 'Drag sensors to a group to include them in analysis',
        'sources.group_name': 'Group name',
        'sources.group_color': 'Color',
        'sources.processing_type': 'Processing type',
        'sources.processing_general': 'General',
        'sources.processing_trend': 'Trend',
        'sources.processing_topic': 'Topic',
        'sources.processing_social': 'Social',
        'sources.processing_research': 'Research',
        'sources.processing_news': 'News',
        'sources.processing_opinion': 'Opinion',
        'sensor.desc.hacker_news': 'Top stories from HN',
        'sensor.desc.github': 'Daily trending repos',
        'sensor.desc.arxiv': 'AI/ML preprints',
        'sensor.desc.weibo': 'Weibo trending',
        'sensor.desc.zhihu': 'Zhihu trending',
      }
      return map[key] ?? key
    },
  }),
}))

describe('Toggle', () => {
  it('renders as switch with correct aria state', () => {
    const onClick = vi.fn()
    render(<Toggle on={true} onClick={onClick} />)
    const btn = screen.getByRole('switch')
    expect(btn).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders off state', () => {
    render(<Toggle on={false} onClick={() => {}} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })
})

describe('PillInput', () => {
  it('renders label and value', () => {
    render(<PillInput label="Items" value={10} min={1} max={200} onChange={() => {}} />)
    expect(screen.getByText('Items')).toBeDefined()
    expect(screen.getByRole('spinbutton')).toHaveValue(10)
  })

  it('commits value on blur', () => {
    const onChange = vi.fn()
    render(<PillInput label="Items" value={10} min={1} max={200} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(25)
  })

  it('clamps value to min/max', () => {
    const onChange = vi.fn()
    render(<PillInput label="Items" value={10} min={1} max={50} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(50)
  })

  it('renders suffix when provided', () => {
    render(<PillInput label="Lookback" value={24} min={1} max={336} suffix="h" onChange={() => {}} />)
    expect(screen.getByText('h')).toBeDefined()
  })
})

describe('Badge', () => {
  it('renders ok badge', () => {
    render(<Badge status="ok" />)
    expect(screen.getByText('OK')).toBeDefined()
  })

  it('renders failed badge', () => {
    render(<Badge status="failed" />)
    expect(screen.getByText('Failed')).toBeDefined()
  })

  it('renders nothing for undefined status', () => {
    const { container } = render(<Badge status={undefined} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('CnBadge', () => {
  it('renders CN pill for cn language', () => {
    render(<CnBadge language="cn" />)
    expect(screen.getByText('CN')).toBeDefined()
  })

  it('renders nothing for row language', () => {
    const { container } = render(<CnBadge language="row" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('GroupForm', () => {
  it('renders create form with empty fields', () => {
    render(<GroupForm onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByPlaceholderText('Group name')).toBeDefined()
    expect(screen.getByText('Create')).toBeDefined()
  })

  it('renders edit form with pre-filled values', () => {
    render(
      <GroupForm
        initial={{ name: 'My Reports', color: '#2E7D9A', processing: 'research' }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByDisplayValue('My Reports')).toBeDefined()
    expect(screen.getByText('Save')).toBeDefined()
  })

  it('validates empty name', () => {
    const onSubmit = vi.fn()
    render(<GroupForm onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.click(screen.getByText('Create'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Group name is required')).toBeDefined()
  })

  it('submits valid form data', () => {
    const onSubmit = vi.fn()
    render(<GroupForm onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Group name'), { target: { value: 'My Group' } })
    fireEvent.click(screen.getByText('Create'))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'My Group',
      color: '#1A7A6D',
      processing: 'general',
      parent_id: null,
    })
  })

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn()
    render(<GroupForm onSubmit={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('GroupPicker', () => {
  const groups: SourceGroupTree[] = [
    { id: 'g1', parent_id: null, name: 'News', color: '#2E7D9A', icon: null, processing: 'news', sort_order: 0, created_at: '', updated_at: '', sensors: [], children: [] },
    { id: 'g2', parent_id: null, name: 'Trending', color: '#C4851C', icon: null, processing: 'trend', sort_order: 1, created_at: '', updated_at: '', sensors: [], children: [] },
  ]

  it('renders all groups', () => {
    render(<GroupPicker groups={groups} memberOf={new Set()} onToggle={() => {}} onClose={() => {}} />)
    expect(screen.getByText('News')).toBeDefined()
    expect(screen.getByText('Trending')).toBeDefined()
  })

  it('calls onToggle when group clicked', () => {
    const onToggle = vi.fn()
    render(<GroupPicker groups={groups} memberOf={new Set()} onToggle={onToggle} onClose={() => {}} />)
    fireEvent.click(screen.getByText('News'))
    expect(onToggle).toHaveBeenCalledWith('g1')
  })

  it('shows empty state when no groups', () => {
    render(<GroupPicker groups={[]} memberOf={new Set()} onToggle={() => {}} onClose={() => {}} />)
    expect(screen.getByText('No groups available')).toBeDefined()
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<GroupPicker groups={groups} memberOf={new Set()} onToggle={() => {}} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('SensorDragItem', () => {
  const defaultProps = {
    sensorKey: 'hacker_news',
    sensorLabel: 'Hacker News',
    sensorDesc: 'Top stories from news.ycombinator.com',
    language: 'row' as const,
    groupId: 'g1',
    enabled: true,
    status: 'ok' as const,
    limit: 10,
    lookbackHours: 24,
    defaultLimit: 10,
    onToggle: vi.fn(),
    onUpdateLimit: vi.fn(),
    onUpdateLookback: vi.fn(),
    onAddToGroup: vi.fn(),
    onRemoveFromGroup: vi.fn(),
    isLast: false,
  }

  function renderWithDnd(props = defaultProps) {
    return render(
      <DndContext>
        <SortableContext items={[`${props.groupId}:${props.sensorKey}`]}>
          <SensorDragItem {...props} />
        </SortableContext>
      </DndContext>
    )
  }

  it('renders sensor label and toggle', () => {
    renderWithDnd()
    expect(screen.getByText('Hacker News')).toBeDefined()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('renders pill inputs when enabled', () => {
    renderWithDnd()
    expect(screen.getByText('Items')).toBeDefined()
    expect(screen.getByText('Lookback')).toBeDefined()
  })

  it('hides pill inputs when disabled', () => {
    renderWithDnd({ ...defaultProps, enabled: false })
    expect(screen.queryByText('Items')).toBeNull()
  })

  it('calls onToggle when toggle clicked', () => {
    const onToggle = vi.fn()
    renderWithDnd({ ...defaultProps, onToggle })
    fireEvent.click(screen.getByRole('switch'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('renders CN badge for Chinese sensors', () => {
    renderWithDnd({ ...defaultProps, language: 'cn' as const })
    expect(screen.getByText('CN')).toBeDefined()
  })

  it('renders drag grip with className for CSS targeting', () => {
    const { container } = renderWithDnd()
    const grip = container.querySelector('.drag-grip')
    expect(grip).not.toBeNull()
  })
})

describe('GroupCard', () => {
  const group: SourceGroupTree = {
    id: 'g1',
    parent_id: null,
    name: 'Trending',
    color: '#C4851C',
    icon: null,
    processing: 'trend',
    sort_order: 0,
    created_at: '',
    updated_at: '',
    sensors: ['weibo', 'zhihu'],
    children: [],
  }

  it('renders group name and accent bar', () => {
    render(
      <GroupCard
        group={group}
        enabled={{ weibo: true, zhihu: true }}
        statuses={{}}
        sensorLimits={{}}
        sensorLookback={{}}
        defaultLimit={10}
        defaultLookback={48}
        onToggle={() => {}}
        onUpdateLimit={() => {}}
        onUpdateLookback={() => {}}
        onEditGroup={() => {}}
        onDeleteGroup={() => {}}
        renderSensorRow={(key) => <div key={key}>{key}</div>}
      />
    )
    expect(screen.getByText('Trending')).toBeDefined()
    expect(screen.getByText('Trend')).toBeDefined()
    expect(screen.getByText('weibo')).toBeDefined()
    expect(screen.getByText('zhihu')).toBeDefined()
  })

  it('shows enabled count', () => {
    render(
      <GroupCard
        group={group}
        enabled={{ weibo: true, zhihu: false }}
        statuses={{}}
        sensorLimits={{}}
        sensorLookback={{}}
        defaultLimit={10}
        defaultLookback={48}
        onToggle={() => {}}
        onUpdateLimit={() => {}}
        onUpdateLookback={() => {}}
        onEditGroup={() => {}}
        onDeleteGroup={() => {}}
        renderSensorRow={(key) => <div key={key}>{key}</div>}
      />
    )
    expect(screen.getByText('1/2')).toBeDefined()
  })

  it('opens kebab menu on click', () => {
    render(
      <GroupCard
        group={group}
        enabled={{}}
        statuses={{}}
        sensorLimits={{}}
        sensorLookback={{}}
        defaultLimit={10}
        defaultLookback={48}
        onToggle={() => {}}
        onUpdateLimit={() => {}}
        onUpdateLookback={() => {}}
        onEditGroup={() => {}}
        onDeleteGroup={() => {}}
        renderSensorRow={(key) => <div key={key}>{key}</div>}
      />
    )
    fireEvent.click(screen.getByLabelText('Group options'))
    expect(screen.getByText('Edit')).toBeDefined()
    expect(screen.getByText('Delete')).toBeDefined()
  })
})

describe('GroupCard glassmorphism', () => {
  const group: SourceGroupTree = {
    id: 'g1',
    parent_id: null,
    name: 'Trending',
    color: '#C4851C',
    icon: null,
    processing: 'trend',
    sort_order: 0,
    created_at: '',
    updated_at: '',
    sensors: ['weibo'],
    children: [],
  }

  it('applies tinted header background from group color', () => {
    const { container } = render(
      <GroupCard
        group={group}
        enabled={{ weibo: true }}
        statuses={{}}
        sensorLimits={{}}
        sensorLookback={{}}
        defaultLimit={10}
        defaultLookback={48}
        onToggle={() => {}}
        onUpdateLimit={() => {}}
        onUpdateLookback={() => {}}
        onEditGroup={() => {}}
        onDeleteGroup={() => {}}
        renderSensorRow={(key) => <div key={key}>{key}</div>}
      />
    )
    // The header div gets background: `${group.color}14` (8% opacity tint)
    const headerDiv = container.querySelector('[style*="background"]')
    expect(headerDiv).not.toBeNull()
  })

  it('renders frosted count pill with backdrop filter', () => {
    const { container } = render(
      <GroupCard
        group={group}
        enabled={{ weibo: true }}
        statuses={{}}
        sensorLimits={{}}
        sensorLookback={{}}
        defaultLimit={10}
        defaultLookback={48}
        onToggle={() => {}}
        onUpdateLimit={() => {}}
        onUpdateLookback={() => {}}
        onEditGroup={() => {}}
        onDeleteGroup={() => {}}
        renderSensorRow={(key) => <div key={key}>{key}</div>}
      />
    )
    // Count pill shows "1/1" and uses glass-pill background
    expect(screen.getByText('1/1')).toBeDefined()
    const pill = screen.getByText('1/1')
    expect(pill.style.backdropFilter).toBe('blur(4px)')
  })
})

describe('UngroupedSection', () => {
  it('renders nothing when no ungrouped sensors', () => {
    const { container } = render(
      <UngroupedSection sensorKeys={[]} renderSensorRow={() => null} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders sensor rows and helper text', () => {
    const renderRow = (key: string) => <div key={key} data-testid={`row-${key}`}>{key}</div>
    render(
      <UngroupedSection sensorKeys={['arxiv', 'github']} renderSensorRow={renderRow} />
    )
    expect(screen.getByText('Ungrouped')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText('arxiv')).toBeDefined()
    expect(screen.getByText('github')).toBeDefined()
    expect(screen.getByText('Drag sensors to a group to include them in analysis')).toBeDefined()
  })
})
