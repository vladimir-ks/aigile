# AIGILE

> JIRA-compatible Agile project management CLI for AI-assisted development

AIGILE is a command-line tool that brings agile project management directly to your repository. Designed for AI-assisted development workflows, it tracks epics, stories, tasks, and bugs with a file-first architecture.

## Relationship to CCM

AIGILE is an **optional companion** to [Claude Context Manager](https://github.com/vladimir-ks/claude-context-manager):

| Tool | Purpose |
|------|---------|
| **CCM** | Manages Claude Code artifacts (skills, commands, agents) |
| **AIGILE** | Manages agile work items (epics, stories, tasks, bugs) |

Both tools work independently or together. Use CCM for AI context engineering, use AIGILE for project management.

## Features

- **File-First Architecture**: Documents with YAML frontmatter are the source of truth
- **Automatic Sync**: File watcher daemon keeps database in sync with your files
- **JIRA-Compatible**: Familiar concepts (Epics, Stories, Tasks, Bugs, Sprints)
- **AI-Optimized**: Designed for Claude Code and other AI assistants
- **Three Init Profiles**: `full-repo`, `subrepo`, `module` for different project structures
- **Frontmatter Metadata**: Status, version, modules, dependencies tracking

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
