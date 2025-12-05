#!/bin/bash
#
# AIGILE Context Integration Tests
#
# Tests progressive context loading for AI agents.
#
# Usage: ./context-test.sh
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

# Create test entities
section "Creating Test Data"

# Create initiative
node "$AIGILE_BIN" initiative create "Test Initiative" -d "Testing context" --json > /dev/null 2>&1
pass "created initiative"

# Create epic
OUTPUT=$(node "$AIGILE_BIN" epic create "Test Epic" --json 2>&1)
EPIC_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created epic: $EPIC_KEY"

# Create stories
OUTPUT=$(node "$AIGILE_BIN" story create "Story 1" -e "$EPIC_KEY" --points 5 --json 2>&1)
STORY_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created story: $STORY_KEY"

node "$AIGILE_BIN" story create "Story 2 (backlog)" -e "$EPIC_KEY" --points 3 --json > /dev/null 2>&1
pass "created backlog story"

# Create tasks
node "$AIGILE_BIN" task create "Task 1" -s "$STORY_KEY" --json > /dev/null 2>&1
pass "created task"

# Create bug
node "$AIGILE_BIN" bug create "Test Bug" --severity Critical --json > /dev/null 2>&1
pass "created bug"

# Transition some items to in_progress
node "$AIGILE_BIN" story transition "$STORY_KEY" in_progress > /dev/null 2>&1
pass "story in progress"

# Create documents with comments
mkdir -p docs
cat > docs/spec.md << 'EOF'
# Specification

[[! Need to add more details here ]]

## Features

[{! Consider breaking this into sections }]
EOF
pass "created document with comments"

# Scan files
node "$AIGILE_BIN" sync scan --comments --json > /dev/null 2>&1
pass "synced files"

# Start a session
node "$AIGILE_BIN" session start --json > /dev/null 2>&1
pass "started session"

# Test: Context load - minimal
section "Context Load - Minimal"

OUTPUT=$(node "$AIGILE_BIN" context load --level minimal --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "context load --level minimal returns success"
else
    fail "context load minimal failed"
fi

if echo "$OUTPUT" | grep -q '"level":"minimal"'; then
    pass "context level is minimal"
else
    fail "context level mismatch"
fi

if echo "$OUTPUT" | grep -q '"project"'; then
    pass "minimal context includes project info"
else
    fail "minimal context missing project"
fi

if echo "$OUTPUT" | grep -q '"session"'; then
    pass "minimal context includes session info"
else
    fail "minimal context missing session"
fi

# Test: Context load - summary
section "Context Load - Summary"

OUTPUT=$(node "$AIGILE_BIN" context load --level summary --json 2>&1)
if echo "$OUTPUT" | grep -q '"level":"summary"'; then
    pass "context level is summary"
else
    fail "context level mismatch"
fi

if echo "$OUTPUT" | grep -q '"counts"'; then
    pass "summary context includes counts"
else
    fail "summary context missing counts"
fi

if echo "$OUTPUT" | grep -q '"recentActivity"'; then
    pass "summary context includes recent activity"
else
    fail "summary context missing activity"
fi

# Verify entity counts are present
if echo "$OUTPUT" | grep -q '"initiatives":1'; then
    pass "initiatives count correct"
else
    fail "initiatives count incorrect"
fi

if echo "$OUTPUT" | grep -q '"epics":1'; then
    pass "epics count correct"
else
    fail "epics count incorrect"
fi

# Test: Context load - standard
section "Context Load - Standard"

OUTPUT=$(node "$AIGILE_BIN" context load --level standard --json 2>&1)
if echo "$OUTPUT" | grep -q '"level":"standard"'; then
    pass "context level is standard"
else
    fail "context level mismatch"
fi

if echo "$OUTPUT" | grep -q '"inProgress"'; then
    pass "standard context includes in-progress items"
else
    fail "standard context missing in-progress"
fi

if echo "$OUTPUT" | grep -q '"blockers"'; then
    pass "standard context includes blockers"
else
    fail "standard context missing blockers"
fi

# Test: Context load - full
section "Context Load - Full"

OUTPUT=$(node "$AIGILE_BIN" context load --level full --json 2>&1)
if echo "$OUTPUT" | grep -q '"level":"full"'; then
    pass "context level is full"
else
    fail "context level mismatch"
fi

if echo "$OUTPUT" | grep -q '"initiatives":\['; then
    pass "full context includes initiatives list"
else
    fail "full context missing initiatives list"
fi

if echo "$OUTPUT" | grep -q '"epics":\['; then
    pass "full context includes epics list"
else
    fail "full context missing epics list"
fi

if echo "$OUTPUT" | grep -q '"backlog"'; then
    pass "full context includes backlog"
else
    fail "full context missing backlog"
fi

if echo "$OUTPUT" | grep -q '"documents"'; then
    pass "full context includes documents"
else
    fail "full context missing documents"
fi

if echo "$OUTPUT" | grep -q '"pendingComments"'; then
    pass "full context includes pending comments"
else
    fail "full context missing pending comments"
fi

# Test: Context quick
section "Context Quick"

OUTPUT=$(node "$AIGILE_BIN" context quick --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "context quick returns success"
else
    fail "context quick failed"
fi

if echo "$OUTPUT" | grep -q '"entities"'; then
    pass "quick context includes entities summary"
else
    fail "quick context missing entities"
fi

# Test: Context resume
section "Context Resume"

# End current session first
node "$AIGILE_BIN" session end --summary "Test session for context" --json > /dev/null 2>&1
pass "ended session for resume test"

OUTPUT=$(node "$AIGILE_BIN" context resume --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "context resume returns success"
else
    fail "context resume failed"
fi

if echo "$OUTPUT" | grep -q '"lastSession"'; then
    pass "resume context includes last session"
else
    fail "resume context missing last session"
fi

if echo "$OUTPUT" | grep -q '"recentChanges"'; then
    pass "resume context includes recent changes"
else
    fail "resume context missing recent changes"
fi

if echo "$OUTPUT" | grep -q '"pendingWork"'; then
    pass "resume context includes pending work"
else
    fail "resume context missing pending work"
fi

# Test: Context entity
section "Context Entity"

OUTPUT=$(node "$AIGILE_BIN" context entity epic "$EPIC_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "context entity returns success"
else
    fail "context entity failed"
fi

if echo "$OUTPUT" | grep -q "\"key\":\"$EPIC_KEY\""; then
    pass "entity context includes correct key"
else
    fail "entity context missing key"
fi

if echo "$OUTPUT" | grep -q '"summary"'; then
    pass "entity context includes summary"
else
    fail "entity context missing summary"
fi

# Test: Invalid level
section "Error Handling"

# These commands exit with non-zero, so we need to capture them differently
set +e  # Temporarily allow errors

OUTPUT=$(node "$AIGILE_BIN" context load --level invalid 2>&1)
if echo "$OUTPUT" | grep -qi "invalid level"; then
    pass "invalid level returns error"
else
    fail "invalid level should return error: $OUTPUT"
fi

# Test: Invalid entity type
OUTPUT=$(node "$AIGILE_BIN" context entity invalid KEY-1 2>&1)
if echo "$OUTPUT" | grep -qi "invalid entity type"; then
    pass "invalid entity type returns error"
else
    fail "invalid entity type should return error: $OUTPUT"
fi

# Test: Entity not found
OUTPUT=$(node "$AIGILE_BIN" context entity epic NOTFOUND-999 2>&1)
if echo "$OUTPUT" | grep -qi "not found"; then
    pass "entity not found returns error"
else
    fail "entity not found should return error: $OUTPUT"
fi

set -e  # Re-enable exit on error

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
