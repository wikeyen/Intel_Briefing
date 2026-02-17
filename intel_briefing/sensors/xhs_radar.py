# ABOUTME: Xiaohongshu (XHS) radar sensor for Intel Briefing.
# ABOUTME: Monitors XHS for tech and product trends. Requires a Chinese IP address.

import datetime
from dataclasses import dataclass
from typing import List, Tuple
import sys

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

@dataclass
class Lead:
    source: str
    title: str
    url: str
    summary: str
    posted_date: str
    tags: List[str]
    desperation_score: int = 0

class XHSRadar:
    """
    Scans XiaoHongShu (Web) for 'Soft-Targets'.
    Since XHS has strong anti-scraping, this sensor primarily operates in:
    1. 'Manual Protocol' mode: Generates search URLs for the user.
    2. 'Browser Protocol' mode: Provides JS snippets for the user/agent to run in console.
    """
    
    SEARCH_QUERIES = [
        # 1. 🎓 学生党 (Students) - Thesis & Homework
        "毕设求助", "python代做", "数据分析 救命",
        
        # 2. 💼 电商/运营 (E-commerce) - High Value
        "竞品分析 工具", "批量 采集 小红书", "自动回复 脚本", "闲鱼 助手",
        
        # 3. 🏢 打工人 (Office) - Excel/PDF Pain
        "Excel 自动化", "批量 转 PDF", "自动填表", "发票 识别",
        
        # 4. 🎬 自媒体 (Creators) - Video/Image
        "视频 批量 剪辑", "去水印 工具", "文案 生成", "矩阵 运营"
    ]
    
    BASE_URL = "https://www.xiaohongshu.com/search_result"
    
    # Desperation keywords for scoring (if we get data)
    DESPERATION_KEYWORDS = [
        "救命", "有偿", "急", "我要疯了", "红包", "太难了", "求教"
    ]

    def fetch_leads(self, days: int = 1) -> List[Lead]:
        """
        Returns 'Manual Action' leads pointing to search results.
        And instructions on how to scrape.
        """
        print(f"📕 Preparing XHS Radar (Past {days} days)...")
        leads = []
        
        # 1. Generate Manual Link Leads
        for query in self.SEARCH_QUERIES:
            # Simple URL encoding
            encoded_query = query.replace(" ", "%20")
            url = f"{self.BASE_URL}?keyword={encoded_query}&source=web_search_result_notes"
            
            # Create a "Guide" Lead
            leads.append(Lead(
                source="小红书-手动模式",
                title=f"🔎 搜索指令: {query}",
                url=url,
                summary=f"点击查找关于 '{query}' 的帖子。重点关注标签: {', '.join(self.DESPERATION_KEYWORDS)}。",
                posted_date=datetime.datetime.now().strftime("%Y-%m-%d"),
                tags=["🔍手动执行", "🔥高信号"],
                desperation_score=50 # Base score to ensure it shows up
            ))
            
        print(f"✅ Generated {len(leads)} search directives for XHS.")
        return leads

    def get_browser_js_snippet(self) -> str:
        """
        Returns the JS code to run in Chrome Console to extract leads.
        Based on selectors: section.note-item, a.title, a.author .name, a.cover
        """
        return """
        // 🛠️ Antigravity XHS Scraper v1.0
        (() => {
            const leads = [];
            document.querySelectorAll('section.note-item').forEach(card => {
                const titleNode = card.querySelector('a.title');
                const authorNode = card.querySelector('a.author .name');
                const linkNode = card.querySelector('a.cover') || card.querySelector('a.title');
                
                if (titleNode && linkNode) {
                    const text = titleNode.innerText;
                    // Simple Desperation Score in JS
                    let score = 0;
                    const keywords = ["救命", "有偿", "急", "红包", "崩溃"];
                    if (keywords.some(k => text.includes(k))) score = 100;
                    
                    leads.push({
                        title: text,
                        url: linkNode.href,
                        author: authorNode ? authorNode.innerText : 'Unknown',
                        score: score
                    });
                }
            });
            console.log(JSON.stringify(leads, null, 2));
            return leads;
        })();
        """

if __name__ == "__main__":
    radar = XHSRadar()
    leads = radar.fetch_leads()
    print("--- Leads ---")
    for l in leads:
        print(f"{l.title} -> {l.url}")
    print("\n--- JS Snippet ---")
    print(radar.get_browser_js_snippet())
