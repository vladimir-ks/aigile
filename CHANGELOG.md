# Changelog

All notable changes to AIGILE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2025-12-14

### Changed

- **Version Management**
  - Version now sourced exclusively from package.json
  - Build-time injection via tsup eliminates duplicate version definitions
  - Single source of truth for version number

[0.2.2]: https://github.com/vladimir-ks/aigile/releases/tag/v0.2.2

## [0.2.1] - 2025-12-14

### Fixed

- **Daemon File Detection**
  - Fixed database connection being closed for daemon async events
  - New files are now correctly detected and persisted to database
  - File changes properly trigger database updates
  - Added proper error propagation for database write failures

- **Date Validation**
  - Added standardized date validation for all date fields
  - Dates are now standardized to ISO 8601 format (YYYY-MM-DD)
  - Multiple input formats supported (MM/DD/YYYY, DD.MM.YYYY, YYYY/MM/DD)
  - Validates date ranges (end date must be after start date)
  - Clear error messages for invalid dates

### Changed

- Sprint, initiative, and version commands now validate date inputs
- Improved error handling in file watcher with detailed logging
- Test suite now at 110 passing tests

[0.2.1]: https://github.com/vladimir-ks/aigile/releases/tag/v0.2.1

## [0.2.0] - 2025-12-14

### Added

- **Multi-Project Daemon**
  - Single daemon monitors ALL registered AIGILE projects
  - Per-project file watchers with isolated failure handling
  - `aigile daemon status` shows all watched projects
  - `aigile daemon resync` resyncs all projects at once

- **Daemon Reliability**
  - Global exception handlers prevent silent crashes
  - Crash reports saved to `~/.aigile/crashes/`
  - Automatic crash report cleanup (keeps last 10)
  - Database save operations guarded against I/O errors
  - Log rotation (10MB max, keeps 5 rotated files)

- **Watcher Recovery**
  - Automatic retry on watcher failures (3 attempts)
  - Exponential backoff (5s, 10s, 20s delays)
  - Per-watcher isolation (one failure doesn't affect others)

- **Platform Improvements**
  - macOS: LaunchAgent with restart throttling (10s)
  - macOS: `KeepAlive.SuccessfulExit=false` for smart restarts
  - Linux: systemd with `Restart=on-failure`, `StartLimitBurst=5`
  - Shutdown timeout (10s) prevents hanging

### Changed

- Daemon now watches all projects by default (not just current directory)
- Improved daemon status output with per-project details

### Fixed

- Database I/O errors no longer crash the daemon
- Watcher failures no longer require manual restart

[0.2.0]: https://github.com/vladimir-ks/aigile/releases/tag/v0.2.0

## [0.1.0] - 2025-12-05

### Added

- **Core CLI Framework**
  - Commander.js-based command structure
  - Global `--json` and `--no-color` output options
  - Project initialization with `aigile init`

- **Entity Management**
  - Initiatives, Epics, Stories, Tasks, Subtasks, Bugs
  - Sprints with start/close lifecycle
  - Versions with release tracking
  - Components for module organization
  - Personas and UX Journeys

- **Workflow Engine**
  - State machine with valid transitions per entity type
  - Transition validation and enforcement
  - Activity logging for all state changes

- **File Sync System**
  - Markdown file scanning with YAML frontmatter parsing
  - Document-entity linking
  - Comment marker parsing (`[[!` user, `[{!` AI)
  - Metadata extraction (status, version, modules, dependencies)

- **File Watcher Service**
  - Real-time file monitoring with chokidar
  - Automatic database sync on file changes
  - Debounced updates (300ms)
  - `.gitignore` pattern respect

- **Daemon Management**
  - `aigile daemon install/start/stop/status/run/logs`
  - macOS LaunchAgent support
  - Linux systemd user service support
  - Multi-platform daemon configuration

- **Init Profiles**
  - `full-repo`: Complete directory structure for primary repositories
  - `subrepo`: Full structure for git submodules
  - `module`: Minimal flat structure for subdirectories

- **Context System**
  - Four-level context loading (minimal, summary, standard, full)
  - Session-based AI workflow support
  - Quick context summaries

- **Database**
  - SQLite via sql.js (no native compilation)
  - Automatic migrations
  - Central registry at `~/.aigile/`

### Technical Details

- Node.js >= 18.0.0 required
- ESM and CommonJS dual builds
- TypeScript with full type definitions
- 71 tests passing

[0.1.0]: https://github.com/vladimir-ks/aigile/releases/tag/v0.1.0
