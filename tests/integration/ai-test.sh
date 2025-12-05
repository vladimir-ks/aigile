#!/bin/bash
#
# AIGILE AI Integration Tests
#
# Tests AI agent helper commands.
#
# Usage: ./ai-test.sh
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

# Create test data
section "Creating Test Data"

# Create epic
OUTPUT=$(node "$AIGILE_BIN" epic create "AI Test Epic" --json 2>&1)
EPIC_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created epic: $EPIC_KEY"

# Create stories
OUTPUT=$(node "$AIGILE_BIN" story create "High Priority Story" -e "$EPIC_KEY" --priority High --json 2>&1)
STORY1_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
node "$AIGILE_BIN" story transition "$STORY1_KEY" in_progress > /dev/null 2>&1
pass "created in_progress story: $STORY1_KEY"

OUTPUT=$(node "$AIGILE_BIN" story create "Backlog Story" -e "$EPIC_KEY" --json 2>&1)
STORY2_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created backlog story: $STORY2_KEY"

# Create task
OUTPUT=$(node "$AIGILE_BIN" task create "Test Task" -s "$STORY1_KEY" --json 2>&1)
TASK_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created task: $TASK_KEY"

# Create blocked task
OUTPUT=$(node "$AIGILE_BIN" task create "Blocked Task" -s "$STORY1_KEY" --json 2>&1)
BLOCKED_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
node "$AIGILE_BIN" task transition "$BLOCKED_KEY" blocked > /dev/null 2>&1
pass "created blocked task: $BLOCKED_KEY"

# Create critical bug
OUTPUT=$(node "$AIGILE_BIN" bug create "Critical Bug" --severity Critical --json 2>&1)
BUG_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created critical bug: $BUG_KEY"

# Create document with comments
mkdir -p docs
cat > docs/spec.md << 'EOF'
# Specification

[[! Need to add more details ]]

[{! Consider restructuring }]
EOF
node "$AIGILE_BIN" sync scan --comments --json > /dev/null 2>&1
pass "created document with comments"

# Test: AI Briefing
section "AI Briefing Tests"

