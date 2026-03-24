# Design: Global vs Project Skills Architecture

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Claude Code skill system reorganization — global/project separation
**Requires:** Claude Code with `~/.claude/commands/` global support (available in all current releases)

---

## Problem

All 23 skills (both generic workflow and domain-specific) live inside `.claude/commands/` of MotorControlEnterprise. When switching to a new project, none of the generic skills (commit, review, sdd, etc.) are available — they have to be recreated or copied manually. There is no global orchestrator identity either; it is embedded inside the project CLAUDE.md alongside domain-specific content.

---

## Decision

Adopt **Option A: Move-and-split** using Claude Code's native cascading support for `~/.claude/CLAUDE.md` and `~/.claude/commands/`.

---

## Architecture

### Two-layer skill system

```
~/.claude/                          ← GLOBAL (all projects)
├── CLAUDE.md                       ← Orchestrator identity only
└── commands/
    ├── commit.md
    ├── review.md
    ├── architect.md
    ├── sdd.md
    ├── clean.md
    ├── cartographer.md
    ├── skill-creator.md
    ├── pm.md
    ├── po.md
    ├── em.md
    ├── lead.md
    ├── audit.md
    ├── docs.md
    └── handoff.md

{project}/.claude/                  ← LOCAL (this project only)
├── CLAUDE.md                       ← Stack, infra, domain context
└── commands/
    ├── backend.md
    ├── frontend.md
    ├── devops.md
    ├── qa.md
    ├── security.md
    ├── status.md
    ├── animate.md
    ├── ux.md
    └── webapp-testing.md
```

**Namespace rule:** Project skill filenames must never match a global skill filename. If a conflict arises, the project skill wins (Claude Code project layer takes precedence over global). Avoid conflicts by design.

### Global CLAUDE.md — orchestrator identity

Contains only content that is true for any project. Checklist of what belongs here:

| Content | Global | Project |
|---------|--------|---------|
| Orchestrator role and golden rule | ✅ | — |
| Hard red lines (no code, no deploy without confirm) | ✅ | — |
| Commit format convention (`type(scope): ...`) | ✅ | — |
| Parallel agents rule | ✅ | — |
| Generic skills routing table (14 global skills) | ✅ | — |
| Tech stack and versions | — | ✅ |
| Server IPs, SSH ports, Docker service names | — | ✅ |
| DB credentials and names | — | ✅ |
| Screenshot paths | — | ✅ |
| Domain skills routing table | — | ✅ |
| Session startup instructions (memory files) | — | ✅ |
| Brand/design system details | — | ✅ |

### Project CLAUDE.md — domain context

Contains only what is specific to the project. References the global CLAUDE.md implicitly (Claude Code loads global first, then project in cascade — project extends global, never replaces it).

---

## Skill Classification

### Global (14 skills — move to `~/.claude/commands/`)

| Skill | Rationale |
|-------|-----------|
| commit | Conventional Commits applies to any repo |
| review | Code review process is stack-agnostic |
| architect | ADR and system design are universal |
| sdd | Spec-Driven Development applies to any project |
| clean | SOLID and refactoring principles are universal |
| cartographer | Maps any codebase |
| skill-creator | Creates skills for any project |
| pm | Project management role is generic |
| po | Product owner role is generic |
| em | Engineering manager role is generic |
| lead | Tech lead role is generic |
| audit | Code audit principles are universal |
| docs | Documentation workflow is generic |
| handoff | Session handoff pattern is universal |

### Project-specific (9 skills — stay in `.claude/commands/`)

| Skill | Rationale |
|-------|-----------|
| backend | ASP.NET Core 8, EF Core 8, MQTT — MCE specific |
| frontend | Angular 17, SCSS variables, WebRTC/WHEP — MCE specific |
| devops | SSH to MCE server, Docker service names — MCE specific |
| qa | MCE acceptance criteria and QA gates |
| security | OWASP + JWT + MQTT ACL in MCE context |
| status | MCE infrastructure monitoring |
| animate | Angular 17 animations in MCE design system |
| ux | MCE design system (navy + gold palette) |
| webapp-testing | Playwright + Angular 17 for MCE |

---

## Implementation Steps

### Step 1 — Create `~/.claude/CLAUDE.md`

Extract from the project CLAUDE.md only the content that passes the global checklist above. MCE-specific content (server IPs, Docker services, stack versions, screenshot paths, domain skills table, session startup) must not appear in the global file.

### Step 2 — Audit and move 14 global skills

For each of the 14 skills being moved to `~/.claude/commands/`:
1. Read the skill file
2. Remove any MCE-specific references: MQTT scopes (`auth api mqtt db infra edge stream motor camera`), MCE server details, Angular/ASP.NET version specifics, MCE examples
3. Verify the skill reads as applicable to any project
4. Copy cleaned file to `~/.claude/commands/`

### Step 3 — Clean project CLAUDE.md

Remove all content that was moved to the global CLAUDE.md (orchestrator role, golden rule, red lines, commit format, parallel agents rule, global skills table). What remains must be only MCE-specific content.

### Step 4 — Remove moved skills from project

Delete the 14 skill files from `.claude/commands/` that were moved to global. Confirm only the 9 domain skills remain.

### Step 5 — Verify

**Test A — Project with domain skills:**
Open MotorControlEnterprise in Claude Code. Confirm `/commit`, `/sdd`, `/review` (global) and `/backend`, `/frontend`, `/devops` (domain) are all available — 23 skills total.

**Test B — Fresh project:**
Create an empty directory, open in Claude Code (no `.claude/` folder). Confirm the 14 global skills are available with no project configuration.

**Test C — No namespace collision:**
Confirm no filename in `.claude/commands/` matches any filename in `~/.claude/commands/`.

---

## What Is Not Changed

- Superpowers plugin (`~/.claude/plugins/`) — already global, not touched
- Memory system (`~/.claude/projects/`) — not affected
- Git hooks — not affected
- Any backend, frontend, or infrastructure code

---

## How New Projects Work After This Change

1. Open new project in Claude Code
2. Global CLAUDE.md + 14 global skills load automatically
3. Create `.claude/CLAUDE.md` with project stack and infra
4. Create `.claude/commands/` with domain skills for that project
5. All generic workflow (commit, sdd, review, etc.) is immediately available with zero setup

---

## Success Criteria

- Opening MotorControlEnterprise: 14 global + 9 domain = 23 skills available
- Opening a brand-new empty project: 14 global skills available with no additional setup
- Project CLAUDE.md contains zero orchestrator identity content
- Global CLAUDE.md contains zero MCE-specific content (no IPs, no Docker service names, no stack versions, no screenshot paths)
- No skill filename exists in both `~/.claude/commands/` and `.claude/commands/`
