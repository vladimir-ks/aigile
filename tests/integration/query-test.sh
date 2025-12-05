#!/bin/bash
#
# AIGILE Query Integration Tests
#
# Tests unified search and filtering across entities.
#
# Usage: ./query-test.sh
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

# Create test entities with various statuses and assignees
section "Creating Test Data"

# Create initiative
node "$AIGILE_BIN" initiative create "Strategic Initiative" --priority High --json > /dev/null 2>&1
pass "created initiative"

# Create epics
OUTPUT=$(node "$AIGILE_BIN" epic create "Backend Epic" --json 2>&1)
EPIC1_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created epic: $EPIC1_KEY"

OUTPUT=$(node "$AIGILE_BIN" epic create "Frontend Epic" --json 2>&1)
EPIC2_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created epic: $EPIC2_KEY"

# Create stories with different statuses
OUTPUT=$(node "$AIGILE_BIN" story create "API Development" -e "$EPIC1_KEY" --points 8 --json 2>&1)
STORY1_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
node "$AIGILE_BIN" story transition "$STORY1_KEY" in_progress > /dev/null 2>&1
pass "created in_progress story: $STORY1_KEY"

OUTPUT=$(node "$AIGILE_BIN" story create "UI Components" -e "$EPIC2_KEY" --points 5 --json 2>&1)
STORY2_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created backlog story: $STORY2_KEY"

OUTPUT=$(node "$AIGILE_BIN" story create "Database Schema" -e "$EPIC1_KEY" --points 3 --json 2>&1)
STORY3_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
node "$AIGILE_BIN" story transition "$STORY3_KEY" done > /dev/null 2>&1
pass "created done story: $STORY3_KEY"

# Create tasks with assignees
OUTPUT=$(node "$AIGILE_BIN" task create "Write tests" -s "$STORY1_KEY" --assignee alice --json 2>&1)
TASK1_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created task assigned to alice: $TASK1_KEY"

OUTPUT=$(node "$AIGILE_BIN" task create "Code review" -s "$STORY1_KEY" --assignee bob --json 2>&1)
TASK2_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
node "$AIGILE_BIN" task transition "$TASK2_KEY" in_progress > /dev/null 2>&1
pass "created in_progress task: $TASK2_KEY"

# Create bug
OUTPUT=$(node "$AIGILE_BIN" bug create "Login error" --severity Critical --assignee alice --json 2>&1)
BUG_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created bug: $BUG_KEY"

# Test: Basic search
section "Basic Search Tests"