OUTPUT=$(node "$AIGILE_BIN" ai briefing --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ai briefing returns success"
else
    fail "ai briefing failed"
fi

if echo "$OUTPUT" | grep -q '"project"'; then
    pass "briefing includes project info"
else
    fail "briefing missing project info"
fi

if echo "$OUTPUT" | grep -q '"overview"'; then
    pass "briefing includes overview"
else
    fail "briefing missing overview"
fi

if echo "$OUTPUT" | grep -q '"priorities"'; then
    pass "briefing includes priorities"
else
    fail "briefing missing priorities"
fi

# Check priorities include critical bug
if echo "$OUTPUT" | grep -q "Critical"; then
    pass "briefing priorities include critical bug"
else
    fail "briefing priorities should include critical bug"
fi

# Test: AI Next Steps
section "AI Next Steps Tests"

OUTPUT=$(node "$AIGILE_BIN" ai next --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ai next returns success"
else
    fail "ai next failed"
fi

if echo "$OUTPUT" | grep -q '"recommendations"'; then
    pass "next includes recommendations"
else
    fail "next missing recommendations"
fi

if echo "$OUTPUT" | grep -q '"blockers"'; then
    pass "next includes blockers"
else
    fail "next missing blockers"
fi

if echo "$OUTPUT" | grep -q '"unresolvedComments"'; then
    pass "next includes unresolved comments"
else
    fail "next missing unresolved comments"
fi

# Check recommendations have commands
if echo "$OUTPUT" | grep -q '"command"'; then
    pass "recommendations include commands"
else
    fail "recommendations should include commands"
fi

# Test: AI Item
section "AI Item Tests"

OUTPUT=$(node "$AIGILE_BIN" ai item epic "$EPIC_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ai item returns success"
else
    fail "ai item failed"
fi

if echo "$OUTPUT" | grep -q '"children"'; then
    pass "item includes children"
else
    fail "item missing children"
fi

if echo "$OUTPUT" | grep -q '"recentActivity"'; then
    pass "item includes recent activity"
else
    fail "item missing recent activity"
fi

# Test story item
OUTPUT=$(node "$AIGILE_BIN" ai item story "$STORY1_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"children":\['; then
    pass "story item includes task children"
else
    fail "story item should include task children"
fi

# Test: AI Begin Session
section "AI Begin Session Tests"

OUTPUT=$(node "$AIGILE_BIN" ai begin --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ai begin returns success"
else
    fail "ai begin failed"
fi

if echo "$OUTPUT" | grep -q '"session"'; then
    pass "begin includes session info"
else
    fail "begin missing session info"
fi

if echo "$OUTPUT" | grep -q '"briefing"'; then
    pass "begin includes briefing"
else
    fail "begin missing briefing"
fi

if echo "$OUTPUT" | grep -q '"nextSteps"'; then
    pass "begin includes next steps"
else
    fail "begin missing next steps"
fi

# Test: AI Status (compact)
section "AI Status Tests"

OUTPUT=$(node "$AIGILE_BIN" ai status --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ai status returns success"
else
    fail "ai status failed"
fi

if echo "$OUTPUT" | grep -q '"status"'; then
    pass "status includes compact status line"
else
    fail "status missing compact line"
fi

# Non-JSON should be one-liner
OUTPUT=$(node "$AIGILE_BIN" ai status 2>&1)
LINE_COUNT=$(echo "$OUTPUT" | wc -l | tr -d ' ')
if [ "$LINE_COUNT" -eq 1 ]; then
    pass "status is one-liner in non-JSON mode"
else
    fail "status should be one-liner, got $LINE_COUNT lines"
fi

# Test: AI End Session
section "AI End Session Tests"

OUTPUT=$(node "$AIGILE_BIN" ai end --summary "Test session completed" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ai end returns success"
else
    fail "ai end failed"
fi

if echo "$OUTPUT" | grep -q '"duration"'; then
    pass "end includes duration"
else
    fail "end missing duration"
fi

if echo "$OUTPUT" | grep -q '"resumeContext"'; then
    pass "end includes resume context"
else
    fail "end missing resume context"
fi

# Test: AI Resume
section "AI Resume Tests"

OUTPUT=$(node "$AIGILE_BIN" ai resume --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ai resume returns success"
else
    fail "ai resume failed"
fi

if echo "$OUTPUT" | grep -q '"lastSession"'; then
    pass "resume includes last session"
else
    fail "resume missing last session"
fi

if echo "$OUTPUT" | grep -q '"recentChanges"'; then
    pass "resume includes recent changes"
else
    fail "resume missing recent changes"
fi

if echo "$OUTPUT" | grep -q '"pendingWork"'; then
    pass "resume includes pending work"
else
    fail "resume missing pending work"
fi

# Test: Error Handling
section "Error Handling Tests"

set +e  # Temporarily allow errors

OUTPUT=$(node "$AIGILE_BIN" ai item invalid KEY-1 2>&1)
if echo "$OUTPUT" | grep -qi "invalid"; then
    pass "invalid type returns error"
else
    fail "invalid type should return error"
fi

OUTPUT=$(node "$AIGILE_BIN" ai item epic NOTFOUND-999 2>&1)
if echo "$OUTPUT" | grep -qi "not found"; then
    pass "not found returns error"
else
    fail "not found should return error"
fi

set -e  # Re-enable exit on error

# Test: Multiple Sessions Flow
section "Multiple Sessions Flow"

# Begin a new session
OUTPUT=$(node "$AIGILE_BIN" ai begin --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "second session begins successfully"
else
    fail "second session begin failed"
fi

# Create some activity
node "$AIGILE_BIN" task transition "$TASK_KEY" in_progress > /dev/null 2>&1
pass "updated task status"

# End with summary
OUTPUT=$(node "$AIGILE_BIN" ai end --summary "Worked on task" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "second session ends successfully"
else
    fail "second session end failed"
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
