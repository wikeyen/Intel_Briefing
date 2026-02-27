// ABOUTME: Integration tests for Dashboard group-based layout refactor.
// ABOUTME: Verifies that hardcoded DOMAINS are replaced by dynamic source groups and new components are wired in.
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

describe('Dashboard group-based layout refactor', () => {
  describe('removed hardcoded domain definitions', () => {
    it('no longer defines a DOMAINS array', () => {
      expect(dashboardSource).not.toMatch(/const DOMAINS\s*[:=]/)
    })

    it('no longer defines DomainDef type', () => {
      expect(dashboardSource).not.toMatch(/type DomainDef\s*=/)
    })

    it('no longer defines SubGroup type', () => {
      expect(dashboardSource).not.toMatch(/type SubGroup\s*=/)
    })

    it('no longer contains DomainCardCompact component', () => {
      expect(dashboardSource).not.toMatch(/function DomainCardCompact/)
    })

    it('no longer contains DetailSectionContent component', () => {
      expect(dashboardSource).not.toMatch(/function DetailSectionContent/)
    })

    it('no longer contains old DetailPanel component', () => {
      // The old DetailPanel was domain-based; GroupDetailPanel is imported
      expect(dashboardSource).not.toMatch(/function DetailPanel\b/)
    })

    it('no longer has selectedDomain state', () => {
      expect(dashboardSource).not.toMatch(/selectedDomain/)
    })
  })

  describe('imports new group-based components', () => {
    it('imports WhatsHappeningStrip', () => {
      expect(dashboardSource).toMatch(/import\s+WhatsHappeningStrip\s+from/)
    })

    it('imports GroupIntelCard', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*GroupIntelCard[^}]*\}\s+from/)
    })

    it('imports GroupDetailPanelAnimated', () => {
      expect(dashboardSource).toMatch(/import\s+\{[^}]*GroupDetailPanelAnimated[^}]*\}\s+from/)
    })
  })

  describe('uses group-based state and rendering', () => {
    it('has activeGroup state', () => {
      expect(dashboardSource).toMatch(/useState<SourceGroupTree \| null>/)
      expect(dashboardSource).toMatch(/setActiveGroup/)
    })

    it('renders WhatsHappeningStrip component', () => {
      expect(dashboardSource).toMatch(/<WhatsHappeningStrip\b/)
    })

    it('renders GroupIntelCard components', () => {
      expect(dashboardSource).toMatch(/<GroupIntelCard\b/)
    })

    it('renders GroupDetailPanelAnimated', () => {
      expect(dashboardSource).toMatch(/<GroupDetailPanelAnimated\b/)
    })

    it('renamed CategoryDistributionWidget to GroupDistributionWidget', () => {
      expect(dashboardSource).not.toMatch(/function CategoryDistributionWidget/)
      expect(dashboardSource).toMatch(/function GroupDistributionWidget/)
    })

    it('renamed CategoryDistributionContent to GroupDistributionContent', () => {
      expect(dashboardSource).not.toMatch(/function CategoryDistributionContent/)
      expect(dashboardSource).toMatch(/function GroupDistributionContent/)
    })
  })

  describe('preserved essential components', () => {
    it('still has StatusTicker', () => {
      expect(dashboardSource).toMatch(/function StatusTicker/)
    })

    it('still has ExecSummaryWidget', () => {
      expect(dashboardSource).toMatch(/function ExecSummaryWidget/)
    })

    it('still has RiskIntelPanel', () => {
      expect(dashboardSource).toMatch(/function RiskIntelPanel/)
    })

    it('still has SentimentWidget', () => {
      expect(dashboardSource).toMatch(/function SentimentWidget/)
    })

    it('still has TrendingWidget', () => {
      expect(dashboardSource).toMatch(/function TrendingWidget/)
    })

    it('still has SourceHealthWidget', () => {
      expect(dashboardSource).toMatch(/function SourceHealthWidget/)
    })

    it('still has DashboardSkeleton', () => {
      expect(dashboardSource).toMatch(/function DashboardSkeleton/)
    })

    it('still has IntelligenceDetailPanel', () => {
      expect(dashboardSource).toMatch(/function IntelligenceDetailPanel/)
    })

    it('still has TrendDetailPanel', () => {
      expect(dashboardSource).toMatch(/function TrendDetailPanel/)
    })
  })

  describe('ABOUTME header updated', () => {
    it('references source groups (not domains)', () => {
      const firstTwoLines = dashboardSource.split('\n').slice(0, 2).join('\n')
      expect(firstTwoLines).toMatch(/source groups/)
      expect(firstTwoLines).toMatch(/What's Happening strip|WhatsHappening/)
    })
  })
})
