"""SSD 同步准备：把 game/ 里改过的源码 / 测试 / 工具和 Claude 的文档拷到 outputs 暂存区，打印 device_commit_files 用的 files 列表。
用法：python3 tools/sync_stage.py [额外文件(相对项目根，如 docs/协作/消息/0046_xxx.md) ...]
只比对 game/{src,tests,tools,index.html,package.json,vite.config.ts} 与上次同步记录（game/tools/.synced.json）。成功提交后运行：python3 tools/sync_stage.py --done
"""
import hashlib, json, os, shutil, sys
G = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(G)
OUT = "/mnt/user-data/outputs/qhd3d"; DEV = "~/mnt/奇幻岛游戏/奇幻岛3D重制_20261026"; REC = f"{G}/tools/.synced.json"
if sys.argv[1:2] == ["--done"]: os.replace(REC + ".pending", REC); print("✓ 已记录同步"); sys.exit(0)
rec = json.load(open(REC)) if os.path.exists(REC) else {}
cand = []
for d in ["src", "tests", "tools", "public"]:
    for dp, _, fs in os.walk(f"{G}/{d}"):
        cand += [os.path.relpath(os.path.join(dp, f), ROOT) for f in fs if not f.startswith(".") and "__pycache__" not in dp]
cand += [f"game/{f}" for f in ["index.html", "package.json", "vite.config.ts"] if os.path.exists(f"{G}/{f}")]
now, files = {}, []
for rel in cand:
    h = hashlib.sha1(open(f"{ROOT}/{rel}", "rb").read()).hexdigest(); now[rel] = h
    if rec.get(rel) != h:
        os.makedirs(os.path.dirname(f"{OUT}/{rel}"), exist_ok=True); shutil.copy(f"{ROOT}/{rel}", f"{OUT}/{rel}")
        files.append({"stagedPath": f"{OUT}/{rel}", "devicePath": f"{DEV}/{rel}"})
for rel in sys.argv[1:]:  # 文档：已在 outputs 里编辑好的
    files.append({"stagedPath": f"{OUT}/{rel}", "devicePath": f"{DEV}/{rel}"})
json.dump({**rec, **now}, open(REC + ".pending", "w"))
print(f"✓ 要同步 {len(files)} 个文件" + ("（超过 50，分两次提交）" if len(files) > 50 else ""))
print(json.dumps(files, ensure_ascii=False))
