# ABOUTME: Unit tests for deduplication logic in intel_briefing.pipeline.dedup.
# ABOUTME: Covers within-list title dedup and cross-section politics/topics overlap removal.
import pytest
from intel_briefing.models import IntelItem
from intel_briefing.pipeline.dedup import dedup_across_sections, dedup_items


def make_item(id: str, title: str, source: str = "hn") -> IntelItem:
    return IntelItem(id=id, source=source, title=title, url=f"https://example.com/{id}")


class TestDedupItems:
    def test_removes_case_insensitive_duplicate(self):
        items = [
            make_item("1", "Hello World"),
            make_item("2", "hello world"),  # duplicate
            make_item("3", "Different"),
        ]
        result = dedup_items(items)
        assert len(result) == 2
        assert result[0].id == "1"
        assert result[1].id == "3"

    def test_keeps_first_occurrence(self):
        items = [make_item("a", "Same Title"), make_item("b", "Same Title")]
        result = dedup_items(items)
        assert len(result) == 1
        assert result[0].id == "a"

    def test_empty_list_returns_empty(self):
        assert dedup_items([]) == []

    def test_single_item_unchanged(self):
        items = [make_item("1", "Solo")]
        assert dedup_items(items) == items

    def test_empty_titles_are_kept(self):
        items = [
            IntelItem(id="a", source="s", title="", url="u1"),
            IntelItem(id="b", source="s", title="", url="u2"),
        ]
        result = dedup_items(items)
        assert len(result) == 2

    def test_whitespace_only_title_treated_as_empty(self):
        items = [
            IntelItem(id="a", source="s", title="   ", url="u1"),
            IntelItem(id="b", source="s", title="  ", url="u2"),
        ]
        result = dedup_items(items)
        # Both have empty stripped titles — both are kept (cannot dedup)
        assert len(result) == 2

    def test_preserves_order(self):
        titles = ["Alpha", "Beta", "Gamma", "Delta"]
        items = [make_item(str(i), t) for i, t in enumerate(titles)]
        result = dedup_items(items)
        assert [r.title for r in result] == titles


class TestDedupAcrossSections:
    def test_removes_politics_ids_from_topics(self):
        pol_item = make_item("shared-1", "Political post", source="politics")
        top_item = make_item("shared-1", "Same post", source="topics")
        other = make_item("unique-2", "Unrelated", source="topics")

        sections = {
            "politics": [pol_item],
            "topics": [top_item, other],
        }
        result = dedup_across_sections(sections)
        assert len(result["politics"]) == 1
        assert len(result["topics"]) == 1
        assert result["topics"][0].id == "unique-2"

    def test_no_overlap_returns_unchanged(self):
        sections = {
            "politics": [make_item("p1", "Politics post")],
            "topics": [make_item("t1", "Topics post")],
        }
        result = dedup_across_sections(sections)
        assert len(result["politics"]) == 1
        assert len(result["topics"]) == 1

    def test_empty_politics_returns_unchanged(self):
        sections = {
            "politics": [],
            "topics": [make_item("t1", "Topics post")],
        }
        result = dedup_across_sections(sections)
        assert len(result["topics"]) == 1

    def test_missing_sections_handled(self):
        sections: dict = {}
        result = dedup_across_sections(sections)
        assert result == {}

    def test_only_politics_no_topics(self):
        sections = {"politics": [make_item("p1", "Post")]}
        result = dedup_across_sections(sections)
        assert len(result["politics"]) == 1
