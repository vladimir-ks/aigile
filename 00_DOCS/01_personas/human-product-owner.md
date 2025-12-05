---
metadata:
  status: PRODUCTION
  version: 1.0
  tldr: "Human Product Owner persona - vision definer in AIGILE methodology"
  author: Vladimir K.S.
---

# Persona: Human Product Owner

> **Role:** Vision definer and decision maker. Captures complete requirements upfront (waterfall phase), then delegates execution to AI agents.

## Identity

| Attribute | Value |
|-----------|-------|
| **Name** | Product Owner |
| **Role** | Vision Definer |
| **Technical Level** | Non-technical to moderate |
| **Team** | Directs AI agents |

---

## Goals

1. **Capture complete vision** - Define ALL work before sprints begin (waterfall phase)
2. **Define specifications** - Create clear SDD/BDD artifacts
3. **Map dependencies** - Establish module build order
4. **Verify results** - Review completed modules
5. **Make decisions** - Resolve blockers and ambiguities

---

## Behaviors

### Vision Capture (Waterfall Phase)
- Create all initiatives, epics, and stories upfront
- Define acceptance criteria before execution
- Map module dependencies
- Establish SDD/BDD/TDD artifacts

### Sprint Planning
- Create hour-long sprints (not weeks)
- Assign independent modules for parallel execution
- Establish build order: foundation → services → integration

### Execution Oversight
- Review AI agent summaries
- Verify completed modules
- Close bugs and accept work

### Decision Making
- Resolve blocked items
- Clarify ambiguous requirements
- Approve releases

---

## AIGILE Commands

| Command | Purpose |
|---------|---------|
| `aigile init` | Initialize project |
| `aigile epic create` | Define epics |
| `aigile story create` | Define stories |
| `aigile sprint create --start now --end +1h` | Create hour-long sprint |
| `aigile sprint board` | Review progress |
| `aigile bug transition KEY closed` | Accept bug fixes |
| `aigile version transition v1.0 released` | Release version |

---

## Pain Points

1. **Vision clarity** - Must define complete scope upfront
2. **Dependency mapping** - Need to understand module relationships
3. **Parallel coordination** - Managing multiple AI agents
4. **Technical translation** - Converting business needs to specifications

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Vision completeness | 100% before sprints |
| Blocker resolution | < 1 hour |
| Module acceptance | Same session |
| Release frequency | Multiple per day possible |

---

## Key Differences from Classical Agile

| Aspect | Classical Agile | AIGILE |
|--------|-----------------|--------|
| **Planning** | Iterative discovery | Complete vision upfront |
| **Sprints** | 2 weeks | 30min - 2 hours |
| **Estimation** | Story points critical | Optional (AI executes) |
| **Team** | Human developers | AI agents |
| **Build order** | Feature by feature | Module by module |

---

## Anti-Patterns

- ❌ Incomplete vision before sprints
- ❌ Week-long sprints
- ❌ Feature-first instead of module-first
- ❌ Waiting for "next sprint" to address issues
- ❌ Manual code writing (delegate to AI)

---

## Cross-References

- [AIGILE Methodology](../AIGILE-METHODOLOGY.md) - Understanding AIGILE vs Agile
- [Journey 02: Project Setup](../04_ux-journeys/journey-02-project-setup.md) - Vision capture
- [Journey 03: Sprint Planning](../04_ux-journeys/journey-03-sprint-planning.md) - Hour-long sprints
- [Journey 05: Bug Triage](../04_ux-journeys/journey-05-bug-triage.md) - Fix sprints
