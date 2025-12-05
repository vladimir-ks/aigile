# AIGILE npm Publishing Migration Guide

This guide documents the steps to migrate AIGILE from the CCM monorepo to a standalone repository and publish to npm.

## Pre-Migration Status ✅

All preparation complete:

| Item | Status |
|------|--------|
| Tests (71) | ✅ Passing |
| Build | ✅ ESM + CJS + Types |
| TypeScript | ✅ No errors |
| LICENSE | ✅ Created |
| CHANGELOG.md | ✅ Created |
| CI workflow | ✅ Created |
| npm-publish workflow | ✅ Created |
| package.json | ✅ Updated for new repo |

---

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Create repository:
   - Name: `aigile`
   - Description: "JIRA-compatible Agile project management CLI for AI-assisted development"
   - Public
   - No README/LICENSE (we have our own)
   - No .gitignore (we have our own)

---

## Step 2: Initialize and Push

```bash
# Navigate to aigile package
cd /Users/vmks/_dev_tools/claude-skills-builder-vladks/packages/aigile

# Initialize git (fresh repo, not connected to CCM)
git init

# Create branches
git checkout -b main
git checkout -b dev
git checkout -b staging
git checkout main

# Add all files
git add .

# Initial commit
git commit -m "Initial commit: AIGILE v0.1.0

- Complete CLI framework with Commander.js
- Entity management (Initiatives, Epics, Stories, Tasks, Bugs)
- Workflow engine with state transitions
- File sync with YAML frontmatter parsing
- Real-time file watcher with chokidar
- Daemon management (macOS/Linux)
- Init profiles (full-repo, subrepo, module)
- SQLite database via sql.js
- 71 tests passing"

# Add remote
git remote add origin https://github.com/vladimir-ks/aigile.git

# Push all branches
git push -u origin main
git push -u origin dev
git push -u origin staging
```

---

## Step 3: Configure npm Trusted Publisher

1. Go to https://www.npmjs.com/settings/vladimir-ks/packages
2. Click "Create a New Package" or wait until first publish attempt
3. Go to https://www.npmjs.com/package/@vladimir-ks/aigile/access
4. Click "Add Publishing Access" → "Trusted Publishers"
5. Configure:
   - Provider: **GitHub Actions**
   - Owner: **vladimir-ks**
   - Repository: **aigile**
   - Workflow: **npm-publish.yml**
   - Environment: (leave empty)

---

## Step 4: First Release

```bash
# Ensure on main branch
git checkout main

# Tag the release
git tag v0.1.0

# Push tag (triggers npm-publish workflow)
git push origin v0.1.0
```

---

## Step 5: Verify

1. Check GitHub Actions: https://github.com/vladimir-ks/aigile/actions
2. Check npm package: https://www.npmjs.com/package/@vladimir-ks/aigile
3. Test installation:
   ```bash
   npm install -g @vladimir-ks/aigile
   aigile --version
   aigile --help
   ```

---

## Step 6: Add as Submodule to CCM (Optional)

If you want to keep aigile as a submodule in the CCM repo:

```bash
# In CCM repo root
cd /Users/vmks/_dev_tools/claude-skills-builder-vladks

# Remove the package directory (it's now a separate repo)
rm -rf packages/aigile

# Add as submodule
git submodule add https://github.com/vladimir-ks/aigile.git packages/aigile

# Update pnpm-workspace.yaml if needed
# Commit the change
git add .
git commit -m "Convert aigile to git submodule"
git push
```

---

## Branching Strategy

| Branch | Purpose | npm Tag |
|--------|---------|---------|
| `dev` | Development, easy push | - |
| `staging` | Alpha releases | `alpha` |
| `main` | Production releases | `latest` |

### Workflow

1. Develop on `dev` branch
2. Merge to `staging` for alpha testing
3. Merge to `main` for production release
4. Tag with `v*` (e.g., `v0.1.0`) to publish

---

## Files Created

| File | Purpose |
|------|---------|
| `LICENSE` | MIT license |
| `CHANGELOG.md` | Version history |
| `.github/workflows/ci.yml` | Test on push/PR |
| `.github/workflows/npm-publish.yml` | Publish to npm |
| `types/sql.js.d.ts` | TypeScript declarations |
| `MIGRATION.md` | This file |

---

## Package Contents (npm pack --dry-run)

```
📦 @vladimir-ks/aigile@0.1.0
├── LICENSE (1.1 kB)
├── README.md (2.9 kB)
├── dist/bin/aigile.js (266.7 kB)
├── dist/bin/aigile.js.map (526.9 kB)
├── dist/index.cjs (2.0 kB)
├── dist/index.cjs.map (3.2 kB)
├── dist/index.d.cts (1.8 kB)
├── dist/index.d.ts (1.8 kB)
├── dist/index.js (931 B)
├── dist/index.js.map (3.2 kB)
├── package.json (1.6 kB)
└── types/sql.js.d.ts (917 B)

Total: 136.6 kB (compressed)
```

---

## Notes

- **OIDC Trusted Publishing**: No npm token needed, GitHub Actions authenticates automatically
- **Node.js 18+**: Required for ESM support and sql.js
- **sql.js**: Pure JavaScript SQLite, no native compilation needed
