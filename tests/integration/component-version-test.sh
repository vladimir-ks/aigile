#!/bin/bash
#
# AIGILE Component & Version Integration Tests
#
# Tests Component and Version CLI commands.
#
# Usage: ./component-version-test.sh
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
# Component Tests
# =============================================================================
section "Component Tests"

# Create component
OUTPUT=$(node "$AIGILE_BIN" component create "Auth" -d "Authentication module" -l "John" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "component create succeeded"
else
    fail "component create failed: $OUTPUT"
fi

# Create second component
OUTPUT=$(node "$AIGILE_BIN" component create "Payments" -d "Payment processing" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "component create (second) succeeded"
else
    fail "component create (second) failed"
fi

# List components
OUTPUT=$(node "$AIGILE_BIN" component list --json 2>&1)
if echo "$OUTPUT" | grep -q '"name":"Auth"'; then
    pass "component list shows Auth"
else
    fail "component list should show Auth"
fi

if echo "$OUTPUT" | grep -q '"name":"Payments"'; then
    pass "component list shows Payments"
else
    fail "component list should show Payments"
fi

# Show component
OUTPUT=$(node "$AIGILE_BIN" component show "Auth" --json 2>&1)
if echo "$OUTPUT" | grep -q '"description":"Authentication module"'; then
    pass "component show returns description"
else
    fail "component show should return description"
fi

if echo "$OUTPUT" | grep -q '"lead":"John"'; then
    pass "component show returns lead"
else
    fail "component show should return lead"
fi

# Update component
OUTPUT=$(node "$AIGILE_BIN" component update "Auth" -d "Updated auth module" --default-assignee "Jane" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "component update succeeded"
else
    fail "component update failed"
fi

# Verify update
OUTPUT=$(node "$AIGILE_BIN" component show "Auth" --json 2>&1)
if echo "$OUTPUT" | grep -q '"description":"Updated auth module"'; then
    pass "component update persisted"
else
    fail "component update should have persisted"
fi

# Rename component
OUTPUT=$(node "$AIGILE_BIN" component update "Payments" --rename "Billing" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "component rename succeeded"
else
    fail "component rename failed"
fi

# Verify rename
OUTPUT=$(node "$AIGILE_BIN" component show "Billing" --json 2>&1)
if echo "$OUTPUT" | grep -q '"name":"Billing"'; then
    pass "component rename persisted"
else
    fail "component rename should have persisted"
fi

# Delete component
OUTPUT=$(node "$AIGILE_BIN" component delete "Billing" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "component delete succeeded"
else
    fail "component delete failed"
fi

# Verify delete
OUTPUT=$(node "$AIGILE_BIN" component list --json 2>&1)
if ! echo "$OUTPUT" | grep -q '"name":"Billing"'; then
    pass "component delete removed component"
else
    fail "component delete should have removed component"
fi

# Error handling
set +e
OUTPUT=$(node "$AIGILE_BIN" component show "NonExistent" 2>&1)
if echo "$OUTPUT" | grep -qi "not found"; then
    pass "component show handles not found"
else
    fail "component show should handle not found"
fi

OUTPUT=$(node "$AIGILE_BIN" component create "Auth" --json 2>&1)
if echo "$OUTPUT" | grep -qi "already exists"; then
    pass "component create handles duplicate"
else
    fail "component create should handle duplicate"
fi
set -e

# =============================================================================
# Version Tests
# =============================================================================
section "Version Tests"

# Create version
OUTPUT=$(node "$AIGILE_BIN" version create "v1.0.0" -d "Initial release" --start "2024-01-01" --release "2024-02-01" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "version create succeeded"
else
    fail "version create failed: $OUTPUT"
fi

# Create second version
OUTPUT=$(node "$AIGILE_BIN" version create "v1.1.0" -d "Feature release" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "version create (second) succeeded"
else
    fail "version create (second) failed"
fi

# List versions
OUTPUT=$(node "$AIGILE_BIN" version list --json 2>&1)
if echo "$OUTPUT" | grep -q '"name":"v1.0.0"'; then
    pass "version list shows v1.0.0"
else
    fail "version list should show v1.0.0"
fi

if echo "$OUTPUT" | grep -q '"name":"v1.1.0"'; then
    pass "version list shows v1.1.0"
else
    fail "version list should show v1.1.0"
fi

# Show version
OUTPUT=$(node "$AIGILE_BIN" version show "v1.0.0" --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"unreleased"'; then
    pass "version show returns status"
else
    fail "version show should return status"
fi

if echo "$OUTPUT" | grep -q '"release_date":"2024-02-01"'; then
    pass "version show returns release date"
else
    fail "version show should return release date"
fi

# Update version
OUTPUT=$(node "$AIGILE_BIN" version update "v1.0.0" -d "Updated release notes" --release "2024-03-01" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "version update succeeded"
else
    fail "version update failed"
fi

# Verify update
OUTPUT=$(node "$AIGILE_BIN" version show "v1.0.0" --json 2>&1)
if echo "$OUTPUT" | grep -q '"release_date":"2024-03-01"'; then
    pass "version update persisted"
else
    fail "version update should have persisted"
fi

# Transition version
OUTPUT=$(node "$AIGILE_BIN" version transition "v1.0.0" released --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "version transition succeeded"
else
    fail "version transition failed"
fi

# Verify transition
OUTPUT=$(node "$AIGILE_BIN" version show "v1.0.0" --json 2>&1)
if echo "$OUTPUT" | grep -q '"status":"released"'; then
    pass "version transition persisted"
else
    fail "version transition should have persisted"
fi

# List by status
OUTPUT=$(node "$AIGILE_BIN" version list -s released --json 2>&1)
if echo "$OUTPUT" | grep -q '"name":"v1.0.0"'; then
    pass "version list filter by status works"
else
    fail "version list filter by status should work"
fi

# Rename version
OUTPUT=$(node "$AIGILE_BIN" version update "v1.1.0" --rename "v2.0.0" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "version rename succeeded"
else
    fail "version rename failed"
fi

# Delete version
OUTPUT=$(node "$AIGILE_BIN" version delete "v2.0.0" --json 2>&1)
if echo "$OUTPUT" | grep -q '"success":true'; then
    pass "version delete succeeded"
else
    fail "version delete failed"
fi

# Verify delete
OUTPUT=$(node "$AIGILE_BIN" version list --json 2>&1)
if ! echo "$OUTPUT" | grep -q '"name":"v2.0.0"'; then
    pass "version delete removed version"
else
    fail "version delete should have removed version"
fi

# Error handling
set +e
OUTPUT=$(node "$AIGILE_BIN" version show "v9.9.9" 2>&1)
if echo "$OUTPUT" | grep -qi "not found"; then
    pass "version show handles not found"
else
    fail "version show should handle not found"
fi

OUTPUT=$(node "$AIGILE_BIN" version transition "v1.0.0" invalid 2>&1)
if echo "$OUTPUT" | grep -qi "invalid"; then
    pass "version transition handles invalid status"
else
    fail "version transition should handle invalid status"
fi

OUTPUT=$(node "$AIGILE_BIN" version create "v1.0.0" --json 2>&1)
if echo "$OUTPUT" | grep -qi "already exists"; then
    pass "version create handles duplicate"
else
    fail "version create should handle duplicate"
fi
set -e

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
