// ABOUTME: Unit tests for extracted and new group-based UI components.
// ABOUTME: Validates Toggle, PillInput, Badge, CnBadge, GroupForm, GroupPicker, UngroupedSection render correctly.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toggle } from '../Toggle'
import { PillInput } from '../PillInput'
import { Badge, CnBadge } from '../SensorBadge'
import { GroupForm } from '../GroupForm'
import { GroupPicker } from '../GroupPicker'
import { UngroupedSection } from '../UngroupedSection'
import type { SourceGroupTree } from '@/lib/groups/types'

// Mock i18n — Badge and PillInput use useTranslation
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'sources.badge_ok': 'OK',
        'sources.badge_failed': 'Failed',
        'sources.badge_off': 'Off',
        'sources.items': 'Items',
        'sources.lookback': 'Lookback',
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
