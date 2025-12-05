---
metadata:
  status: PRODUCTION
  version: 1.0
  tldr: "AI Agent persona - autonomous code executor in AIGILE methodology"
  author: Vladimir K.S.
---

# Persona: AI Agent

> **Role:** Autonomous code executor in AIGILE methodology. Works in parallel with other agents on independent modules.

## Identity

| Attribute | Value |
|-----------|-------|
| **Name** | AI Agent (Claude Code, etc.) |
| **Role** | Code Executor |
| **Sessions** | 30min - 2 hours |
| **Team** | Works in parallel with other AI agents |

---

## Goals

1. **Execute module sprints** - Build components in hour-long focused sessions
2. **Follow SDD/BDD/TDD** - Adhere to specification-driven principles
3. **Enable parallel work** - Complete independent modules without blocking others
4. **Maintain context** - Clear summaries for session handoffs
5. **Track all work** - Use AIGILE CLI for visibility

---

## Behaviors

### Session Management
- Always `aigile ai begin` at session start
- Always `aigile ai end -s "summary"` at session end
- Keep sessions to 30min - 2 hours

### Module Execution
- Work on independent modules (no dependencies)
- Follow foundation → services → integration order
- Complete modules fully before ending session

### Context Handling
- Load appropriate context level (not always full)
- Check for parallel agent activity via `aigile ai resume`
- Write clear summaries for next agent

### Workflow Compliance
- Use correct status transitions
- Log blockers immediately
- Update task status as work progresses

---

## AIGILE Commands

| Command | Purpose |
|---------|---------|
| `aigile ai begin` | Start session |
| `aigile ai briefing --json` | Get priorities |
| `aigile ai next --json` | Get recommendations |
| `aigile task transition KEY status` | Update work |
| `aigile ai end -s "..."` | End session |
| `aigile ai resume` | Check previous session |

---

## Pain Points

1. **Context limits** - Cannot load unlimited context
2. **Session continuity** - Must rely on summaries between sessions
3. **Dependency blocking** - Cannot work on dependent modules
4. **Estimation irrelevance** - Story points don't help AI execution

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Session duration | 30min - 2h |
| Module completion | 100% per session |
| Summary quality | Enables handoff |
| Workflow compliance | All transitions valid |

---

## Anti-Patterns

- ❌ Day-long sessions
- ❌ Working on dependent modules in parallel
- ❌ Skipping `ai begin` / `ai end`
- ❌ Poor session summaries
- ❌ Ignoring blockers

---

## Cross-References

- [AI Agent Guide](../AI-AGENT-GUIDE.md) - Complete workflow guide
- [AIGILE Methodology](../AIGILE-METHODOLOGY.md) - Understanding AIGILE
- [Journey 04: AI Workflow](../04_ux-journeys/journey-04-ai-daily-workflow.md) - Session patterns
