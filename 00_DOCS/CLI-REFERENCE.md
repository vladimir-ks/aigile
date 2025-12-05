---
metadata:
  status: PRODUCTION
  version: 1.1
  tldr: "AIGILE CLI reference - 18 commands for hour-long sprints, parallel AI execution, module-first development"
  author: Vladimir K.S.
---

# AIGILE CLI Reference

> **AIGILE ≠ Agile.** Commands designed for hour-long sprints, parallel AI agent execution, and module-first development. See [AIGILE Methodology](./AIGILE-METHODOLOGY.md).

## Global Options

All commands support these global options:

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format for machine parsing |
| `--no-color` | Disable colored output |
| `-v, --version` | Display version number |
| `-h, --help` | Display help for command |

---

## Command Groups

| Group | Purpose | Primary Audience |
|-------|---------|------------------|
| **Project** | Project initialization and management | All |
| **Entities** | Create and manage work items | All |
| **Sprint** | Sprint planning and tracking | All |
| **AI** | AI agent optimized commands | AI Agents |
| **Context** | Context loading for AI | AI Agents |
| **Query** | Search and filter entities | All |
| **Session** | Work session tracking | AI Agents |
| **Sync** | File-to-entity synchronization | All |
| **Supporting** | Components, versions, personas | All |

---

## Project Commands

### `aigile init`

Initialize AIGILE in a git repository.

```
aigile init
```

Creates `.aigile/` directory with `project.yaml` configuration.

**Requirements:** Must be in a git repository.

---

### `aigile project`

Manage projects.

| Subcommand | Description |
|------------|-------------|
| `list` | List all projects |
| `show [key]` | Show project details |
| `set-default <key>` | Set default project |
| `remove <key>` | Remove project |

**Examples:**
```
aigile project list --json
aigile project show CCM
aigile project set-default CCM
```

---

## Entity Commands

### Common Entity Operations

All entity commands (initiative, epic, story, task, bug) support:

| Subcommand | Arguments | Description |
|------------|-----------|-------------|
| `create` | `<summary>` | Create new entity |
| `list` | - | List entities |
| `show` | `<key>` | Show entity details |
| `update` | `<key>` | Update entity |
| `delete` | `<key>` | Delete entity |
| `transition` | `<key> <status>` | Change status |

---

### `aigile initiative`

Manage strategic initiatives.

**Create:**
```
aigile initiative create "Title" [options]
  -d, --description <text>    Description
  -p, --priority <priority>   Priority (Highest/High/Medium/Low/Lowest)
  --owner <name>              Initiative owner
```

**List:**
```
aigile initiative list [options]
  -s, --status <status>       Filter by status
```

**Transition:**
```
aigile initiative transition <key> <status>
# Statuses: draft, active, done, archived
```

**JSON Example:**
```json
{
  "success": true,
  "data": {
    "key": "INIT-1",
    "summary": "Q1 Platform Enhancement",
    "status": "active",
    "priority": "High"
  }
}
```

---

### `aigile epic`

Manage epics (large features).

**Create:**
```
aigile epic create "Title" [options]
  -i, --initiative <key>      Parent initiative
  -d, --description <text>    Description
  -p, --priority <priority>   Priority
  --owner <name>              Epic owner
```

**List:**
```
aigile epic list [options]
  -s, --status <status>       Filter by status
  -i, --initiative <key>      Filter by initiative
```

**Transition:**
```
aigile epic transition <key> <status>
# Statuses: backlog, analysis, ready, in_progress, done, closed
```

---

### `aigile story`

Manage user stories.

**Create:**
```
aigile story create "Title" [options]
  -e, --epic <key>            Parent epic
  -d, --description <text>    Description
  -p, --priority <priority>   Priority
  --points <n>                Story points (1,2,3,5,8,13,21)
```

**List:**
```
aigile story list [options]
  -e, --epic <key>            Filter by epic
  -s, --status <status>       Filter by status
  --sprint <name>             Filter by sprint
```

