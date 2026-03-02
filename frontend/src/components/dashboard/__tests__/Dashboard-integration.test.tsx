// ABOUTME: Integration tests for Dashboard tab-based sections layout.
// ABOUTME: Verifies that old group-card components are removed and new section components are wired in.
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Static analysis tests — verify the refactor removed old code and added new
// ---------------------------------------------------------------------------

const dashboardSource = fs.readFileSync(
  path.resolve(__dirname, '../../Dashboard.tsx'),
  'utf-8',
)

describe('Dashboard tab-based sections refactor', () => {
  describe('removed old group-card components', () => {
    it('no longer imports WhatsHappeningStrip', () => {
      expect(dashboardSource).not.toMatch(/import\s+WhatsHappeningStrip\s+from/)
    })

    it('no longer imports GroupIntelCard', () => {
      expect(dashboardSource).not.toMatch(/import\s+\{[^}]*GroupIntelCard[^}]*\}\s+from/)
    })

    it('no longer imports GroupDetailPanelAnimated', () => {
      expect(dashboardSource).not.toMatch(/import\s+\{[^}]*GroupDetailPanelAnimated[^}]*\}\s+from/)
    })

    it('no longer renders WhatsHappeningStrip', () => {
      expect(dashboardSource).not.toMatch(/<WhatsHappeningStrip\b/)
    })

    it('no longer renders GroupIntelCard', () => {
      expect(dashboardSource).not.toMatch(/<GroupIntelCard\b/)
    })

    it('no longer renders GroupDetailPanelAnimated', () => {
      expect(dashboardSource).not.toMatch(/<GroupDetailPanelAnimated\b/)
    })
  })

  describe('removed old inline components', () => {
    it('no longer defines StatusTicker', () => {
      expect(dashboardSource).not.toMatch(/function StatusTicker/)
    })

    it('no longer defines ExecSummaryWidget', () => {
      expect(dashboardSource).not.toMatch(/function ExecSummaryWidget/)
    })

    it('no longer defines RiskIntelPanel', () => {
      expect(dashboardSource).not.toMatch(/function RiskIntelPanel/)
    })

    it('no longer defines SentimentWidget', () => {
      expect(dashboardSource).not.toMatch(/function SentimentWidget/)
    })

    it('no longer defines TrendingWidget', () => {
      expect(dashboardSource).not.toMatch(/function TrendingWidget/)
    })

    it('no longer defines SourceHealthWidget', () => {
      expect(dashboardSource).not.toMatch(/function SourceHealthWidget/)
    })

    it('no longer defines IntelligenceDetailPanel', () => {
      expect(dashboardSource).not.toMatch(/function IntelligenceDetailPanel/)
    })

    it('no longer defines TrendDetailPanel', () => {
      expect(dashboardSource).not.toMatch(/function TrendDetailPanel/)
    })

    it('no longer defines GroupDistributionWidget', () => {
      expect(dashboardSource).not.toMatch(/function GroupDistributionWidget/)
    })
  })

  describe('imports new section-based components', () => {
    it('imports SectionTabBar', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*SectionTabBar[^}]*\}\s+from/)
    })

    it('imports SectionFilterBar and related exports', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*SectionFilterBar[^}]*\}\s+from/)
      expect(dashboardSource).toMatch(/import\s+\{[^}]*DEFAULT_FILTERS[^}]*\}\s+from/)
      expect(dashboardSource).toMatch(/import\s+\{[^}]*applyFilters[^}]*\}\s+from/)
    })

    it('imports VisualDataStrip', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*VisualDataStrip[^}]*\}\s+from/)
    })

    it('imports SectionIntelligencePanel', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*SectionIntelligencePanel[^}]*\}\s+from/)
    })

    it('imports ExecutiveSummaryCard', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*ExecutiveSummaryCard[^}]*\}\s+from/)
    })

    it('imports RichItemCard and itemSignalScore', () => {
      expect(dashboardSource).toMatch(/import\s+RichItemCard/)
      expect(dashboardSource).toMatch(/itemSignalScore/)
    })

    it('imports ItemDetailPanelAnimated', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*ItemDetailPanelAnimated[^}]*\}\s+from/)
    })
  })

  describe('uses tab-driven state management', () => {
    it('has activeGroupId state', () => {
      expect(dashboardSource).toMatch(/useState<string \| null>/)
      expect(dashboardSource).toMatch(/activeGroupId/)
      expect(dashboardSource).toMatch(/setActiveGroupId/)
    })

    it('has filtersByGroup state', () => {
      expect(dashboardSource).toMatch(/filtersByGroup/)
      expect(dashboardSource).toMatch(/setFiltersByGroup/)
      expect(dashboardSource).toMatch(/Record<string, FilterState>/)
    })

    it('has selectedItem state', () => {
      expect(dashboardSource).toMatch(/selectedItem/)
      expect(dashboardSource).toMatch(/setSelectedItem/)
      expect(dashboardSource).toMatch(/useState<IntelItem \| null>/)
    })

    it('has sortMode state', () => {
      expect(dashboardSource).toMatch(/sortMode/)
      expect(dashboardSource).toMatch(/setSortMode/)
      expect(dashboardSource).toMatch(/useState<SortMode>/)
    })

    it('no longer uses selectedDomain state', () => {
      expect(dashboardSource).not.toMatch(/selectedDomain/)
    })
  })

  describe('renders new section-based components', () => {
    it('renders SectionTabBar', () => {
      expect(dashboardSource).toMatch(/<SectionTabBar\b/)
    })

    it('renders SectionFilterBar', () => {
      expect(dashboardSource).toMatch(/<SectionFilterBar\b/)
    })

    it('renders VisualDataStrip', () => {
      expect(dashboardSource).toMatch(/<VisualDataStrip\b/)
    })

    it('renders SectionIntelligencePanel', () => {
      expect(dashboardSource).toMatch(/<SectionIntelligencePanel\b/)
    })

    it('renders RichItemCard', () => {
      expect(dashboardSource).toMatch(/<RichItemCard\b/)
    })

    it('renders ItemDetailPanelAnimated', () => {
      expect(dashboardSource).toMatch(/<ItemDetailPanelAnimated\b/)
    })

    it('renders ExecutiveSummaryCard above tabs', () => {
      expect(dashboardSource).toMatch(/<ExecutiveSummaryCard\b/)
      // Verify it appears before SectionTabBar in the source
      const summaryIdx = dashboardSource.indexOf('<ExecutiveSummaryCard')
      const tabBarIdx = dashboardSource.indexOf('<SectionTabBar')
      expect(summaryIdx).toBeGreaterThan(-1)
      expect(summaryIdx).toBeLessThan(tabBarIdx)
    })
  })

  describe('key functions and logic', () => {
    it('uses applyFilters for item filtering', () => {
      expect(dashboardSource).toMatch(/applyFilters\(/)
    })

    it('uses itemSignalScore in sorting logic', () => {
      expect(dashboardSource).toMatch(/itemSignalScore\(/)
    })

    it('defines sortItems function with all four sort modes', () => {
      expect(dashboardSource).toMatch(/function sortItems/)
      expect(dashboardSource).toMatch(/case 'signal'/)
      expect(dashboardSource).toMatch(/case 'newest'/)
      expect(dashboardSource).toMatch(/case 'discussed'/)
      expect(dashboardSource).toMatch(/case 'velocity'/)
    })

    it('builds group-to-items mapping', () => {
      expect(dashboardSource).toMatch(/function buildGroupItemMap/)
    })

    it('still has DashboardSkeleton', () => {
      expect(dashboardSource).toMatch(/function DashboardSkeleton/)
    })
  })

  describe('ABOUTME header updated', () => {
    it('references tab-based sectioned dashboard', () => {
      const firstTwoLines = dashboardSource.split('\n').slice(0, 2).join('\n')
      expect(firstTwoLines).toMatch(/tab/)
      expect(firstTwoLines).toMatch(/section/)
    })
  })
})
