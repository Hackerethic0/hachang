#!/usr/bin/env bash
# เปิดระบบ (macOS / Linux):  ./start.sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "ต้องติดตั้ง Node.js 22.13 ขึ้นไปก่อน (เลือกเวอร์ชัน LTS): https://nodejs.org"; exit 1
fi
URL="http://localhost:${PORT:-3000}"
( sleep 1.5; (command -v xdg-open >/dev/null && xdg-open "$URL") || (command -v open >/dev/null && open "$URL") ) >/dev/null 2>&1 &
exec node --disable-warning=ExperimentalWarning server-lite.js
