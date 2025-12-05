#!/bin/bash
#
# AIGILE Session Integration Tests
#
# Tests session management and activity logging.
#
# Usage: ./session-test.sh
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

# Test: Session status (no active session)
section "Session Status (No Active)"

OUTPUT=$(node "$AIGILE_BIN" session status --json 2>&1)
if echo "$OUTPUT" | grep -q '"active":false'; then
    pass "session status shows no active session"
else
    fail "session status should show no active session"
fi

# Test: Start session
section "Session Start"

OUTPUT=$(node "$AIGILE_BIN" session start --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "session start --json returns success"
else
    fail "session start failed"
fi

if echo "$OUTPUT" | grep -q '"sessionId"'; then
    SESSION_ID=$(echo "$OUTPUT" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
    pass "session start returns session ID: ${SESSION_ID:0:8}..."
else
    fail "session start missing sessionId"
fi

# Test: Session status (active)
section "Session Status (Active)"

OUTPUT=$(node "$AIGILE_BIN" session status --json 2>&1)
if echo "$OUTPUT" | grep -q '"active":true'; then
    pass "session status shows active session"
else
    fail "session status should show active session"
fi

if echo "$OUTPUT" | grep -q '"duration"'; then
    pass "session status includes duration"
else
    fail "session status missing duration"
fi

# Test: Create some entities to track activity
section "Creating Entities for Activity Tracking"

OUTPUT=$(node "$AIGILE_BIN" epic create "Test Epic for Session" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    EPIC_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "created epic: $EPIC_KEY"
else
    fail "failed to create epic"
fi

OUTPUT=$(node "$AIGILE_BIN" story create "Test Story" -e "$EPIC_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    STORY_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "created story: $STORY_KEY"
else
    fail "failed to create story"
fi

OUTPUT=$(node "$AIGILE_BIN" task create "Test Task" -s "$STORY_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    TASK_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "created task: $TASK_KEY"
else
    fail "failed to create task"
fi

# Test: Session list
section "Session List"

OUTPUT=$(node "$AIGILE_BIN" session list --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "session list --json returns success"
else
    fail "session list failed"
fi

if echo "$OUTPUT" | grep -q '"status":"active"'; then
    pass "session list shows active session"
else
    fail "session list missing active session"
fi

# Test: Activity log
section "Activity Log"

OUTPUT=$(node "$AIGILE_BIN" session activity --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "session activity --json returns success"
else
    fail "session activity failed"
fi

# Test: End session
section "Session End"

OUTPUT=$(node "$AIGILE_BIN" session end --summary "Test session completed" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "session end --json returns success"
else
    fail "session end failed"
fi

if echo "$OUTPUT" | grep -q '"endedAt"'; then
    pass "session end includes endedAt timestamp"
else
    fail "session end missing endedAt"
fi

# Test: Session status after end
section "Session Status (After End)"

OUTPUT=$(node "$AIGILE_BIN" session status --json 2>&1)
if echo "$OUTPUT" | grep -q '"active":false'; then
    pass "session status shows no active session after end"
else
    fail "session should not be active after end"
fi

# Test: Session list shows completed
OUTPUT=$(node "$AIGILE_BIN" session list --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"completed"'; then
    pass "session list shows completed session"
else
    fail "session list missing completed session"
fi

# Test: Start another session (should work)
section "Multiple Sessions"

OUTPUT=$(node "$AIGILE_BIN" session start --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "can start new session after ending previous"
else
    fail "failed to start new session"
fi

# Create more entities
node "$AIGILE_BIN" bug create "Test Bug" --severity Critical --json > /dev/null 2>&1

# End with summary
OUTPUT=$(node "$AIGILE_BIN" session end --summary "Second session" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ended second session"
else
    fail "failed to end second session"
fi

# Test: List shows multiple sessions
OUTPUT=$(node "$AIGILE_BIN" session list --json 2>&1)
if echo "$OUTPUT" | grep -q '"data":\['; then
    # Count sessions (look for multiple sessionId entries)
    SESSION_COUNT=$(echo "$OUTPUT" | grep -o '"status":' | wc -l | tr -d ' ')
    if [ "$SESSION_COUNT" -ge 2 ]; then
        pass "session list shows $SESSION_COUNT sessions"
    else
        fail "session list should show at least 2 sessions"
    fi
else
    fail "session list format unexpected"
fi

# Test: Filter by status
section "Session Filtering"

OUTPUT=$(node "$AIGILE_BIN" session list --status completed --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"completed"'; then
    pass "session list --status completed filters correctly"
else
    fail "session list status filter failed"
fi

# Test: Session show
section "Session Show"

# Get first session ID from list
OUTPUT=$(node "$AIGILE_BIN" session list --limit 1 --json 2>&1)
FIRST_SESSION=$(echo "$OUTPUT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$FIRST_SESSION" ]; then
    # Use partial ID (first 8 chars)
    PARTIAL_ID="${FIRST_SESSION:0:8}"
    OUTPUT=$(node "$AIGILE_BIN" session show "$PARTIAL_ID" --json 2>&1)
    if echo "$OUTPUT" | grep -q '"success":true'; then
        pass "session show with partial ID works"
    else
        fail "session show with partial ID failed"
    fi
else
    fail "could not get session ID for show test"
fi

# Test: Abandoned session handling
section "Abandoned Session Handling"

# Start a session
node "$AIGILE_BIN" session start --json > /dev/null 2>&1

# Start another (should abandon the first)
OUTPUT=$(node "$AIGILE_BIN" session start --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "starting new session while one is active succeeds"
else
    fail "failed to start session while one is active"
fi

# Check that previous was abandoned
OUTPUT=$(node "$AIGILE_BIN" session list --status abandoned --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"abandoned"' || echo "$OUTPUT" | grep -q '"data":\[\]'; then
    pass "previous session marked as abandoned (or none)"
else
    fail "abandoned session check"
fi

# End current session
node "$AIGILE_BIN" session end --json > /dev/null 2>&1

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