**Update:**
```
aigile story update <key> [options]
  -s, --summary <text>        New summary
  -d, --description <text>    New description
  -p, --priority <priority>   New priority
  --points <n>                New story points
  --assignee <name>           Assignee
  -e, --epic <key>            Move to epic
```

**Transition:**
```
aigile story transition <key> <status>
# Statuses: backlog, selected, in_progress, in_review, done, closed
```

**JSON Example:**
```json
{
  "success": true,
  "data": [
    {
      "key": "CCM-42",
      "summary": "User authentication",
      "status": "in_progress",
      "story_points": 5,
      "epic_key": "CCM-10"
    }
  ],
  "count": 1
}
```

---

### `aigile task`

Manage tasks (implementation units).

**Create:**
```
aigile task create "Title" [options]
  -s, --story <key>           Parent story
  --parent <key>              Parent task (for subtasks)
  -d, --description <text>    Description
  -p, --priority <priority>   Priority
  --assignee <name>           Assignee
```

**List:**
```
aigile task list [options]
  -s, --story <key>           Filter by story
  --status <status>           Filter by status
  --sprint <name>             Filter by sprint
```

**Update:**
```
aigile task update <key> [options]
  -s, --summary <text>        New summary
  -d, --description <text>    New description
  --assignee <name>           New assignee
  --blocked-reason <text>     Reason for blocked status
```

**Transition:**
```
aigile task transition <key> <status>
# Statuses: todo, in_progress, in_review, blocked, done
```

---

### `aigile bug`

Manage bugs (defects).

**Create:**
```
aigile bug create "Title" [options]
  -d, --description <text>    Description
  -p, --priority <priority>   Priority
  --severity <level>          Severity (Blocker/Critical/Major/Minor/Trivial)
  --story <key>               Related story
  --epic <key>                Related epic
  --steps <text>              Steps to reproduce
  --expected <text>           Expected behavior
  --actual <text>             Actual behavior
```

**List:**
```
aigile bug list [options]
  -s, --status <status>       Filter by status
  --severity <level>          Filter by severity
```

**Update:**
```
aigile bug update <key> [options]
  --resolution <value>        Resolution (Fixed/Won't Fix/Duplicate/Cannot Reproduce/Done)
  --assignee <name>           Assignee
```

**Transition:**
```
aigile bug transition <key> <status>
# Statuses: open, in_progress, resolved, reopened, closed
```

---

## Sprint Commands

### `aigile sprint`

Manage sprints.

| Subcommand | Description |
|------------|-------------|
| `create <name>` | Create sprint |
| `list` | List sprints |
| `start <name>` | Start sprint |
| `close <name>` | Close sprint |
| `board [name]` | Show sprint board |
| `add-story <sprint> <key>` | Add story to sprint |

**Create (AIGILE: Hour-Long Sprints):**
```
aigile sprint create "Sprint 1: Foundation" --start now --end +1h [options]
  --start <date>              Start (YYYY-MM-DD, "now", or relative "+1h")
  --end <date>                End (YYYY-MM-DD or relative "+2h")
  -g, --goal <text>           Sprint goal
```

**AIGILE Sprint Types:**
| Type | Duration | Example |
|------|----------|---------|
| Foundation | 1-2 hours | `--start now --end +2h` |
| Module | 30min-1hr | `--start now --end +1h` |
| Integration | 30min-1hr | `--start +2h --end +3h` |
| Fix | 15-30min | `--start now --end +30m` |

**List:**
```
aigile sprint list [options]
  -s, --status <status>       Filter (future/active/closed)
```

**Board:**
```
aigile sprint board              # Active sprint
aigile sprint board "Sprint 1"   # Specific sprint
```

**JSON Board Output:**
```json
{
  "success": true,
  "sprint": "Sprint 1",
  "data": [
    {"key": "CCM-42", "summary": "...", "status": "in_progress", "story_points": 5},
    {"key": "CCM-43", "summary": "...", "status": "done", "story_points": 3}
  ]
}
```

---

## AI Commands

### `aigile ai`

