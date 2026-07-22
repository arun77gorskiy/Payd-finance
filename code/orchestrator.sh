#!/bin/bash
# PAYD Intelligence V2 — Orchestrator
# Ждёт завершения основного процесса обогащения, затем запускает
# валидацию → второй проход → финальный отчёт

MAIN_PID=4676
LOG=/tmp/orchestrator.log
DATE_FMT='%Y-%m-%d %H:%M:%S'

echo "[$(date +$DATE_FMT)] Orchestrator started. Waiting for main process $MAIN_PID..." | tee -a $LOG

# Ждём завершения основного процесса
while kill -0 $MAIN_PID 2>/dev/null; do
    sleep 30
    TAIL=$(tail -1 /tmp/enrich_full.log 2>/dev/null)
    echo "[$(date +$DATE_FMT)] Main process still running. Last log: $TAIL" >> $LOG
done

echo "[$(date +$DATE_FMT)] Main process completed!" | tee -a $LOG

# Пауза чтобы файлы записались
sleep 5

# 1. Валидация
echo "[$(date +$DATE_FMT)] Running validation..." | tee -a $LOG
node /workspace/code/validate_enrichment.js 2>&1 | tee -a $LOG
echo "[$(date +$DATE_FMT)] Validation done." | tee -a $LOG

# 2. Второй проход (только для неполных проектов с GitHub)
echo "[$(date +$DATE_FMT)] Starting second pass..." | tee -a $LOG
node /workspace/code/second_pass.js 2>&1 | tee -a $LOG
echo "[$(date +$DATE_FMT)] Second pass done." | tee -a $LOG

# 3. Финальный отчёт
echo "[$(date +$DATE_FMT)] Generating final summary..." | tee -a $LOG
node /workspace/code/final_summary.js 2>&1 | tee -a $LOG

echo "[$(date +$DATE_FMT)] ALL DONE." | tee -a $LOG