OUTPUT=$(node "$AIGILE_BIN" query search --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "query search returns success"
else
    fail "query search failed"
fi

# Count results
RESULT_COUNT=$(echo "$OUTPUT" | grep -o '"key":' | wc -l | tr -d ' ')
if [ "$RESULT_COUNT" -ge 8 ]; then
    pass "query search finds all items ($RESULT_COUNT)"
else
    fail "query search should find at least 8 items, found $RESULT_COUNT"
fi

# Test: Text search
section "Text Search Tests"

OUTPUT=$(node "$AIGILE_BIN" query search "API" --json 2>&1)
if echo "$OUTPUT" | grep -q "API Development"; then
    pass "text search finds matching items"
else
    fail "text search should find API Development"
fi

OUTPUT=$(node "$AIGILE_BIN" query search "Login" --json 2>&1)
if echo "$OUTPUT" | grep -q "Login error"; then
    pass "text search finds bug"
else
    fail "text search should find Login error bug"
fi

# Test: Type filter
section "Type Filter Tests"

OUTPUT=$(node "$AIGILE_BIN" query search --type story --json 2>&1)
STORY_COUNT=$(echo "$OUTPUT" | grep -o '"type":"story"' | wc -l | tr -d ' ')
if [ "$STORY_COUNT" -eq 3 ]; then
    pass "type filter finds 3 stories"
else
    fail "type filter should find 3 stories, found $STORY_COUNT"
fi

OUTPUT=$(node "$AIGILE_BIN" query search --type bug --json 2>&1)
if echo "$OUTPUT" | grep -q '"type":"bug"'; then
    pass "type filter finds bugs"
else
    fail "type filter should find bugs"
fi

# Test: Status filter
section "Status Filter Tests"

OUTPUT=$(node "$AIGILE_BIN" query status in_progress --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"in_progress"'; then
    pass "status filter finds in_progress items"
else
    fail "status filter should find in_progress items"
fi

OUTPUT=$(node "$AIGILE_BIN" query status done --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"done"'; then
    pass "status filter finds done items"
else
    fail "status filter should find done items"
fi

# Multiple statuses
OUTPUT=$(node "$AIGILE_BIN" query status "backlog,in_progress" --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"backlog"' || echo "$OUTPUT" | grep -q '"status":"in_progress"'; then
    pass "status filter handles multiple statuses"
else
    fail "status filter should handle multiple statuses"
fi

# Test: Assignee filter
section "Assignee Filter Tests"

OUTPUT=$(node "$AIGILE_BIN" query assignee alice --json 2>&1)
if echo "$OUTPUT" | grep -q '"assignee":"alice"'; then
    pass "assignee filter finds alice's items"
else
    fail "assignee filter should find alice's items"
fi

ALICE_COUNT=$(echo "$OUTPUT" | grep -o '"assignee":"alice"' | wc -l | tr -d ' ')
if [ "$ALICE_COUNT" -eq 2 ]; then
    pass "alice has 2 assigned items"
else
    fail "alice should have 2 items, found $ALICE_COUNT"
fi

OUTPUT=$(node "$AIGILE_BIN" query assignee bob --json 2>&1)
if echo "$OUTPUT" | grep -q '"assignee":"bob"'; then
    pass "assignee filter finds bob's items"
else
    fail "assignee filter should find bob's items"
fi

# Test: Key search
section "Key Search Tests"

OUTPUT=$(node "$AIGILE_BIN" query key "$STORY1_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q "\"key\":\"$STORY1_KEY\""; then
    pass "key search finds exact key"
else
    fail "key search should find exact key"
fi

# Partial key search
PREFIX="${STORY1_KEY%-*}"
OUTPUT=$(node "$AIGILE_BIN" query key "$PREFIX" --json 2>&1)
if echo "$OUTPUT" | grep -q '"key":'; then
    pass "key search handles partial keys"
else
    fail "key search should handle partial keys"
fi

# Test: Recent items
section "Recent Items Tests"

OUTPUT=$(node "$AIGILE_BIN" query recent --hours 1 --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "recent query returns success"
else
    fail "recent query failed"
fi

if echo "$OUTPUT" | grep -q '"key":'; then
    pass "recent query finds recently updated items"
else
    fail "recent query should find items"
fi

# Test: Related items
section "Related Items Tests"

OUTPUT=$(node "$AIGILE_BIN" query related epic "$EPIC1_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "related query returns success"
else
    fail "related query failed"
fi

# Should find stories under the epic
if echo "$OUTPUT" | grep -q '"type":"story"'; then
    pass "related finds stories under epic"
else
    fail "related should find stories under epic"
fi

OUTPUT=$(node "$AIGILE_BIN" query related story "$STORY1_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"type":"task"'; then
    pass "related finds tasks under story"
else
    fail "related should find tasks under story"
fi

# Test: Statistics
section "Statistics Tests"

OUTPUT=$(node "$AIGILE_BIN" query stats --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "stats query returns success"
else
    fail "stats query failed"
fi

if echo "$OUTPUT" | grep -q '"total":'; then
    pass "stats includes total count"
else
    fail "stats should include total count"
fi

if echo "$OUTPUT" | grep -q '"byType":'; then
    pass "stats includes byType breakdown"
else
    fail "stats should include byType breakdown"
fi

if echo "$OUTPUT" | grep -q '"byStatus":'; then
    pass "stats includes byStatus breakdown"
else
    fail "stats should include byStatus breakdown"
fi

# Test: Combined filters
section "Combined Filter Tests"

OUTPUT=$(node "$AIGILE_BIN" query search --type task --status in_progress --json 2>&1)
if echo "$OUTPUT" | grep -q '"type":"task"' && echo "$OUTPUT" | grep -q '"status":"in_progress"'; then
    pass "combined filters work (type + status)"
else
    fail "combined filters should work"
fi

OUTPUT=$(node "$AIGILE_BIN" query search "Write" --assignee alice --json 2>&1)
if echo "$OUTPUT" | grep -q "Write tests"; then
    pass "combined filters work (text + assignee)"
else
    fail "combined text + assignee filter should work"
fi

# Test: Limit
OUTPUT=$(node "$AIGILE_BIN" query search --limit 2 --json 2>&1)
RESULT_COUNT=$(echo "$OUTPUT" | grep -o '"key":' | wc -l | tr -d ' ')
if [ "$RESULT_COUNT" -le 2 ]; then
    pass "limit option works (found $RESULT_COUNT)"
else
    fail "limit should restrict results to 2, found $RESULT_COUNT"
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
