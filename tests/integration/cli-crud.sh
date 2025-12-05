#!/bin/bash
#
# AIGILE CLI Integration Tests
#
# Tests all CRUD operations for the AIGILE CLI.
# Creates a temporary test environment, runs tests, and cleans up.
#
# Usage: ./cli-crud.sh
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

# Test: aigile init
section "Init Command"
OUTPUT=$(node "$AIGILE_BIN" init 2>&1)
if echo "$OUTPUT" | grep -q "AIGILE initialized"; then
    pass "aigile init succeeded"
else
    fail "aigile init failed: $OUTPUT"
fi

# Test: project list
section "Project Commands"
OUTPUT=$(node "$AIGILE_BIN" project list --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "project list --json returns valid JSON"
else
    fail "project list --json failed"
fi

# Test: Initiative CRUD
section "Initiative CRUD"

# Create
OUTPUT=$(node "$AIGILE_BIN" initiative create "Test Initiative" -d "Description" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    INIT_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "initiative create: $INIT_KEY"
else
    fail "initiative create failed"
    INIT_KEY=""
fi

# List
OUTPUT=$(node "$AIGILE_BIN" initiative list --json 2>&1)
if echo "$OUTPUT" | grep -q "Test Initiative"; then
    pass "initiative list shows created initiative"
else
    fail "initiative list failed"
fi

# Show
if [ -n "$INIT_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" initiative show "$INIT_KEY" --json 2>&1)
    if echo "$OUTPUT" | grep -q "Test Initiative"; then
        pass "initiative show displays details"
    else
        fail "initiative show failed"
    fi
fi

# Update
if [ -n "$INIT_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" initiative update "$INIT_KEY" --summary "Updated Initiative" 2>&1)
    if echo "$OUTPUT" | grep -q "updated"; then
        pass "initiative update succeeded"
    else
        fail "initiative update failed"
    fi
fi

# Transition
if [ -n "$INIT_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" initiative transition "$INIT_KEY" active 2>&1)
    if echo "$OUTPUT" | grep -q "transitioned"; then
        pass "initiative transition succeeded"
    else
        fail "initiative transition failed"
    fi
fi

# Test: Epic CRUD
section "Epic CRUD"

# Create
OUTPUT=$(node "$AIGILE_BIN" epic create "Test Epic" -d "Epic description" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    EPIC_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "epic create: $EPIC_KEY"
else
    fail "epic create failed"
    EPIC_KEY=""
fi

# List
OUTPUT=$(node "$AIGILE_BIN" epic list --json 2>&1)
if echo "$OUTPUT" | grep -q "Test Epic"; then
    pass "epic list shows created epic"
else
    fail "epic list failed"
fi

# Update
if [ -n "$EPIC_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" epic update "$EPIC_KEY" --summary "Updated Epic" 2>&1)
    if echo "$OUTPUT" | grep -q "updated"; then
        pass "epic update succeeded"
    else
        fail "epic update failed"
    fi
fi

# Transition
if [ -n "$EPIC_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" epic transition "$EPIC_KEY" in_progress 2>&1)
    if echo "$OUTPUT" | grep -q "transitioned"; then
        pass "epic transition succeeded"
    else
        fail "epic transition failed"
    fi
fi

# Test: Story CRUD
section "Story CRUD"

# Create with epic link
OUTPUT=$(node "$AIGILE_BIN" story create "Test Story" -e "$EPIC_KEY" --points 5 --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    STORY_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "story create: $STORY_KEY"
else
    fail "story create failed"
    STORY_KEY=""
fi

# List
OUTPUT=$(node "$AIGILE_BIN" story list --json 2>&1)
if echo "$OUTPUT" | grep -q "Test Story"; then
    pass "story list shows created story"
else
    fail "story list failed"
fi

# Update
if [ -n "$STORY_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" story update "$STORY_KEY" --summary "Updated Story" --points 8 2>&1)
    if echo "$OUTPUT" | grep -q "updated"; then
        pass "story update succeeded"
    else
        fail "story update failed"
    fi
fi

# Transition
if [ -n "$STORY_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" story transition "$STORY_KEY" in_progress 2>&1)
    if echo "$OUTPUT" | grep -q "transitioned"; then
        pass "story transition succeeded"
    else
        fail "story transition failed"
    fi
fi

# Test: Task CRUD
section "Task CRUD"

# Create with story link
OUTPUT=$(node "$AIGILE_BIN" task create "Test Task" -s "$STORY_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    TASK_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "task create: $TASK_KEY"
else
    fail "task create failed"
    TASK_KEY=""
fi

# Create subtask
if [ -n "$TASK_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" task create "Test Subtask" --parent "$TASK_KEY" --json 2>&1)
    if echo "$OUTPUT" | grep -q '"success":true'; then
        SUBTASK_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass "subtask create: $SUBTASK_KEY"
    else
        fail "subtask create failed"
    fi
fi

# List
OUTPUT=$(node "$AIGILE_BIN" task list --json 2>&1)
if echo "$OUTPUT" | grep -q "Test Task"; then
    pass "task list shows created tasks"
else
    fail "task list failed"
fi

# Update
if [ -n "$TASK_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" task update "$TASK_KEY" --summary "Updated Task" --assignee "tester" 2>&1)
    if echo "$OUTPUT" | grep -q "updated"; then
        pass "task update succeeded"
    else
        fail "task update failed"
    fi
fi

# Transition
if [ -n "$TASK_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" task transition "$TASK_KEY" in_progress 2>&1)
    if echo "$OUTPUT" | grep -q "transitioned"; then
        pass "task transition succeeded"
    else
        fail "task transition failed"
    fi
fi

# Test: Bug CRUD
section "Bug CRUD"

# Create
OUTPUT=$(node "$AIGILE_BIN" bug create "Test Bug" --severity Critical --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    BUG_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "bug create: $BUG_KEY"
else
    fail "bug create failed"
    BUG_KEY=""
fi

# List
OUTPUT=$(node "$AIGILE_BIN" bug list --json 2>&1)
if echo "$OUTPUT" | grep -q "Test Bug"; then
    pass "bug list shows created bug"
else
    fail "bug list failed"
fi

# Update
if [ -n "$BUG_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" bug update "$BUG_KEY" --summary "Updated Bug" --severity Major 2>&1)
    if echo "$OUTPUT" | grep -q "updated"; then
        pass "bug update succeeded"
    else
        fail "bug update failed"
    fi
fi

# Transition
if [ -n "$BUG_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" bug transition "$BUG_KEY" resolved --resolution Fixed 2>&1)
    if echo "$OUTPUT" | grep -q "transitioned"; then
        pass "bug transition succeeded"
    else
        fail "bug transition failed"
    fi
fi

# Test: Sprint Commands
section "Sprint Commands"

# Create sprint
OUTPUT=$(node "$AIGILE_BIN" sprint create "Test Sprint" --start 2024-12-01 --end 2024-12-15 --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "sprint create succeeded"
else
    fail "sprint create failed"
fi

# Add story to sprint
OUTPUT=$(node "$AIGILE_BIN" sprint add-story "Test Sprint" "$STORY_KEY" 2>&1)
if echo "$OUTPUT" | grep -q "added"; then
    pass "sprint add-story succeeded"
else
    fail "sprint add-story failed"
fi

# Start sprint
OUTPUT=$(node "$AIGILE_BIN" sprint start "Test Sprint" 2>&1)
if echo "$OUTPUT" | grep -q "started"; then
    pass "sprint start succeeded"
else
    fail "sprint start failed"
fi

# Sprint board
OUTPUT=$(node "$AIGILE_BIN" sprint board --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "sprint board --json returns valid JSON"
else
    fail "sprint board failed"
fi

# Test: Status Command
section "Status Command"

OUTPUT=$(node "$AIGILE_BIN" status --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "status --json returns valid JSON"
else
    fail "status --json failed"
fi

# Test: Delete Commands
section "Delete Commands"

# Delete bug
if [ -n "$BUG_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" bug delete "$BUG_KEY" 2>&1)
    if echo "$OUTPUT" | grep -q "deleted"; then
        pass "bug delete succeeded"
    else
        fail "bug delete failed"
    fi
fi

# Delete subtask
if [ -n "$SUBTASK_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" task delete "$SUBTASK_KEY" 2>&1)
    if echo "$OUTPUT" | grep -q "deleted"; then
        pass "subtask delete succeeded"
    else
        fail "subtask delete failed"
    fi
fi

# Delete initiative
if [ -n "$INIT_KEY" ]; then
    OUTPUT=$(node "$AIGILE_BIN" initiative delete "$INIT_KEY" 2>&1)
    if echo "$OUTPUT" | grep -q "deleted"; then
        pass "initiative delete succeeded"
    else
        fail "initiative delete failed"
    fi
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
