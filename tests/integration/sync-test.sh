#!/bin/bash
#
# AIGILE Sync Integration Tests
#
# Tests file synchronization and comment parsing functionality.
# Creates a temporary test environment with sample files.
#
# Usage: ./sync-test.sh
#
# Author: Vladimir K.S.

set -e  # Exit on first error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for tests
TESTS_PASSED=0
TESTS_FAILED=0

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIGILE_BIN="$SCRIPT_DIR/../../dist/bin/aigile.js"

# Test helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

section() {
    echo ""
    echo -e "${YELLOW}=== $1 ===${NC}"
}

# Verify aigile binary exists
if [ ! -f "$AIGILE_BIN" ]; then
    echo -e "${RED}Error: aigile binary not found at $AIGILE_BIN${NC}"
    echo "Run 'pnpm build' first."
    exit 1
fi

# Create temporary test directory
TEST_DIR=$(mktemp -d)
ORIGINAL_DIR=$(pwd)
export AIGILE_HOME="$TEST_DIR/.aigile-home"

cleanup() {
    cd "$ORIGINAL_DIR"
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

echo "Test directory: $TEST_DIR"
echo "AIGILE_HOME: $AIGILE_HOME"

# Setup: Create git repo and initialize
section "Setup"
cd "$TEST_DIR"
git init --quiet
echo "# Test Project" > README.md
git add README.md
git commit -m "Initial commit" --quiet

# Initialize AIGILE
OUTPUT=$(node "$AIGILE_BIN" init 2>&1)
if echo "$OUTPUT" | grep -q "AIGILE initialized"; then
    pass "aigile init succeeded"
else
    fail "aigile init failed: $OUTPUT"
    exit 1
fi

# Create test files
section "Creating Test Files"

# Create markdown file with comments
mkdir -p docs
cat > docs/requirements.md << 'EOF'
# Requirements Document

## Overview

This document describes the system requirements.

[[! This section needs more detail about user personas ]]

## Features

### Feature 1

The system should support user authentication.

[{! Consider adding OAuth support here }]

### Feature 2

[[! What about rate limiting? ]]

The system should handle concurrent users.

EOF
pass "Created docs/requirements.md with comments"

# Create feature file
mkdir -p features
cat > features/login.feature << 'EOF'
Feature: User Login

  [[! Need to add scenarios for failed login ]]

  Scenario: Successful login
    Given a registered user
    When they enter valid credentials
    Then they should be logged in

  [{! Consider adding 2FA scenario }]
EOF
pass "Created features/login.feature with comments"

# Create YAML config
cat > config.yaml << 'EOF'
# Project configuration
project:
  name: Test Project
  version: 1.0.0

[[! Should we add environment configs here? ]]

settings:
  debug: false
  timeout: 30
EOF
pass "Created config.yaml with comments"

# Create regular markdown without comments
cat > notes.md << 'EOF'
# Notes

Just some regular notes without any markers.

- Item 1
- Item 2
- Item 3
EOF
pass "Created notes.md (no comments)"

# Test: Initial scan (no comments flag)
section "Sync Scan Tests"

OUTPUT=$(node "$AIGILE_BIN" sync scan --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "sync scan --json returns valid JSON"
else
    fail "sync scan --json failed"
fi

if echo "$OUTPUT" | grep -q '"total":'; then
    TOTAL=$(echo "$OUTPUT" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
    if [ "$TOTAL" -ge 4 ]; then
        pass "sync scan found $TOTAL files"
    else
        fail "sync scan found only $TOTAL files (expected >= 4)"
    fi
else
    fail "sync scan missing total count"
fi

# Test: Sync scan with comments
OUTPUT=$(node "$AIGILE_BIN" sync scan --comments --json 2>&1)
if echo "$OUTPUT" | grep -q '"comments"'; then
    pass "sync scan --comments includes comment stats"
else
    fail "sync scan --comments missing comment stats"
fi

# Test: Sync status
section "Sync Status Tests"

OUTPUT=$(node "$AIGILE_BIN" sync status --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "sync status --json returns valid JSON"
else
    fail "sync status --json failed"
fi

if echo "$OUTPUT" | grep -q '"files"'; then
    pass "sync status includes files stats"
else
    fail "sync status missing files stats"
fi

if echo "$OUTPUT" | grep -q '"comments"'; then
    pass "sync status includes comments stats"
else
    fail "sync status missing comments stats"
fi

# Test: Sync list
section "Sync List Tests"

OUTPUT=$(node "$AIGILE_BIN" sync list --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "sync list --json returns valid JSON"
else
    fail "sync list --json failed"
fi

if echo "$OUTPUT" | grep -q "requirements.md"; then
    pass "sync list shows requirements.md"
else
    fail "sync list missing requirements.md"
fi

# Test: Filter by extension
OUTPUT=$(node "$AIGILE_BIN" sync list --extension md --json 2>&1)
if echo "$OUTPUT" | grep -q "requirements.md" && echo "$OUTPUT" | grep -q "notes.md"; then
    pass "sync list --extension md filters correctly"
else
    fail "sync list --extension filter failed"
fi

# Test: Sync comments
section "Comment Parsing Tests"

OUTPUT=$(node "$AIGILE_BIN" sync comments --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "sync comments --json returns valid JSON"
else
    fail "sync comments --json failed"
fi

# Check for user comments
OUTPUT=$(node "$AIGILE_BIN" sync comments --type user --json 2>&1)
if echo "$OUTPUT" | grep -q "This section needs more detail" || echo "$OUTPUT" | grep -q "need"; then
    pass "sync comments --type user finds user comments"
else
    fail "sync comments --type user missing expected comments"
fi

# Check for AI comments
OUTPUT=$(node "$AIGILE_BIN" sync comments --type ai --json 2>&1)
if echo "$OUTPUT" | grep -q "Consider" || echo "$OUTPUT" | grep -q "OAuth"; then
    pass "sync comments --type ai finds AI comments"
else
    fail "sync comments --type ai missing expected comments"
fi

# Test: File modification detection
section "Change Detection Tests"

# Modify a file
echo -e "\n\n## New Section\n\nAdded content." >> docs/requirements.md

# Rescan
OUTPUT=$(node "$AIGILE_BIN" sync scan --json 2>&1)
if echo "$OUTPUT" | grep -q '"modified":1'; then
    pass "sync scan detects modified file"
else
    fail "sync scan failed to detect modification"
fi

# Test: File deletion detection
rm notes.md

OUTPUT=$(node "$AIGILE_BIN" sync scan --json 2>&1)
if echo "$OUTPUT" | grep -q '"deleted":1'; then
    pass "sync scan detects deleted file"
else
    fail "sync scan failed to detect deletion"
fi

# Test: Custom patterns
section "Custom Pattern Tests"

# Create a JS file (not in default patterns)
echo "console.log('test');" > test.js

OUTPUT=$(node "$AIGILE_BIN" sync scan --patterns "**/*.js" --json 2>&1)
if echo "$OUTPUT" | grep -q '"new":1'; then
    pass "sync scan with custom patterns finds .js files"
else
    fail "sync scan custom patterns failed"
fi

# Test: Status after all operations
section "Final Status Check"

OUTPUT=$(node "$AIGILE_BIN" sync status --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "final sync status returns valid JSON"
else
    fail "final sync status failed"
fi

# Summary
section "Test Summary"
echo ""
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
