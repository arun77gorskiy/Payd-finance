#!/bin/bash
# PAYD Intelligence V2 — Orchestrator v2
# Uses robust process check, waits for main enrichment to truly complete

set -e
LOG=/tmp/orchestrator.log
MAIN_PID=4676
CHECK_INTERVAL=60  # seconds

# Helper: log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

# Helper: check if process exists AND is the actual node enrichment
is_main_running() {
    # Check if the process exists
    if ! kill -0 $MAIN_PID 2>/dev/null; then
        return 1
    fi
    # Check if it's actually the enrichment process
    local cmd=$(ps -p $MAIN_PID -o cmd= 2>/dev/null)
    if [[ "$cmd" == *"enrich_projects"* ]]; then
        return 0
    fi
    return 1
}

log "Orchestrator v2 started. Watching PID $MAIN_PID (interval ${CHECK_INTERVAL}s)"

# Wait for main process to complete
WAIT_COUNT=0
while is_main_running; do
    sleep $CHECK_INTERVAL
    WAIT_COUNT=$((WAIT_COUNT + 1))
    LAST_LOG=$(tail -1 /tmp/enrich_full.log 2>/dev/null | head -c 100)
    log "Main still running (wait #${WAIT_COUNT}, ${WAIT_COUNT}*$((CHECK_INTERVAL/60)) min). Last: ${LAST_LOG}"
done

log "Main process $MAIN_PID has exited."

# Пауза 10 секунд чтобы файлы точно записались
sleep 10

# Проверяем что enriched файл существует и валиден
if [ ! -f /workspace/public/data/projects_enriched.json ]; then
    log "ERROR: projects_enriched.json not found!"
    exit 1
fi

FILE_SIZE=$(stat -c %s /workspace/public/data/projects_enriched.json 2>/dev/null || echo 0)
log "Enriched file size: ${FILE_SIZE} bytes"

# 1. Валидация
log "STEP 1/3: Running validation..."
node /workspace/code/validate_enrichment.js 2>&1 | tee -a "$LOG"
log "STEP 1/3: Validation complete"

# 2. Второй проход
log "STEP 2/3: Starting second pass with GitHub..."
node /workspace/code/second_pass.js 2>&1 | tee -a "$LOG"
log "STEP 2/3: Second pass complete"

# 3. Финальный отчёт
log "STEP 3/3: Generating final summary..."
node /workspace/code/final_summary.js 2>&1 | tee -a "$LOG"
log "STEP 3/3: Final summary complete"

log "ALL DONE. Reports available in /workspace/docs/"
