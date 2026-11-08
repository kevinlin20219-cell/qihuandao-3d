"""把 Codex 交来的逐句配音 MP3 打成几个大包（发布页文件数有上限），附索引。
用法：python3 tools/pack_voice.py <交付目录(含 voice_manifest.json)> <输出 incoming/批次>
索引：{"lines": {"<角色>|<规范化台词>": [包号, 起点, 字节数, 秒数, 编号]}, "packs": ["voice_0.wasm", ...]}"""
import json, os, re, sys
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
man = json.load(open(f"{src}/voice_manifest.json", encoding="utf-8"))
def norm(t): return re.sub(r"[\s，。、；：！？…—,.;:!?“”\"'（）()《》「」·~～]", "", re.sub(r"[（(][^）)]*[）)]", "", t))
LIM = 2_000_000; packs, cur, lines = [], bytearray(), {}
def flush():
    global cur
    if cur: n = f"voice_{len(packs)}.wasm"; open(f"{out}/{n}", "wb").write(cur); packs.append(n); cur = bytearray()
for it in man["items"]:
    b = open(f"{src}/{it['file']}", "rb").read()
    if len(cur) + len(b) > LIM: flush()
    k = f"{it['character']}|{norm(it['text'])}"
    if k in lines: print("重复台词（用第一条）", it["id"], it["text"]); continue
    lines[k] = [len(packs), len(cur), len(b), round(it["duration_seconds"], 2), it["id"]]; cur += b
flush()
json.dump({"lines": lines, "packs": packs}, open(f"{out}/voice_index.json", "w", encoding="utf-8"), ensure_ascii=False)
print(len(lines), "句，", len(packs), "个包")
