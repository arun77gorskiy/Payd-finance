#!/bin/bash
# PAYD Intelligence V2 — Orchestrator v3
# Uses ps instead of kill -0 due to permission restrictions
# (main process runs as root)

set +e
LOG=/tmp/orchestrator.log
PROGRESS_FILE=/workspace/public/data/_enrich_progress.json
ENRICHED_FILE=/workspace/public/data/projects_enriched.json
CHECK_INTERVAL=90  # seconds

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

# Check if main process is running by parsing ps output
# Returns 0 if running, 1 if not
is_main_running() {
    # Look for any node process running enrich_projects.js
    local found=$(ps -ef 2>/dev/null | grep "enrich_projects.js" | grep -v grep)
    if [ -n "$found" ]; then
        return 0
    fi
    return 1
}

# Get last progress timestamp (size in bytes acts as change marker)
get_progress_size() {
    if [ -f "$PROGRESS_FILE" ]; then
        stat -c %s "$PROGRESS_FILE" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

log "Orchestrator v3 started. Checking every ${CHECK_INTERVAL}s"
log "Watching for: node enrich_projects.js process"

# Wait for main process to complete
WAIT_COUNT=0
PREV_SIZE=$(get_progress_size)
STABLE_COUNT=0

while is_main_running; do
    sleep $CHECK_INTERVAL
    WAIT_COUNT=$((WAIT_COUNT + 1))
    LAST_LOG=$(tail -1 /tmp/enrich_full.log 2>/dev/null | head -c 100)
    CUR_SIZE=$(get_progress_size)

    if [ "$CUR_SIZE" == "$PREV_SIZE" ]; then
        STABLE_COUNT=$((STABLE_COUNT + 1))
    else
        STABLE_COUNT=0
        PREV_SIZE=$CUR_SIZE
    fi

    log "Main still running (check #${WAIT_COUNT}). File size: ${CUR_SIZE}. Last: ${LAST_LOG}"
done

log "Main process has exited."
# Extra wait to make sure files are flushed
sleep 15

# Verify enriched file exists
if [ ! -f "$ENRICHED_FILE" ]; then
    log "ERROR: $ENRICHED_FILE not found!"
    exit 1
fi

FILE_SIZE=$(stat -c %s "$ENRICHED_FILE" 2>/dev/null || echo 0)
log "Enriched file size: ${FILE_SIZE} bytes"

# 1. Validation
log "=== STEP 1/4: Validation ==="
node /workspace/code/validate_enrichment.js 2>&1 | tee -a "$LOG"
log "=== STEP 1/4: Validation done ==="

# 2. Second pass with full GitHub
log "=== STEP 2/4: Second pass with GitHub ==="
node /workspace/code/second_pass.js 2>&1 | tee -a "$LOG"
log "=== STEP 2/4: Second pass done ==="

# 3. AI Research & Analysis Engine
log "=== STEP 3/4: AI Research & Analysis Engine ==="
node /workspace/code/ai_research_engine.js \
    /workspace/public/data/projects_enriched.json \
    /workspace/public/data/projects_ai_analyzed.json 2>&1 | tee -a "$LOG"
log "=== STEP 3/4: AI Analysis done ==="

# 4. Final summary
log "=== STEP 4/4: Final summary ==="
node /workspace/code/final_summary.js 2>&1 | tee -a "$LOG"
log "=== STEP 4/4: Final summary done ==="

log "=== ALL DONE ==="
log "Reports:"
log "  - /workspace/docs/validation_report.md"
log "  - /workspace/docs/final_summary.md"
log "  - /workspace/public/data/projects_ai_analyzed.json"
