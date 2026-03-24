# Global Skills Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate 23 Claude Code skills into 14 global skills (`~/.claude/commands/`) and 9 project-specific skills (`.claude/commands/`), with a matching CLAUDE.md split.

**Architecture:** Create `~/.claude/CLAUDE.md` with orchestrator identity only, and `~/.claude/commands/` with 14 generic skills. Each skill must be audited and stripped of MCE-specific references before moving. The project CLAUDE.md is trimmed to domain context only.

**Tech Stack:** Claude Code file system — Markdown skill files, no code compilation or tests.

---

## File Map

| Action | From | To |
|--------|------|----|
| Create | — | `C:/Users/carlo/.claude/CLAUDE.md` |
| Create | — | `C:/Users/carlo/.claude/commands/` (directory) |
| Move+clean | `.claude/commands/commit.md` | `~/.claude/commands/commit.md` |
| Move+clean | `.claude/commands/sdd.md` | `~/.claude/commands/sdd.md` |
| Move+clean | `.claude/commands/review.md` | `~/.claude/commands/review.md` |
| Move+clean | `.claude/commands/architect.md` | `~/.claude/commands/architect.md` |
| Move+clean | `.claude/commands/clean.md` | `~/.claude/commands/clean.md` |
| Move+clean | `.claude/commands/cartographer.md` | `~/.claude/commands/cartographer.md` |
| Move+clean | `.claude/commands/skill-creator.md` | `~/.claude/commands/skill-creator.md` |
| Move+clean | `.claude/commands/pm.md` | `~/.claude/commands/pm.md` |
| Move+clean | `.claude/commands/po.md` | `~/.claude/commands/po.md` |
| Move+clean | `.claude/commands/em.md` | `~/.claude/commands/em.md` |
| Move+clean | `.claude/commands/lead.md` | `~/.claude/commands/lead.md` |
| Move+clean | `.claude/commands/audit.md` | `~/.claude/commands/audit.md` |
| Move+clean | `.claude/commands/docs.md` | `~/.claude/commands/docs.md` |
| Move+clean | `.claude/commands/handoff.md` | `~/.claude/commands/handoff.md` |
| Rewrite | `CLAUDE.md` | `CLAUDE.md` (domain context only) |
| Delete | `.claude/commands/commit.md` … (14 files) | — |

Skills that stay in `.claude/commands/` untouched: `backend.md`, `frontend.md`, `devops.md`, `qa.md`, `security.md`, `status.md`, `animate.md`, `ux.md`, `webapp-testing.md`.

---

## Audit Rules (apply to every skill being moved)

Before writing a skill to `~/.claude/commands/`, verify and fix:

| Pattern to remove/generalize | Replace with |
|------------------------------|--------------|
| "de MotorControlEnterprise" in description/body | Remove or replace with "de este proyecto" |
| MCE-specific scopes (`auth api mqtt db infra edge stream motor camera wizard`) | Remove list; add note: "Use project-defined scopes from your project CLAUDE.md" |
| `.agents/tasks/in-progress.md` or `.agents/reviews/` paths | Remove or make generic (e.g., "project task tracker") |
| `ng build`, `dotnet build`, `dotnet test` build commands | Replace with generic placeholder: "Run the project's build command" |
| Angular/ASP.NET-specific conventions (PascalCase for .NET, `IEmailService`, etc.) | Remove tech-specific sections; keep language-agnostic principles |
| MCE server IPs, Docker service names, DB credentials | Remove entirely |
| `implementation_log.md` with absolute MCE path | Keep filename only (generic), remove absolute path |

---

## Task 1: Create `~/.claude/CLAUDE.md`

**Files:**
- Create: `C:/Users/carlo/.claude/CLAUDE.md`

- [ ] **Step 1: Write the global CLAUDE.md**

Create `C:/Users/carlo/.claude/CLAUDE.md` with this exact content:

