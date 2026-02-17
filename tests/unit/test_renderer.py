# ABOUTME: Unit tests for the Markdown renderer in intel_briefing.renderer.markdown.
# ABOUTME: Covers all 8 sections, empty data, zh language swap, and optional field handling.
from intel_briefing.models import IntelItem, IntelReport
from intel_briefing.renderer.markdown import render


def make_report(**kwargs) -> IntelReport:
    defaults = dict(date="2026-01-01", fetched_at="2026-01-01T07:00:00Z")
    defaults.update(kwargs)
    return IntelReport(**defaults)


def make_item(id: str = "1", **kwargs) -> IntelItem:
    defaults = dict(source="hn", title="Test Item", url="https://example.com")
    defaults.update(kwargs)
    return IntelItem(id=id, **defaults)


class TestRender:
    def test_header_contains_date(self):
        report = make_report(date="2026-02-17")
        md = render(report)
        assert "2026-02-17" in md

    def test_all_8_section_headers_present(self):
        report = make_report()
        md = render(report)
        for header in ["Tech Trends", "Research", "Insights", "Products",
                       "Capital Flow", "Community", "Politics", "Topics"]:
            assert header in md

    def test_empty_section_shows_placeholder(self):
        report = make_report()
        md = render(report)
        assert "_No data available for this section._" in md

    def test_item_title_and_url_rendered(self):
        item = make_item(title="My Article", url="https://example.com/article")
        report = make_report(items={"tech_trends": [item]})
        md = render(report)
        assert "My Article" in md
        assert "https://example.com/article" in md

    def test_zh_lang_uses_title_zh(self):
        item = make_item(title="English Title", title_zh="中文标题")
        report = make_report(items={"tech_trends": [item]})
        md = render(report, lang="zh")
        assert "中文标题" in md
        assert "English Title" not in md

    def test_zh_lang_falls_back_to_english_when_no_zh(self):
        item = make_item(title="English Title")
        report = make_report(items={"tech_trends": [item]})
        md = render(report, lang="zh")
        assert "English Title" in md

    def test_zh_abstract_used_when_lang_zh(self):
        item = make_item(abstract="English abstract", abstract_zh="中文摘要")
        report = make_report(items={"research": [item]})
        md = render(report, lang="zh")
        assert "中文摘要" in md
        assert "English abstract" not in md

    def test_stale_report_shows_warning(self):
        report = make_report(stale=True)
        md = render(report)
        assert "stale" in md.lower()

    def test_footer_contains_sources(self):
        report = make_report(sources_ok=["hn", "arxiv"], sources_failed=["github"])
        md = render(report)
        assert "hn" in md
        assert "arxiv" in md
        assert "github" in md

    def test_item_with_heat_shows_heat(self):
        item = make_item(heat="1234 pts")
        report = make_report(items={"tech_trends": [item]})
        md = render(report)
        assert "1234 pts" in md

    def test_item_with_authors_shows_authors(self):
        item = make_item(authors=["Alice", "Bob"])
        report = make_report(items={"research": [item]})
        md = render(report)
        assert "Alice" in md
        assert "Bob" in md

    def test_long_abstract_is_truncated(self):
        long_abstract = "x" * 500
        item = make_item(abstract=long_abstract)
        report = make_report(items={"research": [item]})
        md = render(report)
        # 400 char limit + "…"
        assert "…" in md
        assert "x" * 401 not in md

    def test_item_with_missing_optional_fields_no_error(self):
        item = make_item()  # only required fields
        report = make_report(items={"community": [item]})
        md = render(report)
        assert "Test Item" in md

    def test_pure_function_no_side_effects(self):
        report = make_report()
        md1 = render(report)
        md2 = render(report)
        assert md1 == md2
