# ABOUTME: Pure Markdown renderer for IntelReport — no I/O, no HTTP, no sleeps.
# ABOUTME: Renders all 8 report sections from the IntelReport model.
from intel_briefing.models import IntelItem, IntelReport

# Ordered section display config: (section_key, display_title, emoji)
_SECTIONS: list[tuple[str, str, str]] = [
    ("tech_trends", "Tech Trends", "🔥"),
    ("research", "Research", "📄"),
    ("insights", "Insights", "💡"),
    ("products", "Products", "🚀"),
    ("capital_flow", "Capital Flow", "💰"),
    ("community", "Community", "🗣️"),
    ("politics", "Politics", "🏛️"),
    ("topics", "Topics", "📌"),
]

_NO_DATA_PLACEHOLDER = "_No data available for this section._"


def _render_item(item: IntelItem) -> str:
    """Render a single IntelItem as a Markdown list entry."""
    lines: list[str] = []

    if item.url:
        lines.append(f"- **[{item.title}]({item.url})**")
    else:
        lines.append(f"- **{item.title}**")

    meta: list[str] = []
    if item.source:
        meta.append(f"via {item.source}")
    if item.published_at:
        meta.append(item.published_at)
    if item.heat:
        meta.append(f"🔥 {item.heat}")
    if item.account:
        meta.append(f"@{item.handle or item.account}")
    if item.topic:
        meta.append(f"#{item.topic}")
    if meta:
        lines.append(f"  *{' · '.join(meta)}*")

    if item.authors:
        lines.append(f"  Authors: {', '.join(item.authors)}")

    if item.abstract:
        # Trim long abstracts to keep the document readable
        trimmed = item.abstract[:400] + "…" if len(item.abstract) > 400 else item.abstract
        lines.append(f"  > {trimmed}")

    return "\n".join(lines)


def _render_section(
    section_key: str,
    title: str,
    emoji: str,
    items: list[IntelItem],
) -> str:
    """Render one report section as a Markdown H2 block."""
    header = f"## {emoji} {title}"
    if not items:
        return f"{header}\n\n{_NO_DATA_PLACEHOLDER}"

    body = "\n\n".join(_render_item(item) for item in items)
    return f"{header}\n\n{body}"


def render(report: IntelReport) -> str:
    """Render an IntelReport as a Markdown document.

    Args:
        report: The IntelReport to render.

    Returns:
        A Markdown string suitable for display or LLM consumption.
        Pure function — performs no I/O, no HTTP calls, no sleeps.
    """
    header = (
        f"# Intel Briefing — {report.date}\n\n"
        f"_Fetched at {report.fetched_at}_\n"
    )
    if report.stale:
        header += "\n> ⚠️ **This report may be stale.** Data was not refreshed on schedule.\n"

    section_blocks: list[str] = []
    for key, title, emoji in _SECTIONS:
        items = report.items.get(key, [])
        section_blocks.append(_render_section(key, title, emoji, items))

    footer_sources = ", ".join(sorted(report.sources_ok)) or "none"
    footer_failed = ", ".join(sorted(report.sources_failed)) or "none"
    footer = (
        f"---\n\n"
        f"**Sources OK:** {footer_sources}  \n"
        f"**Sources Failed:** {footer_failed}"
    )

    return "\n\n".join([header] + section_blocks + [footer])
