# AIGILE - Agile Project Management CLI

## Quick Start

```bash
npm install -g @vladimir-ks/aigile
aigile init
aigile status
```

## Relationship to CCM

AIGILE is an **optional extension** to Claude Context Manager:
- **CCM**: Manages Claude Code artifacts (skills, commands, agents)
- **AIGILE**: Manages agile work items (epics, stories, tasks, bugs)

Both work independently or together.

---

## CI/CD

| Branch | npm Tag | Purpose |
|--------|---------|---------|
| dev | - | Development |
| staging | `alpha` | Alpha releases |
| main | `latest` | Production |

**Publishing:** Push to `main` triggers npm publish via GitHub Actions OIDC.

**Workflow:**
1. Develop on `dev`
2. Merge to `staging` → publishes `@alpha`
3. Merge to `main` → publishes `@latest`

---

## Git Rules

Use standard git workflow. No special commit commands required.

```bash
git add . && git commit -m "message" && git push origin dev
```

---

## Key Commands

| Command | Purpose |
|---------|---------|
| `aigile init` | Initialize in repository |
| `aigile epic/story/task/bug create "title"` | Create work items |
| `aigile sync scan` | Sync files to database |
| `aigile daemon start` | Start file watcher |
| `aigile status` | Project dashboard |
| `aigile query "search"` | Search all entities |
