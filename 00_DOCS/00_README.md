---
metadata:
  status: PRODUCTION
  version: 1.0
  tldr: "AIGILE CLI documentation index - guides, references, and workflows for AI agents and developers"
  author: Vladimir K.S.
---

# AIGILE CLI Documentation

> **AIGILE is NOT classical Agile.** It's a hybrid methodology combining waterfall planning with agile execution, optimized for AI agents working in hour-long sprints.

---

## Start Here: AIGILE Methodology

| Document | Purpose |
|----------|---------|
| **[AIGILE-METHODOLOGY.md](./AIGILE-METHODOLOGY.md)** | **CRITICAL: Understand AIGILE vs Classical Agile** |

**Key Differences:**
- Full vision capture upfront (waterfall phase)
- Sprints are hours/minutes, not weeks
- AI agents work in parallel
- Module-first build, not MVP per sprint
- SDD/BDD/TDD principles enforced

---

## Quick Navigation

| Document | Purpose | Audience |
|----------|---------|----------|
| [AIGILE-METHODOLOGY.md](./AIGILE-METHODOLOGY.md) | AIGILE hybrid methodology | All |
| [AI-AGENT-GUIDE.md](./AI-AGENT-GUIDE.md) | How AI agents use AIGILE | AI Agents |
| [CLI-REFERENCE.md](./CLI-REFERENCE.md) | Complete command reference | All |
| [QUICK-START.md](./QUICK-START.md) | 5-minute getting started | All |

## UX Journeys

Step-by-step workflows with Mermaid diagrams:

| Journey | Description |
|---------|-------------|
| [01-installation](./04_ux-journeys/journey-01-installation.md) | Install and initialize |
| [02-project-setup](./04_ux-journeys/journey-02-project-setup.md) | Configure project |
| [03-sprint-planning](./04_ux-journeys/journey-03-sprint-planning.md) | Plan sprint work |
| [04-ai-daily-workflow](./04_ux-journeys/journey-04-ai-daily-workflow.md) | AI agent daily workflow |
| [05-bug-triage](./04_ux-journeys/journey-05-bug-triage.md) | Bug tracking workflow |
| [06-release-management](./04_ux-journeys/journey-06-release-management.md) | Release versions |
| [07-context-continuity](./04_ux-journeys/journey-07-context-continuity.md) | Resume work sessions |

## Architecture

| Document | Content |
|----------|---------|
| [entity-hierarchy](./05_architecture/entity-hierarchy.md) | Entity relationships |
| [workflow-states](./05_architecture/workflow-states.md) | Status transitions |
| [command-map](./05_architecture/command-map.md) | Command groupings |

## Personas

| Persona | Description |
|---------|-------------|
| [ai-agent](./01_personas/ai-agent.md) | AI agent - autonomous code executor |
| [human-product-owner](./01_personas/human-product-owner.md) | Product Owner - vision definer |

## Cross-References

- Specifications: `/.aigile/01_SPECS/aigile/`
- BDD Features: `/.aigile/02_FEATURES/`
- Source Code: `/packages/aigile/src/`
