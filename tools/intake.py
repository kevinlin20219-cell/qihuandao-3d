"""接收 Codex 一批交付：核对 SHA、拷到 incoming/<批次>/、打印精简报告。
用法：python3 tools/intake.py <清单 scene_manifest.json> <交付目录> [--compress]
--compress：拷完后每个 GLB 做 KTX2（颜色 ETC1S、法线 UASTC）+ meshopt 压缩，报告压缩前后体积
清单里每项 glb 是相对交付目录的路径；sha256 有写就核对。图标（icons）也一起拷。
输出：incoming/<batch>/ 下的模型 + 改写过路径的 scene_manifest.json
"""
import hashlib, json, os, shutil, sys
man_path, src = sys.argv[1], sys.argv[2]
compress = '--compress' in sys.argv
man = json.load(open(man_path, encoding='utf-8'))
dst = os.path.join(os.path.dirname(__file__), '..', '..', 'incoming', man['batch'])
os.makedirs(dst, exist_ok=True)
bad = 0
for it in man['items']:
    p = os.path.join(src, it['glb'])
    if not os.path.exists(p): print(f"✗ {it['id']}: 缺文件 {it['glb']}"); bad += 1; continue
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    ok = not it.get('sha256') or it['sha256'] == h
    if not ok: bad += 1
    shutil.copy(p, os.path.join(dst, os.path.basename(p))); it['glb'] = os.path.basename(p)
    print(f"{'✓' if ok else '✗ SHA 不符'} {it['id']:<16} {os.path.getsize(p)//1024:>5} KiB  {h[:12]}")
    if it.get('lod'):  # 远处低模也一起拷
        lp = os.path.join(src, it['lod']['glb'])
        if os.path.exists(lp): shutil.copy(lp, os.path.join(dst, os.path.basename(lp))); it['lod']['glb'] = os.path.basename(lp); print(f"  + LOD1 {os.path.basename(lp)} {os.path.getsize(lp)//1024} KiB")
        else: print(f"✗ 缺 LOD1 {it['lod']['glb']}"); bad += 1
for k, v in (man.get('icons') or {}).items():
    p = os.path.join(src, v)
    if os.path.exists(p): shutil.copy(p, os.path.join(dst, os.path.basename(p))); man['icons'][k] = os.path.basename(p)
    else: print(f"✗ 图标缺失 {v}"); bad += 1
if compress:
    import subprocess
    before = after = 0
    for f in sorted({os.path.basename(x['glb']) for x in man['items']} | {x['lod']['glb'] for x in man['items'] if x.get('lod')}):
        fp = os.path.join(dst, f); tmp = fp + '.tmp.glb'; before += os.path.getsize(fp)
        r = subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'ktx2_compress.mjs'), fp, tmp, '--etc1s', '--meshopt'] + (['--lin1k'] if '--lin1k' in sys.argv else []), capture_output=True, text=True)
        if r.returncode: print('✗ 压缩失败', f, r.stderr[-300:]); bad += 1; continue
        os.replace(tmp, fp); after += os.path.getsize(fp)
    print(f"压缩：{before/1048576:.2f} MB → {after/1048576:.2f} MB")
json.dump(man, open(os.path.join(dst, 'scene_manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"→ incoming/{man['batch']}/  共 {len(man['items'])} 项，问题 {bad}")
sys.exit(1 if bad else 0)