```markdown
# CLAUDE.md — Orquestador Global

## Identidad
Coordinador único. Hablas en términos de negocio. **Nunca ejecutas — siempre delegas.**

## Regla de oro — Orquestador puro
Antes de usar Read / Edit / Write / Grep / Glob sobre archivos del proyecto:
> *¿Esto es orquestación o ejecución?*
- **Orquestación** (resumir, coordinar, decidir, reportar) → hacer tú mismo, respuesta corta
- **Ejecución** (leer código, editar, analizar, testear) → **delegar al skill. Sin excepciones.**

## Agentes paralelos
Tareas con 2+ dominios → lanzar **todos a la vez**, `run_in_background: true`. No esperar entre ellos.

## Líneas rojas
- ❌ No escribir código de producción directo
- ❌ No deploy sin confirmación explícita
- ❌ No commit/push sin que el usuario lo pida
- ❌ No romper contratos de API sin avisar
- ❌ No mencionar IA en commits ni comentarios

## Commits (convención global)
`type(scope): descripción imperativa (max 72 chars)` — sin punto final, sin Co-Authored-By de IA.
Tipos: `feat fix refactor test docs perf chore security`
Scopes: definidos por cada proyecto en su CLAUDE.md

## Skills globales
| Dominio | Skill |
|---------|-------|
| Feature nueva (spec + impl) | `/sdd` |
| Arquitectura, ADR | `/architect` |
| Sprint, backlog | `/pm` |
| Product Owner | `/po` |
| Engineering Manager | `/em` |
| Tech Lead | `/lead` |
| Refactor, clean code | `/clean` |
| Commit | `/commit` |
| Code review | `/review` |
| Mapear codebase | `/cartographer` |
| Crear/mejorar skills | `/skill-creator` |
| Auditoría de código | `/audit` |
| Documentación | `/docs` |
| Handoff de sesión | `/handoff` |
```

- [ ] **Step 2: Verify file exists and content is correct**

Read `C:/Users/carlo/.claude/CLAUDE.md` and confirm:
- No MCE-specific content (no IPs, no Docker names, no stack versions)
- Skills table has 14 entries
- No project-specific scopes in the Commits section

- [ ] **Step 3: Commit**

```bash
git add -f "C:/Users/carlo/.claude/CLAUDE.md" 2>/dev/null || echo "File is outside repo — no commit needed for global files"
```

Note: `~/.claude/` is outside the MCE git repo. Global files are not committed to MCE. This is expected.

---

## Task 2: Create `~/.claude/commands/` directory

**Files:**
- Create directory: `C:/Users/carlo/.claude/commands/`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "C:/Users/carlo/.claude/commands"
```

- [ ] **Step 2: Verify it exists**

```bash
ls "C:/Users/carlo/.claude/commands"
```

Expected: empty directory (no error).

---

## Task 3: Move and clean `commit.md`

**Files:**
- Read: `C:/dev/MotorControlEnterprise/.claude/commands/commit.md`
- Create: `C:/Users/carlo/.claude/commands/commit.md`

Known MCE-specific content to fix:
- Line 42: MCE scopes list → generalize
- Lines 22-23: `.agents/tasks/in-progress.md` → make generic

- [ ] **Step 1: Read the source file**

Read `C:/dev/MotorControlEnterprise/.claude/commands/commit.md` completely.

- [ ] **Step 2: Write cleaned version to global**

Write `C:/Users/carlo/.claude/commands/commit.md`.

Changes from source:
- In the description frontmatter: remove "de MotorControlEnterprise"
- In "Scopes válidos": replace the MCE list with: `Definidos en el CLAUDE.md del proyecto`
- In "Paso 3 — Leer el contexto": replace `.agents/tasks/in-progress.md` with: `el tracker de tareas del proyecto (si existe)`
- In "Paso 8 — Actualizar la tarea": replace path references with generic language
- Keep all process steps, format rules, and absolute rules intact

- [ ] **Step 3: Verify**

Read `C:/Users/carlo/.claude/commands/commit.md` and confirm no MCE-specific scopes or absolute paths appear.

---

## Task 4: Move and clean `sdd.md`

**Files:**
- Read: `C:/dev/MotorControlEnterprise/.claude/commands/sdd.md`
- Create: `C:/Users/carlo/.claude/commands/sdd.md`

Known MCE-specific content to fix:
- Description and body: "de MotorControlEnterprise" → remove
- Phase 7 VERIFY: `ng build --configuration production` and `dotnet build` → generalize
- `implementation_log.md` references → keep filename, remove MCE absolute context
- `/backend`, `/frontend` in Phase 5 → keep as examples (generic enough as placeholders)

- [ ] **Step 1: Read the source file**

Read `C:/dev/MotorControlEnterprise/.claude/commands/sdd.md` completely.

- [ ] **Step 2: Write cleaned version to global**

Write `C:/Users/carlo/.claude/commands/sdd.md`.

Changes from source:
- Description: "Spec-Driven Development para MotorControlEnterprise" → "Spec-Driven Development"
- Body line 7: "de MotorControlEnterprise" → remove
- Phase 7 build commands: replace with `# Run the project's build/test command`
- Keep all 8 phases, format, and absolute rules intact

- [ ] **Step 3: Verify**

Read `C:/Users/carlo/.claude/commands/sdd.md` and confirm no "MotorControlEnterprise", no `ng build`, no `dotnet build`.

---

## Task 5: Move and clean `review.md`

**Files:**
- Read: `C:/dev/MotorControlEnterprise/.claude/commands/review.md`
- Create: `C:/Users/carlo/.claude/commands/review.md`

