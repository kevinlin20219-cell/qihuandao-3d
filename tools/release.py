"""一键发布准备：构建 → 重做发布包（pub/）→ 冒烟测试 → 列出这次要上传的文件 → 备好 SSD 同步清单。
用法：python3 tools/release.py <pub 目录> [批次名 ...]
  批次 = incoming/<批次>/scene_manifest.json（intake.py 生成），模型改名 .wasm 放进 pub/models/<批次>/
输出最后一行是 JSON：{"files": {发布路径: 本地路径 | null}}，直接用于 Artifact 发布的 files 参数。
"""
import hashlib, json, os, re, shutil, subprocess, sys
G = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(G)
if sys.argv[1] == "--done":  # 发布成功后：把待定记录转正
    p = sys.argv[2] + "/.published.json"; os.replace(p + ".pending", p); print("✓ 已记录本次发布"); sys.exit(0)
pub, batches = sys.argv[1], sys.argv[2:]
def sh(c, **k): r = subprocess.run(c, shell=True, cwd=G, capture_output=True, text=True, **k); return r
r = sh("npx tsc --noEmit -p . && npx vite build")
if r.returncode: print(r.stdout[-1500:], r.stderr[-1500:]); sys.exit("✗ 构建失败")
print("✓ 构建")
# 1) 前端代码：换成新的 assets/*.js
old_js = set(os.listdir(f"{pub}/assets")) if os.path.isdir(f"{pub}/assets") else set()
os.makedirs(f"{pub}/assets", exist_ok=True)
new_js = {f for f in os.listdir(f"{G}/dist/assets") if f.endswith(".js")}
for f in new_js: shutil.copy(f"{G}/dist/assets/{f}", f"{pub}/assets/{f}")
for f in old_js - new_js: os.remove(f"{pub}/assets/{f}")
# KTX2 贴图解码器（public/basis → dist/basis）；.wasm 用 application/wasm 上传
if os.path.isdir(f"{G}/dist/basis"):
    os.makedirs(f"{pub}/basis", exist_ok=True)
    for f in os.listdir(f"{G}/dist/basis"): shutil.copy(f"{G}/dist/basis/{f}", f"{pub}/basis/{f}")
# 开场动画旁白等音频（public/audio → dist/audio → pub/audio）
if os.path.isdir(f"{G}/dist/audio"):
    shutil.copytree(f"{G}/dist/audio", f"{pub}/audio", dirs_exist_ok=True)
# 2) 场景批次
defaults = json.load(open(f"{G}/tools/pub_defaults.json"))
for bt in batches:
    src = f"{ROOT}/incoming/{bt}"; man = json.load(open(f"{src}/scene_manifest.json", encoding="utf-8"))
    os.makedirs(f"{pub}/models/{bt}", exist_ok=True)
    for it in man["items"]:
        w = re.sub(r"\.glb$", ".wasm", it["glb"]); shutil.copy(f"{src}/{it['glb']}", f"{pub}/models/{bt}/{w}"); it["glb"] = w
        if it.get("lod"):
            lw = re.sub(r"\.glb$", ".wasm", it["lod"]["glb"]); shutil.copy(f"{src}/{it['lod']['glb']}", f"{pub}/models/{bt}/{lw}"); it["lod"]["glb"] = lw
    for k, v in (man.get("icons") or {}).items(): shutil.copy(f"{src}/{v}", f"{pub}/models/{bt}/{v}")
    # share_textures.mjs 的产物：模型 .json 引用的网格数据 *.bin.wasm 和共享贴图 shared/*.wasm
    for dp, _, fs in os.walk(src):
        for f in fs:
            if f.endswith(".bin.wasm") or os.path.basename(dp) == "shared":
                rel = os.path.relpath(os.path.join(dp, f), src); os.makedirs(os.path.dirname(f"{pub}/models/{bt}/{rel}"), exist_ok=True); shutil.copy(os.path.join(dp, f), f"{pub}/models/{bt}/{rel}")
    json.dump(man, open(f"{pub}/models/{bt}/scene_manifest.json", "w", encoding="utf-8"), ensure_ascii=False)
# 配音包（tools/pack_voice.py 的产物）：按原样放进 pub/voice/<批次>/，索引地址写进默认参数
for vb in [b for b in sorted(os.listdir(f"{ROOT}/incoming")) if b.startswith("voice_ch") and os.path.exists(f"{ROOT}/incoming/{b}/voice_index.json")]:
    os.makedirs(f"{pub}/voice/{vb}", exist_ok=True)
    for f in os.listdir(f"{ROOT}/incoming/{vb}"): shutil.copy(f"{ROOT}/incoming/{vb}/{f}", f"{pub}/voice/{vb}/{f}")
    defaults["voice_index"] = f"voice/{vb}/voice_index.json"
if batches: defaults["env_manifest"] = ",".join(f"models/{bt}/scene_manifest.json" for bt in batches)  # 多个清单按顺序加载
html = open(f"{G}/dist/index.html", encoding="utf-8").read()
html = html.replace("</head>", f"<script>window.__DEFAULT_MODELS={json.dumps(defaults, ensure_ascii=False)};</script></head>", 1)
open(f"{pub}/index.html", "w", encoding="utf-8").write(html)
print("✓ 发布包", pub, "默认：", ", ".join(defaults))
# 3) 这次变了哪些文件（和上次发布记录比）
rec_p = f"{pub}/.published.json"; rec = json.load(open(rec_p)) if os.path.exists(rec_p) else {}
now = {}
for d, _, fs in os.walk(pub):
    for f in fs:
        if f.startswith("."): continue
        p = os.path.relpath(os.path.join(d, f), pub)
        if p == "index.html": continue
        now[p] = hashlib.sha1(open(os.path.join(d, f), "rb").read()).hexdigest()
files = {p: ({"from": os.path.join(pub, p), "contentType": "application/wasm"} if p.endswith(".wasm") else os.path.join(pub, p)) for p, h in now.items() if rec.get(p) != h}
# 旧的模型文件不删（可能是更早的对话发布的，删除会被拒绝）；只删旧的 js
files.update({p: None for p in rec if p not in now and not p.startswith("models/")})
json.dump(now, open(rec_p + ".pending", "w"))
print(f"✓ 要上传 {sum(v is not None for v in files.values())} 个、删除 {sum(v is None for v in files.values())} 个（发布成功后运行：python3 tools/release.py --done {pub}）")
print(json.dumps({"files": files}, ensure_ascii=False))