AI agent optimized commands.

| Subcommand | Alias | Description |
|------------|-------|-------------|
| `begin` | - | Start AI session with context |
| `end` | - | End AI session |
| `briefing` | `b` | Get work briefing |
| `next` | `n` | Get next step recommendations |
| `item <type> <key>` | - | Get detailed work item |
| `resume` | - | Get resume context |
| `status` | `s` | Get compact status |

**Begin Session:**
```
aigile ai begin --json
```

Returns session ID, briefing, and recommended first action.

**End Session:**
```
aigile ai end -s "Completed KEY-42, started KEY-43"
```

**Briefing:**
```
aigile ai briefing --json
```

**JSON Briefing Output:**
```json
{
  "success": true,
  "data": {
    "project": {"key": "CCM", "name": "Project", "path": "/path"},
    "session": {"isActive": true, "duration": "1h 23m"},
    "overview": {
      "totalItems": 42,
      "inProgress": 3,
      "blocked": 1,
      "backlog": 15
    },
    "priorities": [
      {"type": "task", "key": "CCM-42", "summary": "...", "reason": "blocked"}
    ],
    "pendingComments": 2
  }
}
```

**Next Steps:**
```
aigile ai next --json
```

**JSON Next Output:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "action": "Continue",
        "target": "CCM-42",
        "reason": "In progress, no blockers",
        "command": "aigile task transition CCM-42 done"
      }
    ],
    "blockers": [],
    "unresolvedComments": []
  }
}
```

**Work Item:**
```
aigile ai item story CCM-42 --json
```

---

## Context Commands

### `aigile context`

Progressive context loading.

| Subcommand | Description |
|------------|-------------|
| `load` | Load context at specified level |
| `quick` | Quick summary (minimal context) |
| `entity <type> <key>` | Entity-specific context |
| `resume` | Resume context from last session |

**Load Context:**
```
aigile context load [options]
  -l, --level <level>         Level: minimal/summary/standard/full
```

**Context Levels:**

| Level | Content |
|-------|---------|
| `minimal` | Project + session only |
| `summary` | + Entity counts, recent activity |
| `standard` | + Active sprint, in-progress, blockers |
| `full` | + All entities, documents, comments |

**Quick Summary:**
```
aigile context quick --json
```

**JSON Quick Output:**
```json
{
  "success": true,
  "data": {
    "project": "CCM (Claude Context Manager)",
    "session": "Active 2h 15m",
    "entities": "2I/5E/15S/42T/3B",
    "docs": "12 files, 8 comments",
    "activity24h": "23 actions"
  }
}
```

---

## Query Commands

### `aigile query`

Search and filter entities.

| Subcommand | Description |
|------------|-------------|
| `search [text]` | Search with filters |
| `key <pattern>` | Search by key pattern |
| `assignee <name>` | Find by assignee |
| `recent` | Recently updated items |
| `status <status>` | Find by status |
| `related <type> <key>` | Find related items |
| `stats` | Project statistics |

**Search:**
```
aigile query search "authentication" [options]
  -t, --type <type>           Type: initiative/epic/story/task/bug/all
  -s, --status <status>       Status (comma-separated)
  -p, --priority <priority>   Priority (comma-separated)
  -a, --assignee <name>       Assignee
  -e, --epic <key>            Epic
  --sprint <name>             Sprint
  --since <date>              Updated since (YYYY-MM-DD)
  -n, --limit <n>             Result limit (default: 20)
```

**Recent:**
```
aigile query recent [options]
  -h, --hours <n>             Hours to look back (default: 24)
```

**Statistics:**
```
aigile query stats --json
```

**JSON Stats Output:**
```json
{
  "success": true,
  "data": {
    "total": 67,
    "byType": {
      "initiative": 2,
      "epic": 5,
      "story": 20,
      "task": 35,
      "bug": 5
    },
    "byStatus": {
      "backlog": 25,
      "in_progress": 8,
      "done": 30,
      "closed": 4
    }
  }
}
```

---

## Session Commands

### `aigile session`

Work session tracking.

| Subcommand | Description |
|------------|-------------|
| `start` | Start new session |
| `end` | End current session |
| `status` | Check session status |
| `list` | List recent sessions |
| `show <id>` | Show session details |
| `activity` | Show session activity |

**Start:**
```
aigile session start
```

**End:**
```
aigile session end [options]
  -s, --summary <text>        Session summary