Known MCE-specific content to fix:
- Line 1: "de MotorControlEnterprise" → remove
- Section C "Convenciones .NET / Angular" → make language-agnostic
- Section E "Patrones del codebase" → remove ASP.NET-specific patterns (Controllers, DTOs, Services)
- Line 73: `.agents/reviews/YYYYMMDD-review-...` → make generic

- [ ] **Step 1: Read the source file**

Read `C:/dev/MotorControlEnterprise/.claude/commands/review.md` completely.

- [ ] **Step 2: Write cleaned version to global**

Write `C:/Users/carlo/.claude/commands/review.md`.

Changes from source:
- Line 1: remove "de MotorControlEnterprise"
- Section C: rename to "Convenciones del proyecto" and replace .NET/Angular specifics with: "Follow the naming conventions established in the codebase"
- Section E: rename to "Patrones del codebase" — remove Controller/Service/DTO specifics, keep: "Does the code follow established patterns in the project?"
- Report path: replace `.agents/reviews/` with: `the project's review output folder (if defined)`
- Keep all other sections intact

- [ ] **Step 3: Verify**

Read `C:/Users/carlo/.claude/commands/review.md` and confirm no .NET or Angular specific content, no MCE paths.

---

## Task 6: Move and clean remaining 11 skills

**Files:** `architect.md`, `clean.md`, `cartographer.md`, `skill-creator.md`, `pm.md`, `po.md`, `em.md`, `lead.md`, `audit.md`, `docs.md`, `handoff.md`

For each file:
- [ ] **Step 1: Read source** from `C:/dev/MotorControlEnterprise/.claude/commands/{skill}.md`
- [ ] **Step 2: Apply audit rules** (see Audit Rules section above)
- [ ] **Step 3: Write to** `C:/Users/carlo/.claude/commands/{skill}.md`

Process all 11 in sequence. For each one, the pattern is:
1. Remove "de MotorControlEnterprise" from descriptions and body
2. Remove MCE-specific paths, scopes, tech references
3. Keep all methodology, process, and format rules intact

- [ ] **Step 4: Verify all 11 files exist in `~/.claude/commands/`**

```bash
ls C:/Users/carlo/.claude/commands/
```

Expected: 14 files total (3 from Tasks 3-5 + 11 from this task):
`architect.md audit.md cartographer.md clean.md commit.md docs.md em.md handoff.md lead.md pm.md po.md review.md sdd.md skill-creator.md`

---

## Task 7: Rewrite project CLAUDE.md

**Files:**
- Modify: `C:/dev/MotorControlEnterprise/CLAUDE.md`

- [ ] **Step 1: Read current CLAUDE.md**

Read `C:/dev/MotorControlEnterprise/CLAUDE.md` completely.

- [ ] **Step 2: Rewrite with domain context only**

The new project CLAUDE.md must contain ONLY MCE-specific content. Write it as:

```markdown
# CLAUDE.md — MotorControlEnterprise (NIRM GROUP)

> El orquestador global y las reglas base están en `~/.claude/CLAUDE.md`.
> Este archivo agrega el contexto de dominio de MotorControlEnterprise.

## Stack
- API: ASP.NET Core 8, EF Core 8, JWT · DB: PostgreSQL 15
- MQTT: MQTTnet 5.1, Mosquitto :1885
- Stream: MediaMTX + WebRTC/WHEP (sin HLS) · nginx proxy con credenciales
- Email: Resend.dev · Roles: `admin | installer | client`
- Frontend: Angular 17 standalone, SCSS variables
- Prod: `victormanuel@177.247.175.4:2222`

## Infra fija (no cambia entre sesiones)
- DB user: `motor_ent` · DB name: `MotorControlEnterprise`
- Docker services: `mce-postgres` `mce-mosquitto` `mce-central-mediamtx` `mce-backend` `mce-frontend` `mce-nginx`
- Servidor en mantenimiento hasta ~2026-04-01 — confirmar estado antes de deploy

## Commits — Scopes de este proyecto
`auth api mqtt db infra edge stream motor camera`

## Skills de dominio
| Dominio | Skill |
|---------|-------|
| Endpoint, DB, MQTT, .NET | `/backend` |
| Angular, SCSS, RxJS | `/frontend` |
| QA, aceptación | `/qa` |
| OWASP, JWT, seguridad | `/security` |
| Deploy, Docker, SSH | `/devops` |
| UI, theming, accesibilidad | `/ux` |
| Animaciones | `/animate` |
| Estado del sistema | `/status` |
| Pruebas UI, Playwright | `/webapp-testing` |

## Capturas del usuario
`Read` con ruta absoluta: `C:\Users\carlo\Pictures\Screenshots\` · `C:\Users\carlo\Desktop\` · `C:\Users\carlo\Pictures\Analisis-imagnes\`

## Contexto entre sesiones
Memory auto-save activo en `C:\Users\carlo\.claude\projects\C--dev-MotorControlEnterprise\memory\`.
Al terminar trabajo significativo → guardar en `project_*.md` o `feedback_*.md`.
Ver índice: `MEMORY.md`

## Inicio de sesión
Al iniciar cada sesión, leer:
1. `C:\Users\carlo\.claude\projects\C--dev-MotorControlEnterprise\memory\implementation_log.md` — últimas 3 sesiones
2. `C:\Users\carlo\.claude\projects\C--dev-MotorControlEnterprise\memory\project_state.md` — estado actual

## Compact Instructions
Al compactar, preservar:
- Últimos feat/fix commits y su razonamiento técnico
- Bugs encontrados y su causa raíz (especialmente CSS/stacking context, serialización de enums)
- Decisiones de arquitectura de la sesión actual
- Estado de features activas: qué está en prod, qué está en progreso
- Bloqueantes activos y workarounds aplicados
Descartar: outputs de herramientas verbose, listados de archivos completos, tareas ya cerradas.
```

