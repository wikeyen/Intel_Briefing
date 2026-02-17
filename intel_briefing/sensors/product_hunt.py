# ABOUTME: Product Hunt sensor using the official GraphQL API.
# ABOUTME: Fetches trending products; requires a valid PRODUCTHUNT_TOKEN.
"""
Product Hunt Sensor - Fetches trending products from Product Hunt.
Uses the official GraphQL API (requires API token for full access).
Falls back to scraping if no token available.
"""
import sys
import os
import re
import json
from dataclasses import dataclass
from typing import List, Optional

import httpx

@dataclass
class PHProduct:
    """A Product Hunt product."""
    name: str
    tagline: str
    url: str
    votes_count: int
    website: Optional[str]
    topics: List[str]
    maker_name: str = "Unknown"
    maker_twitter: Optional[str] = None
    thumbnail_url: Optional[str] = None

def load_ph_token() -> Optional[str]:
    """Load Product Hunt API token from .env or environment variables."""
    # CI environments: env vars are set directly
    env_token = os.getenv("PRODUCTHUNT_TOKEN")
    if env_token:
        return env_token

    # Local: Try multiple possible .env locations
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),  # D:\Intel_Briefing\.env
        os.path.join(os.path.dirname(__file__), "..", ".env"),        # D:\Intel_Briefing\src\.env
        os.path.join(os.getcwd(), ".env"),                            # Current working dir
    ]
    
    for env_path in possible_paths:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8-sig") as f:
                for line in f:
                    if "PRODUCTHUNT_TOKEN" in line:
                        parts = line.strip().split("=", 1)
                        if len(parts) == 2:
                            token = parts[1].strip().strip('"').strip("'")
                            if token:
                                # Start hidden to avoid log spam
                                # print(f"    (Loaded PH token from {os.path.basename(env_path)})")
                                return token
    return None

def fetch_trending_products(limit: int = 10) -> List[PHProduct]:
    """Fetch trending products from Product Hunt."""
    print(f"  → Fetching top {limit} products from Product Hunt...")
    
    token = load_ph_token()
    
    if token:
        print("    (Using Official API Token)")
        try:
            return _fetch_via_api(token, limit)
        except Exception as e:
            print(f"    ⚠️ API Fetch Failed: {e}. Falling back to hydration...")
            
    # Fallback to hydration
    print("    (No API token found or API failed, using web scraping fallback)")
    return _fetch_via_hydration(limit)

def _fetch_via_api(token: str, limit: int) -> List[PHProduct]:
    """Fetch via official GraphQL API."""
    query = """
    query {
      posts(first: %d, order: VOTES) {
        edges {
          node {
            name
            tagline
            url
            votesCount
            website
            slug
            topics {
              edges {
                node {
                  name
                }
              }
            }
            user {
              name
              twitterUsername
            }
          }
        }
      }
    }
    """ % limit
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    resp = httpx.post(
        "https://api.producthunt.com/v2/api/graphql",
        json={"query": query},
        headers=headers,
        timeout=15
    )
    
    data = resp.json()
    products = []
    
    if "data" in data and "posts" in data["data"]:
        for edge in data["data"]["posts"]["edges"]:
            node = edge["node"]
            topics = [t["node"]["name"] for t in node.get("topics", {}).get("edges", [])]
            user = node.get("user", {}) or {}
            
            slug = node.get("slug")
            ph_url = f"https://www.producthunt.com/posts/{slug}" if slug else node["url"]
            
            products.append(PHProduct(
                name=node["name"],
                tagline=node["tagline"],
                url=ph_url,
                votes_count=node["votesCount"],
                website=node.get("website"),
                topics=topics[:3],
                maker_name=user.get("name", "Unknown"),
                maker_twitter=user.get("twitterUsername")
            ))
    
    return products

def _fetch_via_hydration(limit: int) -> List[PHProduct]:
    """
    Advanced Scraping: Extracts data from Next.js hydration state.
    No API token required.
    """
    print("    (Using Next.js hydration extraction - No Token Needed)")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        resp = httpx.get("https://www.producthunt.com/", headers=headers, timeout=15, follow_redirects=True)
        html = resp.text
        
        # 1. Extract __NEXT_DATA__ JSON blob
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', html)
        if not match:
            print("    ⚠️ Could not find __NEXT_DATA__ on page.")
            return _fetch_via_scraping_fallback(limit)
            
        data = json.loads(match.group(1))
        
        # 2. Navigate to Apollo State
        apollo_state = data.get("props", {}).get("pageProps", {}).get("apolloState", {})
        
        products = []
        all_posts = []
        
        for key, value in apollo_state.items():
            if key.startswith("Post:") and isinstance(value, dict):
                if "name" in value and "votesCount" in value:
                    all_posts.append(value)
        
        all_posts.sort(key=lambda x: x.get("votesCount", 0), reverse=True)
        
        for post in all_posts[:limit]:
            maker_name = "Unknown"
            maker_twitter = None
            
            user_ref = post.get("user")
            if user_ref and "__ref" in user_ref:
                user_obj = apollo_state.get(user_ref["__ref"], {})
                maker_name = user_obj.get("name", "Unknown")
                maker_twitter = user_obj.get("twitterUsername")
            
            slug = post.get("slug")
            ph_url = f"https://www.producthunt.com/posts/{slug}" if slug else None
            
            thumbnail_url = None
            thumbnail_node = post.get("thumbnail", {})
            if thumbnail_node and "url" in thumbnail_node:
                thumbnail_url = thumbnail_node["url"]
            
            products.append(PHProduct(
                name=post.get("name", "Unknown"),
                tagline=post.get("tagline", ""),
                url=ph_url or "https://www.producthunt.com/",
                votes_count=post.get("votesCount", 0),
                website=post.get("website"), 
                topics=[], 
                maker_name=maker_name,
                maker_twitter=maker_twitter,
                thumbnail_url=thumbnail_url
            ))
            
        return products
        
    except Exception as e:
        print(f"    ⚠️ Hydration extraction failed: {e}")
        return []

def print_products(products: List[PHProduct]):
    """Print products in a readable format."""
    print(f"\n{'='*60}")
    print(f"  🚀 Product Hunt Trending")
    print(f"{'='*60}\n")
    
    for i, p in enumerate(products, 1):
        print(f"{i}. {p.name}")
        print(f"   {p.tagline}")
        print(f"   ⬆️ {p.votes_count} votes | 👷 {p.maker_name} (@{p.maker_twitter or 'N/A'})")
        print(f"   🔗 {p.url}")
        print()

if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    products = fetch_trending_products(limit)
    if products:
        print_products(products)
    else:
        print("No products found.")
