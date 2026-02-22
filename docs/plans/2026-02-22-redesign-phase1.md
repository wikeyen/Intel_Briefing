# Phase 1: Foundation Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the 4-category display layer, build dashboard home page, extract data page, add sidebar pipeline indicator, and add GitHub star velocity tracking.

**Architecture:** Display categories (high-trust, news, trend, opinions) map from existing 8 internal categories. Dashboard consumes existing API data. No backend schema changes except GitHub velocity snapshots.

**Tech Stack:** Next.js 15 App Router, TypeScript, CSS custom properties, SQLite (libsql)

## Design Decisions

1. **Sequential pipeline** — keep stages sequential, optimize transitions
2. **Display layer mapping** — 4 display categories on top of 8 internal (no breaking change)
3. **Comments as nested data** — `comments?: Array<{author, text, sentiment}>` on parent item
4. **LLM per-article perspective tagging** — deferred to Phase 3 (needs news sources first)

## Tasks

### Task 1: Display Category Mapping Layer
### Task 2: Dashboard Page Route & Shell
### Task 3: Dashboard Component — Data Fetching & Layout
### Task 4: Dashboard — Executive Summary Widget
### Task 5: Dashboard — Sentiment Overview Widget
### Task 6: Dashboard — Trending Items Widget
### Task 7: Dashboard — Section Summaries (Collapsible)
### Task 8: Extract Data Page — Use Display Categories
### Task 9: Sidebar — Pipeline Status Indicator + Nav Update
### Task 10: Root Redirect to Dashboard
### Task 11: GitHub Star Velocity Tracking
### Task 12: Verification & Polish
