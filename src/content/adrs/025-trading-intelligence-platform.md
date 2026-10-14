---
id: 25
title: "Trading Intelligence Platform Architecture"
status: proposed
recordedStatus: "Proposed"
date: 2026-03-15
tags: ["architecture", "trading", "dashboard", "finops", "interactive-brokers"]
sourceKind: source-record
public: true
journeyId: "2026-03-15-adr-025-trading-intelligence-platform-architecture"
---
# ADR-025: Trading Intelligence Platform Architecture

**Status**: Proposed
**Date**: 2026-03-15
**Jira**: VW-138
**Supersedes**: FinOps Trading Agent Architecture Design (2026-01-16, informal — no ADR number)

## Context

A FinOps Trading Agent was designed in January 2026 with a comprehensive dual-stack architecture (Production: Perplexity + vLLM vs Testbed: VADER + FinBERT), IBKR paper trading integration, Prefect orchestration, and Unleash A/B testing. The IBKR account was approved with $1M simulated capital. The project stalled at Phase 1 Step 1 (TWS installation + API configuration).

In March 2026, analysis of trending open-source projects identified [WorldMonitor](https://github.com/koala73/worldmonitor) (38K stars) — a real-time global intelligence dashboard with AI-powered news aggregation, 3D globe visualisation, and cross-signal correlation across 435+ news feeds. This inspired extending the trading agent with a visual intelligence dashboard layer.

### Key findings from repo analysis:
- WorldMonitor: Multi-variant single codebase (5 dashboards from 1 repo), 3-tier CDN caching, Protocol Buffers for 22 services, Ollama local inference
- DeerFlow (ByteDance): Sub-agent isolation, progressive skill loading, aggressive context management
- OpenViking (Volcengine): L0/L1/L2 tiered context loading, filesystem-based agent memory

### Broker constraint:
- **Hargreaves Lansdown**: No official API. No MetaTrader support. Web scraping is fragile and against T&Cs
- **Interactive Brokers**: Full REST + WebSocket + FIX API. Covers UK (LSE), US (NYSE/NASDAQ), and Asia (TSE/HKEX/SSE)
- Decision: HL for manual/ISA holdings. IBKR for algorithmic trading

## Decision

Revive the FinOps Trading Agent with the following additions:

### 1. Real-Time Intelligence Dashboard
- WorldMonitor-inspired situational awareness interface
- Market data across UK, US, and Asian exchanges
- AI-synthesised news briefs with cross-signal correlation
- Geopolitical overlay with risk scoring
- Technical indicator visualisation

### 2. Retain Existing Architecture
- Dual-stack sentiment analysis (Production + Testbed) with Unleash A/B testing
- IBKR paper trading → live execution path
- Prefect-orchestrated daily trading flow
- Qdrant collections for trading news, signals, and experiments
- K3s deployment in rootweaver namespace

### 3. Deployment Model (To Be Decided)
Options under consideration:
- **K3s self-hosted** (like arch-viz dashboard) — full control, integrates with existing infrastructure
- **Cloudflare Pages** (like blog) — lightweight, accessible from anywhere
- **Tauri desktop app** (like WorldMonitor) — native, offline-capable

### 4. Market Coverage
- **UK**: LSE (FTSE 100/250, AIM)
- **US**: NYSE, NASDAQ (S&P 500, tech stocks)
- **Asia**: TSE (Nikkei), HKEX (Hang Seng), SSE (Shanghai Composite)
- **NOT crypto** — equities only

### 5. Data Sources (Free Tier First)
- Yahoo Finance RSS (free, no API key)
- Alpha Vantage (25 calls/day free)
- Finnhub (free tier)
- Financial Times / Reuters (via Crawl4AI scraping)
- IBKR market data (included with account)

## Consequences

### Positive
- Reuses existing K3s infrastructure (Qdrant, vLLM, Ollama, Prefect, Unleash, Grafana)
- Dual-stack A/B testing validates open-source vs paid sentiment analysis
- Paper trading with $1M simulated capital allows risk-free validation
- Dashboard provides situational awareness beyond raw signals
- Data-driven approach with proven backtesting before live trading

### Negative
- Multi-market timezone complexity (UK 08:00-16:30, US 14:30-21:00, Asia varies)
- Free tier data sources have rate limits and delays (15-20 min for some)
- IBKR TWS requires desktop process running (or IB Gateway for lighter footprint)
- Dashboard adds frontend complexity to a primarily backend/ML project

## Alternatives Considered

### 1. Hargreaves Lansdown API (Rejected)
- No official API exists
- Unofficial web scraping libraries are fragile, unsupported, and against T&Cs
- Cannot be used for automated execution

### 2. Alpaca (Considered, Deferred)
- Commission-free US equities with good REST API
- US-only — doesn't cover UK or Asia
- Could be added as secondary broker for US market access

### 3. IG (Considered, Deferred)
- UK-based, covers UK/US/Asia via CFDs and spread betting
- Tax-efficient for UK residents (spread betting is tax-free)
- CFD model differs from direct equity ownership
- Could complement IBKR for spread betting strategies

### 4. Cloud-only approach (Rejected)
- Services like Quantopian (defunct), QuantConnect
- Less control over infrastructure
- Doesn't leverage existing K3s/vLLM/Qdrant stack

## Existing Assets to Reuse

| Asset | Location | Status |
|---|---|---|
| Architecture design | `09-System/Architecture/2026-01-16-Finops-Trading-Agent-Architecture-Design.md` | Complete, needs update |
| Level 5 agent design | `09-System/Architecture/2026-01-16-Level-5-Autonomous-Trading-Agent-Architecture-Design.md` | Complete |
| IBKR account | Paper trading approved | API config pending |
| Educational guide | `04-Knowledge-Systems/Trading/` | 3 copies (deduplicate) |
| K3s manifest draft | In architecture doc | Needs GitOps integration |
| Prefect flow design | In architecture doc | Needs implementation |

## Implementation Phases

### Phase 0: Unblock (1 day)
- Install TWS/IB Gateway on Desktop
- Configure API access (port 7497)
- Test Python connection with ib_async
- Deduplicate 3x educational guide copies in vault

### Phase 1: Data Pipeline (1 week)
- Deploy Crawl4AI for news ingestion
- Set up free tier data feeds (Yahoo Finance, Alpha Vantage, Finnhub)
- Create Qdrant collections (trading_news, trading_signals, trading_experiments)
- Implement VADER + FinBERT sentiment analysis

### Phase 2: Signal Engine (1 week)
- Implement signal generation with vLLM/Ollama
- Build risk management module
- Set up Unleash feature flags for A/B testing
- Create Prefect daily trading flow

### Phase 3: Dashboard (2 weeks)
- Design and build intelligence dashboard
- Market data visualisation (charts, heatmaps)
- News feed with sentiment overlay
- Technical indicators display
- Deploy to K3s (or chosen platform)

### Phase 4: Paper Trading (4 weeks)
- Run automated paper trading pipeline
- Collect A/B experiment data
- Tune risk parameters
- Validate signal accuracy across markets

### Phase 5: Live Trading (ongoing)
- Graduate to live trading with small capital
- Monitor and iterate based on performance data

---

*Related: 2026-01-16-Finops-Trading-Agent-Architecture-Design *(internal reference; not included)* | 2026-01-17-IBKR-Account-Setup-Progress *(internal reference; not included)**
