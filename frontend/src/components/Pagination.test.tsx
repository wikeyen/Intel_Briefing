// ABOUTME: Tests for the shared Pagination component.
// ABOUTME: Covers rendering, navigation, edge cases, and ellipsis behavior.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n/context'
import { Pagination } from './Pagination'

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>)
}

describe('Pagination', () => {
  it('renders nothing when totalPages <= 1', () => {
    const { container } = renderWithI18n(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when totalPages is 0', () => {
    const { container } = renderWithI18n(
      <Pagination page={1} totalPages={0} onPageChange={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('disables prev button on first page', () => {
    renderWithI18n(<Pagination page={1} totalPages={5} onPageChange={() => {}} />)
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
  })

  it('disables next button on last page', () => {
    renderWithI18n(<Pagination page={5} totalPages={5} onPageChange={() => {}} />)
    expect(screen.getByLabelText('Next page')).toBeDisabled()
  })

  it('calls onPageChange with page - 1 when prev clicked', () => {
    const onChange = vi.fn()
    renderWithI18n(<Pagination page={3} totalPages={5} onPageChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange with page + 1 when next clicked', () => {
    const onChange = vi.fn()
    renderWithI18n(<Pagination page={3} totalPages={5} onPageChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('calls onPageChange when a page number is clicked', () => {
    const onChange = vi.fn()
    renderWithI18n(<Pagination page={1} totalPages={5} onPageChange={onChange} />)
    fireEvent.click(screen.getByText('3'))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('shows all pages when totalPages <= 7', () => {
    renderWithI18n(<Pagination page={1} totalPages={5} onPageChange={() => {}} />)
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument()
    }
  })

  it('shows ellipsis for large page ranges', () => {
    renderWithI18n(<Pagination page={5} totalPages={20} onPageChange={() => {}} />)
    const ellipses = screen.getAllByText('…')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
  })

  it('highlights the current page', () => {
    renderWithI18n(<Pagination page={3} totalPages={5} onPageChange={() => {}} />)
    const current = screen.getByText('3')
    expect(current).toHaveAttribute('aria-current', 'page')
  })
})