- [ ] **Step 3: Verify project CLAUDE.md**

Confirm:
- No orchestrator identity (no "Coordinador único", no "Regla de oro", no "Líneas rojas" section)
- No global skills table (sdd, commit, review, etc. not listed)
- Contains: Stack, Infra fija, Scopes, Skills de dominio (9 entries), Capturas, Contexto, Inicio de sesión, Compact Instructions

- [ ] **Step 4: Commit**

```bash
cd C:/dev/MotorControlEnterprise
git add CLAUDE.md
git commit -m "refactor: split CLAUDE.md into global orchestrator and domain context"
```

---

## Task 8: Remove moved skills from project `.claude/commands/`

**Files:**
- Delete from `C:/dev/MotorControlEnterprise/.claude/commands/`: the 14 moved files

- [ ] **Step 1: Verify 9 domain skills still exist before deleting**

```bash
ls C:/dev/MotorControlEnterprise/.claude/commands/
```

Confirm these 9 are present: `backend.md frontend.md devops.md qa.md security.md status.md animate.md ux.md webapp-testing.md`

- [ ] **Step 2: Delete the 14 moved skill files**

Delete each of the following from `C:/dev/MotorControlEnterprise/.claude/commands/`:
`commit.md sdd.md review.md architect.md clean.md cartographer.md skill-creator.md pm.md po.md em.md lead.md audit.md docs.md handoff.md`

Use the Bash tool to remove them one by one or in a batch from within the project directory (not rm -rf).

- [ ] **Step 3: Verify only 9 domain skills remain**

```bash
ls C:/dev/MotorControlEnterprise/.claude/commands/
```

Expected output (9 files only):
```
animate.md  backend.md  devops.md  frontend.md  qa.md  security.md  status.md  ux.md  webapp-testing.md
```

- [ ] **Step 4: Confirm no namespace collision**

```bash
comm -12 <(ls C:/Users/carlo/.claude/commands/ | sort) <(ls C:/dev/MotorControlEnterprise/.claude/commands/ | sort)
```

Expected: no output (no shared filenames).

- [ ] **Step 5: Commit**

```bash
cd C:/dev/MotorControlEnterprise
git add .claude/commands/
git commit -m "refactor: remove globally-promoted skills from project commands"
```

---

## Task 9: Verification

- [ ] **Test A — MCE project has all 23 skills**

Open a new Claude Code session in `C:/dev/MotorControlEnterprise`. Verify that both sets of skills are listed in the system-reminder at session start:
- Global (14): commit, sdd, review, architect, clean, cartographer, skill-creator, pm, po, em, lead, audit, docs, handoff
- Domain (9): backend, frontend, devops, qa, security, status, animate, ux, webapp-testing

- [ ] **Test B — Fresh project gets global skills automatically**

Create a temp directory with no `.claude/` folder. Open in Claude Code. Verify the 14 global skills appear in the available skills list.

- [ ] **Test C — No namespace collision**

```bash
comm -12 <(ls C:/Users/carlo/.claude/commands/ | sort) <(ls C:/dev/MotorControlEnterprise/.claude/commands/ | sort)
```

Expected: empty output.

- [ ] **Test D — Global CLAUDE.md has no MCE content**

Read `C:/Users/carlo/.claude/CLAUDE.md`. Confirm: no IPs, no Docker service names, no `motor_ent`, no `Angular 17`, no `ASP.NET`.

- [ ] **Test E — Project CLAUDE.md has no orchestrator content**

Read `C:/dev/MotorControlEnterprise/CLAUDE.md`. Confirm: no "Coordinador único", no "Regla de oro", no global skills table.
