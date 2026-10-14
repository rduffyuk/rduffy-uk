---
id: 1
title: "LinkedIn Content Automation Pipeline"
status: accepted
recordedStatus: "accepted"
date: 2026-02-01
tags: ["linkedin", "automation", "social-media", "content-pipeline"]
sourceKind: source-record
public: true
journeyId: "2026-02-01-adr-001-linkedin-content-automation-pipeline"
---
# ADR-001: LinkedIn Content Automation Pipeline

**Status**: Accepted
**Date**: 2026-02-01
**Jira**: VW-8 *(internal reference; destination redacted)*
**Confluence**: ADR-001 *(internal reference; destination redacted)*

---

## Context

Building an online presence requires consistent, high-quality content on LinkedIn. Manual posting is time-consuming, and there's no native way to:
1. Preview posts before publishing
2. Generate visual carousels without design tools
3. Integrate content creation into development workflows
4. Maintain quality gates for content approval

Existing MCP tools (e.g., `social-cli-mcp`) have API compatibility issues with LinkedIn's current endpoints.

---

## Decision

Build a custom LinkedIn automation pipeline with the following components:

### Architecture

```
Claude Code
     │
     ▼
Preview Server (localhost:3456)
     │
     ├─► Text Post Preview → LinkedIn ugcPosts API
     │
     └─► Carousel Generator
              │
              ├─► Puppeteer (HTML → PNG)
              ├─► pdf-lib (PNG → PDF)
              └─► LinkedIn Assets API → ugcPosts (NATIVE_DOCUMENT)
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Preview Server | Node.js + Express | Quality gate UI for content review |
| Carousel Generator | Puppeteer + pdf-lib | Render slides as images, combine to PDF |
| LinkedIn Integration | REST API (v2) | Publish text and document posts |

### Key Files

- `~/.claude/mcp-servers/linkedin-preview/server.js` - Express server with preview UI
- `~/.claude/mcp-servers/linkedin-preview/carousel-generator.js` - Puppeteer rendering pipeline
- `~/.claude/mcp-servers/linkedin-preview/.env` - API credentials (gitignored)
- `~/.claude/mcp-servers/LinkedIn-MCP/main_template.py` - FastMCP server (create/update/delete posts)
- `~/.claude/mcp-servers/mcp-linkedin/` - Third-party unofficial API wrapper (feed reading, job search)

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Text post preview | Working | Full preview + publish flow |
| Text post publish | Working | Tested successfully |
| Carousel generation | Working | 7.7s for 7 slides, system fonts + `waitUntil: 'domcontentloaded'` |
| Carousel publish | Working | REST Documents API + Posts API (validated 2026-02-22) |
| Dynamic slides | Working | `/api/carousel/generate` accepts `slides` array |

### API Migration (2026-02-22)

Migrated from deprecated v2 API to REST Community Management API:
- **Old (broken)**: `/v2/assets?action=registerUpload` → 403 on `feedshare-document` recipe
- **New (working)**: `/rest/documents?action=initializeUpload` + `/rest/posts`
- **Version header**: `LinkedIn-Version: 202602` (YYYYMM format, required)
- **Post ID**: Returned in `x-restli-id` response header (not body)

### Known Issues (Resolved)

1. ~~**Carousel timeout**: Google Fonts @import causes 30s timeout.~~ **FIXED**: System fonts + `waitUntil: 'domcontentloaded'`
2. **Template escaping**: Nested template literals cause syntax errors. Mitigation: String concatenation
3. ~~**registerUpload 403**: v2 assets API returns ACCESS_DENIED for feedshare-document.~~ **FIXED**: Migrated to REST Documents API

---

## Consequences

### Positive

- **Quality gates**: Human review before any LinkedIn post
- **Visual content**: Professional carousels without Canva/Figma
- **Workflow integration**: Content creation within Claude Code sessions
- **Local control**: No third-party services handling credentials
- **Extensibility**: Easy to add new post types (polls, articles)

### Negative

- **Maintenance burden**: Custom code vs. managed service
- **LinkedIn API changes**: May require updates when API evolves
- **Puppeteer dependency**: Requires headless Chrome runtime

---

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| `social-cli-mcp` | API compatibility issues with current LinkedIn endpoints |
| Zapier/Make.com | No preview capability, external dependency |
| LinkedIn native drafts | API doesn't support draft creation |
| Canva API | Requires separate subscription, over-engineered for carousels |

---

## API Reference

### LinkedIn Endpoints Used (Updated 2026-02-22)

```
# Text posts (v2 API - still working)
POST /v2/ugcPosts                          - Create text posts
GET  /v2/userinfo                          - Verify token (OpenID Connect)

# Carousel/document posts (REST API - migrated 2026-02-22)
POST /rest/documents?action=initializeUpload - Initialize document upload
PUT  {uploadUrl}                           - Upload PDF binary
POST /rest/posts                           - Create post with document attachment

# Required headers for REST API:
# LinkedIn-Version: 202602
# X-Restli-Protocol-Version: 2.0.0
```

### OAuth Scopes Required

- `openid` - Basic authentication
- `profile` - User info access
- `w_member_social` - Write posts (personal profile)

---

## Future Enhancements

### Phase 1: Pipeline Completion
1. Fix carousel generation timeout (font optimization)
2. Add MCP server wrapper for Claude Code integration
3. Support scheduling posts
4. Add analytics tracking
5. Template library for common carousel formats

### Phase 2: Company Page Support (Ryan Duffy Labs)
1. Register `w_organization_social` scope on LinkedIn Developer App
2. Get organization URN for Ryan Duffy Labs page
3. Update server.js to support posting as organization author
4. Content strategy: differentiate page vs personal profile content

---

## References

- [LinkedIn Marketing API Docs](https://learn.microsoft.com/en-us/linkedin/marketing/)
- [Puppeteer Documentation](https://pptr.dev/)
- [pdf-lib Documentation](https://pdf-lib.js.org/)
