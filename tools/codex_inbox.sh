#!/bin/bash
# 在用户电脑上跑（device_bash）：一次列出 Codex 还没读过的交接消息全文 + 最近交付目录里 GLB/PNG 的 SHA。
# 用法：bash game/tools/codex_inbox.sh            看新消息（不标记）
#       bash game/tools/codex_inbox.sh --mark 0073 标记已读到 0073
cd "$(dirname "$0")/../.." || exit 1
REC=game/tools/.claude_last_read_codex
if [ "$1" = "--mark" ]; then echo "$2" > "$REC"; echo "已读到 $2"; exit 0; fi
LAST=$(cat "$REC" 2>/dev/null || echo 0000)
n=0
for f in $(ls docs/协作/消息/ | grep -v '^\._' | grep 'Codex给Claude' | sort); do
  num=${f%%_*}
  if [ "$((10#$num))" -gt "$((10#$LAST))" ]; then
    n=$((n+1)); echo "=================== $f"; cat "docs/协作/消息/$f"; echo
  fi
done
echo "=================== 新消息 $n 条（上次已读到 $LAST）"
echo "--- 最近 3 个交付目录"
for d in $(ls -t deliveries | grep -v '^\._' | head -3); do
  echo "[$d]"; (cd "deliveries/$d" && find . \( -name '*.glb' -o -name '*.png' -o -name 'scene_manifest.json' \) -not -name '._*' -not -path './previews/*' | sort | while read -r x; do echo "  $(shasum -a 256 "$x" | cut -c1-16)  $(du -k "$x" | cut -f1)K  $x"; done)
done