```

**Activity:**
```
aigile session activity --json
```

---

## Sync Commands

### `aigile sync`

File-to-entity synchronization.

| Subcommand | Description |
|------------|-------------|
| `scan` | Scan files for changes |
| `status` | Show sync status |
| `list` | List tracked documents |
| `comments` | List pending comments |

**Scan:**
```
aigile sync scan [options]
  --path <path>               Path to scan
```

**Comments:**
```
aigile sync comments [options]
  --resolved                  Include resolved
  --type <type>               Filter by type (user/ai)
```

**Comment Markers:**
- User comments: `[[! comment text ]]`
- AI comments: `[{! suggestion text }]`

---

## Supporting Entity Commands

### `aigile component`

Manage code components.

| Subcommand | Description |
|------------|-------------|
| `create <name>` | Create component |
| `list` | List components |
| `show <name>` | Show component |
| `update <name>` | Update component |
| `delete <name>` | Delete component |

**Create:**
```
aigile component create "auth" [options]
  -d, --description <text>    Description
  --lead <name>               Component lead
  --default-assignee <name>   Default assignee
```

---

### `aigile version`

Manage versions/releases.

| Subcommand | Description |
|------------|-------------|
| `create <name>` | Create version |
| `list` | List versions |
| `show <name>` | Show version |
| `update <name>` | Update version |
| `delete <name>` | Delete version |
| `transition <name> <status>` | Change status |

**Create:**
```
aigile version create "v1.0.0" [options]
  -d, --description <text>    Description/release notes
  --release <date>            Release date (YYYY-MM-DD)
```

**Transition:**
```
aigile version transition v1.0.0 released
# Statuses: unreleased, released, archived
```

---

### `aigile persona`

Manage user personas.

| Subcommand | Description |
|------------|-------------|
| `create <name>` | Create persona |
| `list` | List personas |
| `show <slug>` | Show persona |
| `update <slug>` | Update persona |
| `delete <slug>` | Delete persona |

**Create:**
```
aigile persona create "Developer Dan" [options]
  -d, --description <text>    Description
  --goals <json>              Goals array as JSON
  --pain-points <json>        Pain points as JSON
  --behaviors <json>          Behaviors as JSON
```

---

### `aigile ux-journey`

Manage UX journeys.

| Subcommand | Description |
|------------|-------------|
| `create <name>` | Create journey |
| `list` | List journeys |
| `show <slug>` | Show journey |
| `update <slug>` | Update journey |
| `delete <slug>` | Delete journey |

**Create:**
```
aigile ux-journey create "Onboarding Flow" [options]
  -d, --description <text>    Description
  --personas <slugs>          Persona slugs (comma-separated)
  --steps <json>              Journey steps as JSON
```

---

## Status Command

### `aigile status`

Dashboard view of project status.

```
aigile status --json
```

Shows overview of:
- Active sprint progress
- Entity counts by status
- Recent activity
- Blockers

---

## Error Responses

All commands return consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

**Common Error Codes:**

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Entity not found |
| `INVALID_TRANSITION` | Status transition not allowed |
| `NO_PROJECT` | Not in AIGILE project |
| `NO_SESSION` | No active session |
| `VALIDATION_ERROR` | Invalid input |

---

## Cross-References

- [AIGILE Methodology](./AIGILE-METHODOLOGY.md) - **Understanding AIGILE vs Classical Agile**
- [AI Agent Guide](./AI-AGENT-GUIDE.md) - Optimized AI workflows
- [Quick Start](./QUICK-START.md) - Getting started
- [Workflow States](./05_architecture/workflow-states.md) - Valid transitions
