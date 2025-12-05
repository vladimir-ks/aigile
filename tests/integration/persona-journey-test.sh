#!/bin/bash
#
# AIGILE Persona & UX Journey Integration Tests
#
# Tests Persona and UX Journey CLI commands.
#
# Usage: ./persona-journey-test.sh
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

# =============================================================================
# Persona Tests
# =============================================================================
section "Persona Tests"

# Create persona
OUTPUT=$(node "$AIGILE_BIN" persona create "Sarah Developer" -d "Senior software developer" -r "Developer" -g "Ship features quickly" -f "Complex deployments" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "persona create succeeded"
else
    fail "persona create failed: $OUTPUT"
fi

# Extract key
PERSONA_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created persona: $PERSONA_KEY"

# Create second persona
OUTPUT=$(node "$AIGILE_BIN" persona create "Alex Manager" -d "Product manager" -r "Manager" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "persona create (second) succeeded"
else
    fail "persona create (second) failed"
fi
PERSONA2_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created persona: $PERSONA2_KEY"

# List personas
OUTPUT=$(node "$AIGILE_BIN" persona list --json 2>&1)
if echo "$OUTPUT" | grep -q '"name":"Sarah Developer"'; then
    pass "persona list shows Sarah Developer"
else
    fail "persona list should show Sarah Developer"
fi

if echo "$OUTPUT" | grep -q '"name":"Alex Manager"'; then
    pass "persona list shows Alex Manager"
else
    fail "persona list should show Alex Manager"
fi

# Show persona
OUTPUT=$(node "$AIGILE_BIN" persona show "$PERSONA_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"role":"Developer"'; then
    pass "persona show returns role"
else
    fail "persona show should return role"
fi

if echo "$OUTPUT" | grep -q '"goals":"Ship features quickly"'; then
    pass "persona show returns goals"
else
    fail "persona show should return goals"
fi

if echo "$OUTPUT" | grep -q '"frustrations":"Complex deployments"'; then
    pass "persona show returns frustrations"
else
    fail "persona show should return frustrations"
fi

# Update persona
OUTPUT=$(node "$AIGILE_BIN" persona update "$PERSONA_KEY" -g "Ship features quickly, Maintain code quality" --demographics "Age: 30-40" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "persona update succeeded"
else
    fail "persona update failed"
fi

# Verify update
OUTPUT=$(node "$AIGILE_BIN" persona show "$PERSONA_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"demographics":"Age: 30-40"'; then
    pass "persona update persisted"
else
    fail "persona update should have persisted"
fi

# Error handling - show nonexistent
set +e
OUTPUT=$(node "$AIGILE_BIN" persona show "NONEXISTENT-999" 2>&1)
if echo "$OUTPUT" | grep -qi "not found"; then
    pass "persona show handles not found"
else
    fail "persona show should handle not found"
fi
set -e

# =============================================================================
# UX Journey Tests
# =============================================================================
section "UX Journey Tests"

# Create UX journey (linked to persona)
OUTPUT=$(node "$AIGILE_BIN" ux-journey create "Onboarding" -d "New user onboarding flow" -p "$PERSONA_KEY" -s "Awareness,Consideration,Signup,Activation" -t "Website,Email,Dashboard" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ux-journey create succeeded"
else
    fail "ux-journey create failed: $OUTPUT"
fi

JOURNEY_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created ux-journey: $JOURNEY_KEY"

# Create second journey (no persona)
OUTPUT=$(node "$AIGILE_BIN" ux-journey create "Purchase Flow" -d "User purchase journey" --pain-points "Complex checkout" --opportunities "Simplify payment" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ux-journey create (second) succeeded"
else
    fail "ux-journey create (second) failed"
fi
JOURNEY2_KEY=$(echo "$OUTPUT" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
pass "created ux-journey: $JOURNEY2_KEY"

# List journeys
OUTPUT=$(node "$AIGILE_BIN" ux-journey list --json 2>&1)
if echo "$OUTPUT" | grep -q '"name":"Onboarding"'; then
    pass "ux-journey list shows Onboarding"
else
    fail "ux-journey list should show Onboarding"
fi

if echo "$OUTPUT" | grep -q '"name":"Purchase Flow"'; then
    pass "ux-journey list shows Purchase Flow"
else
    fail "ux-journey list should show Purchase Flow"
fi

# List by persona
OUTPUT=$(node "$AIGILE_BIN" ux-journey list -p "$PERSONA_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"name":"Onboarding"'; then
    pass "ux-journey list filter by persona works"
else
    fail "ux-journey list filter by persona should work"
fi

# Show journey
OUTPUT=$(node "$AIGILE_BIN" ux-journey show "$JOURNEY_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"stages":"Awareness,Consideration,Signup,Activation"'; then
    pass "ux-journey show returns stages"
else
    fail "ux-journey show should return stages"
fi

if echo "$OUTPUT" | grep -q '"touchpoints":"Website,Email,Dashboard"'; then
    pass "ux-journey show returns touchpoints"
else
    fail "ux-journey show should return touchpoints"
fi

if echo "$OUTPUT" | grep -q "Sarah Developer"; then
    pass "ux-journey show returns linked persona"
else
    fail "ux-journey show should return linked persona"
fi

# Update journey
OUTPUT=$(node "$AIGILE_BIN" ux-journey update "$JOURNEY_KEY" --pain-points "Slow signup form" --opportunities "Add social login" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ux-journey update succeeded"
else
    fail "ux-journey update failed"
fi

# Verify update
OUTPUT=$(node "$AIGILE_BIN" ux-journey show "$JOURNEY_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"pain_points":"Slow signup form"'; then
    pass "ux-journey update persisted"
else
    fail "ux-journey update should have persisted"
fi

# Link journey to different persona
OUTPUT=$(node "$AIGILE_BIN" ux-journey update "$JOURNEY2_KEY" -p "$PERSONA2_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ux-journey link to persona succeeded"
else
    fail "ux-journey link to persona failed"
fi

# Unlink persona
OUTPUT=$(node "$AIGILE_BIN" ux-journey update "$JOURNEY2_KEY" -p "none" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ux-journey unlink persona succeeded"
else
    fail "ux-journey unlink persona failed"
fi

# Verify unlink
OUTPUT=$(node "$AIGILE_BIN" ux-journey show "$JOURNEY2_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"persona":"-"'; then
    pass "ux-journey unlink persisted"
else
    fail "ux-journey unlink should have persisted"
fi

# Delete journey
OUTPUT=$(node "$AIGILE_BIN" ux-journey delete "$JOURNEY2_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "ux-journey delete succeeded"
else
    fail "ux-journey delete failed"
fi

# Verify delete
OUTPUT=$(node "$AIGILE_BIN" ux-journey list --json 2>&1)
if ! echo "$OUTPUT" | grep -q '"key":"'"$JOURNEY2_KEY"'"'; then
    pass "ux-journey delete removed journey"
else
    fail "ux-journey delete should have removed journey"
fi

# Error handling
set +e
OUTPUT=$(node "$AIGILE_BIN" ux-journey show "NONEXISTENT-999" 2>&1)
if echo "$OUTPUT" | grep -qi "not found"; then
    pass "ux-journey show handles not found"
else
    fail "ux-journey show should handle not found"
fi

OUTPUT=$(node "$AIGILE_BIN" ux-journey create "Test" -p "NONEXISTENT-999" --json 2>&1)
if echo "$OUTPUT" | grep -qi "not found"; then
    pass "ux-journey create handles invalid persona"
else
    fail "ux-journey create should handle invalid persona"
fi
set -e

# =============================================================================
# Persona-Journey Relationship Tests
# =============================================================================
section "Persona-Journey Relationship Tests"

# Verify persona shows journey count
OUTPUT=$(node "$AIGILE_BIN" persona show "$PERSONA_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"journeys":1'; then
    pass "persona show returns journey count"
else
    fail "persona show should return journey count"
fi

# Delete persona (should warn about linked journeys)
set +e
OUTPUT=$(node "$AIGILE_BIN" persona delete "$PERSONA_KEY" 2>&1)
if echo "$OUTPUT" | grep -qi "linked\|force"; then
    pass "persona delete warns about linked journeys"
else
    fail "persona delete should warn about linked journeys"
fi
set -e

# Force delete persona
OUTPUT=$(node "$AIGILE_BIN" persona delete "$PERSONA_KEY" --force --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "persona delete with force succeeded"
else
    fail "persona delete with force failed"
fi

# Verify journey still exists but persona unlinked
OUTPUT=$(node "$AIGILE_BIN" ux-journey show "$JOURNEY_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"persona":"-"'; then
    pass "journey persona auto-unlinked on persona delete"
else
    fail "journey persona should be auto-unlinked on persona delete"
fi

# Clean up remaining persona
OUTPUT=$(node "$AIGILE_BIN" persona delete "$PERSONA2_KEY" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "persona cleanup succeeded"
else
    fail "persona cleanup failed"
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
