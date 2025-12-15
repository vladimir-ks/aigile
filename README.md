# AIGILE

> AI-first agile system for autonomous product development and project management

AIGILE provides structured context management for AI agents, enabling them to execute any project task correctly. Whether you're building software, running a business, conducting research, or managing personal projects—AIGILE gives AI agents the full understanding they need through agile artifacts (initiatives, epics, stories, tasks).

## Why AIGILE?

**The problem**: AI agents struggle without structured context. They need to understand *what* needs to be done, *why*, *how*, and the *priorities*.

**The solution**: Agile artifacts aren't just for tracking work—they provide optimal structured context for AI agents to understand projects completely. One human plus AI agents equals a full team.

## Use Cases

| Domain | Examples |
|--------|----------|
| **Software Development** | Build apps, APIs, libraries with AI agents writing code |
| **Product Management** | Define roadmaps, track features, manage releases |
| **Content & Marketing** | Plan campaigns, track content creation, manage launches |
| **Research Projects** | Structure investigations, track findings, manage deliverables |
| **Personal Projects** | Organize goals, track progress, manage any endeavor |
| **Business Operations** | SOPs, process documentation, operational tracking |

## Features

- **AI-First Design**: Built for AI agents, not human typing convenience
- **Session Tracking**: Verified work sessions with file coverage tracking
- **File-First Architecture**: Documents with YAML frontmatter are the source of truth
- **Automatic Sync**: File watcher daemon keeps database in sync with your files
- **Agile Entities**: Initiatives, Epics, Stories, Tasks, Bugs, Sprints
- **Three Init Profiles**: `full-repo`, `subrepo`, `module` for different project structures

## Relationship to CCM

AIGILE is an **optional companion** to [Claude Context Manager](https://github.com/vladimir-ks/claude-context-manager):

| Tool | Purpose |
|------|---------|
| **CCM** | Manages Claude Code artifacts (skills, commands, agents) |
| **AIGILE** | Manages agile work items and project context |

Both tools work independently or together.

## Installation

```bash
npm install -g @vladimir-ks/aigile
```

## Quick Start

```bash
# Initialize in your git repository
aigile init

# Scan and index your files
aigile sync scan

# Start the file watcher daemon
aigile daemon install
aigile daemon start

# View project status
aigile status
```

## Commands

### Project Management
- `aigile init` - Initialize AIGILE in a repository
- `aigile project list` - List registered projects
- `aigile status` - Show project status

### Work Items
- `aigile epic create "Epic title"` - Create an epic
- `aigile story create "Story title"` - Create a user story
- `aigile task create "Task title"` - Create a task
- `aigile bug create "Bug title"` - Create a bug report

### File Sync
- `aigile sync scan` - Scan and sync files to database
- `aigile sync status` - Show sync status
- `aigile sync list` - List tracked documents

### Document Management
- `aigile doc list` - List documents with metadata
- `aigile doc show <path>` - Show document details
- `aigile doc update <path>` - Update frontmatter metadata
- `aigile doc stats` - Show frontmatter statistics

### Daemon
- `aigile daemon install` - Install auto-start service
- `aigile daemon start` - Start file watcher
- `aigile daemon stop` - Stop file watcher
- `aigile daemon status` - Show daemon status

## Init Profiles

### full-repo
For primary product repositories at the git root:
```bash
aigile init --profile full-repo
```

### subrepo
For git submodules treated as separate products:
```bash
aigile init --profile subrepo
```

### module
For directories within an existing AIGILE repository:
```bash
aigile init --profile module --name my-module
```

## Frontmatter Schema

AIGILE tracks documents with YAML frontmatter:

```yaml
---
metadata:
  status: DRAFT          # DRAFT, IN-REVIEW, APPROVED, TEMPLATE
  version: "1.0"
  tldr: "Brief summary"
  modules: [auth, api]
  dependencies: [./other-doc.md]
  code_refs: [src/auth/]
  authors: ["Author Name"]
---
```

## Requirements

- Node.js >= 18.0.0
- Git repository

## License

MIT

## Author

Vladimir K.S. - [@vladimir-ks](https://github.com/vladimir-ks)
