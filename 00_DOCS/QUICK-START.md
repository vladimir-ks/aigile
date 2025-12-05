---
metadata:
  status: PRODUCTION
  version: 1.1
  tldr: "5-minute AIGILE setup - vision capture upfront, hour-long sprints, AI agent execution"
  author: Vladimir K.S.
---

# AIGILE Quick Start

> **AIGILE ≠ Agile.** This is a hybrid methodology: waterfall planning + agile execution, optimized for AI agents. Sprints are hours, not weeks.

Get up and running with AIGILE in 5 minutes.

**Read First:** [AIGILE Methodology](./AIGILE-METHODOLOGY.md) - understand the key differences from classical Agile.

## Prerequisites

- Node.js 18+
- Git repository

---

## 1. Install AIGILE

```
npm install -g @vladimir-ks/aigile
```

Verify installation:
```
aigile --version
```

---

## 2. Initialize Project

Navigate to your git repository:

```
cd my-project
aigile init
```

This creates:
- `.aigile/` directory
- `project.yaml` configuration
- Database for tracking entities

---

## 3. Create Your First Epic

```
aigile epic create "User Authentication"
```

Output: `Created epic CCM-1: User Authentication`

---

## 4. Add Stories to Epic (Vision Capture)

**AIGILE Principle:** Define ALL work upfront before sprints begin.

```
aigile story create "User login" -e CCM-1
aigile story create "User logout" -e CCM-1
aigile story create "Password reset" -e CCM-1
```

**Note:** Story points are optional in AIGILE - AI agents execute without estimation.

---

## 5. Create a Sprint (Hour-Long)

**AIGILE Sprints:** 30 minutes to 2 hours, not weeks.

```
aigile sprint create "Sprint 1: Foundation" --start now --end +1h -g "Core infrastructure"
```

**Sprint Types:**
- Foundation Sprint (1-2h): Core infrastructure
- Module Sprint (30min-1h): Individual component
- Integration Sprint (30min-1h): E2E verification
- Fix Sprint (15-30min): Bug resolution

---

## 6. Add Stories to Sprint

```
aigile sprint add-story "Sprint 1" CCM-2
aigile sprint add-story "Sprint 1" CCM-3
```

---

## 7. Start the Sprint

```
aigile sprint start "Sprint 1"
```

---

## 8. View Sprint Board

```
aigile sprint board
```

Output:
```
Sprint: Sprint 1: Foundation (active)

  BACKLOG (0):

  SELECTED (2):
    - CCM-2: User login
    - CCM-3: User logout

  IN_PROGRESS (0):

  IN_REVIEW (0):

  DONE (0):
```

---

## 9. Work on a Story

Select and start working:
```
aigile story transition CCM-2 selected
aigile story transition CCM-2 in_progress
```

Complete work:
```
aigile story transition CCM-2 in_review
aigile story transition CCM-2 done
```

---

## 10. Check Project Status

```
aigile status
```

---

## For AI Agents

If you're an AI agent, use the optimized workflow:

```
aigile ai begin              # Start session
aigile ai briefing --json    # Get work context
# ... work on tasks ...
aigile ai end -s "Summary"   # End session
```

See [AI Agent Guide](./AI-AGENT-GUIDE.md) for details.

---

## Next Steps

| Task | Command |
|------|---------|
| Create tasks for story | `aigile task create "Title" -s CCM-2` |
| Track bugs | `aigile bug create "Bug title" --severity Major` |
| Search entities | `aigile query search "keyword"` |
| Close sprint | `aigile sprint close "Sprint 1"` |

---

## Quick Reference

### Entity Hierarchy

```
Initiative (strategic goal)
  └── Epic (large feature)
        └── Story (user feature)
              ├── Task (implementation)
              └── Bug (defect)
```

### Common Commands

| Action | Command |
|--------|---------|
| Create story | `aigile story create "Title"` |
| List stories | `aigile story list` |
| View story | `aigile story show KEY` |
| Change status | `aigile story transition KEY status` |
| Sprint board | `aigile sprint board` |
| Project status | `aigile status` |
| Search | `aigile query search "text"` |

### JSON Output

Add `--json` to any command:
```
aigile story list --json
aigile sprint board --json
aigile ai briefing --json
```

---

## Cross-References

- [AIGILE Methodology](./AIGILE-METHODOLOGY.md) - **Start here: AIGILE vs Classical Agile**
- [CLI Reference](./CLI-REFERENCE.md) - Complete command documentation
- [AI Agent Guide](./AI-AGENT-GUIDE.md) - AI-optimized workflows
- [UX Journeys](./04_ux-journeys/) - Detailed workflow guides
