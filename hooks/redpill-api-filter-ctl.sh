#!/bin/bash
# redpill-api-filter 启动/停止控制脚本
# 用法：
#   redpill-api-filter-ctl.sh start   — 后台启动代理
#   redpill-api-filter-ctl.sh stop    — 停止代理
#   redpill-api-filter-ctl.sh status  — 检查状态

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/redpill-api-filter.pid"
LOG_FILE="/tmp/redpill-api-filter.log"
FILTER_SCRIPT="$SCRIPT_DIR/redpill-api-filter.js"
PORT="${REDPILL_FILTER_PORT:-18923}"

case "${1:-start}" in
  start)
    # 检查是否已在运行
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        echo "[redpill-api-filter] already running (PID $PID)"
        exit 0
      fi
      rm -f "$PID_FILE"
    fi

    # 后台启动
    nohup node "$FILTER_SCRIPT" >> "$LOG_FILE" 2>&1 &
    sleep 0.5

    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      echo "[redpill-api-filter] started (PID $PID, port $PORT)"
      echo "[redpill-api-filter] set: export ANTHROPIC_BASE_URL=http://127.0.0.1:$PORT"
    else
      echo "[redpill-api-filter] failed to start, check $LOG_FILE"
      exit 1
    fi
    ;;

  stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill "$PID" 2>/dev/null; then
        echo "[redpill-api-filter] stopped (PID $PID)"
      fi
      rm -f "$PID_FILE"
    else
      echo "[redpill-api-filter] not running"
    fi
    ;;

  status)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        echo "[redpill-api-filter] running (PID $PID, port $PORT)"
        exit 0
      else
        echo "[redpill-api-filter] stale PID file (process $PID not found)"
        rm -f "$PID_FILE"
        exit 1
      fi
    else
      echo "[redpill-api-filter] not running"
      exit 1
    fi
    ;;

  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
