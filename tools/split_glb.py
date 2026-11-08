"""按字节拆 GLB（不重新编码，适合 Codex 已经压好 meshopt / 量化的 runtime 包）：
<名>.glb → <名>.json + <名>.bin.wasm；外部 shared/*.ktx2 贴图改名成 shared/*.wasm（只为发布页能上传）。
用法：python3 tools/split_glb.py <输出批次目录> <GLB或shared目录所在的源目录> <glb名> [...]
"""
import json, os, shutil, struct, sys

args = sys.argv[1:]
reuse = None  # --reuse <已发布批次名>：贴图已在那个批次的 shared/ 里，直接引用 ../<批次>/shared/，不重复上传
if "--reuse" in args: i = args.index("--reuse"); reuse = args[i + 1]; del args[i:i + 2]
out, src, names = args[0], args[1], args[2:]
os.makedirs(f"{out}/shared", exist_ok=True)
for n in names:
    b = open(f"{src}/{n}", "rb").read()
    assert b[:4] == b"glTF"
    off, js, bins = 12, None, None
    while off < len(b):
        ln, typ = struct.unpack_from("<II", b, off); data = b[off + 8: off + 8 + ln]
        if typ == 0x4E4F534A: js = json.loads(data)
        elif typ == 0x004E4942: bins = data
        off += 8 + ln
    base = n[:-4]
    if bins is not None:
        open(f"{out}/{base}.bin.wasm", "wb").write(bins)
        js["buffers"][0]["uri"] = f"{base}.bin.wasm"
    for im in js.get("images", []):
        u = im.get("uri")
        if not u: raise SystemExit(f"{n}: 内嵌贴图，不适用本工具")
        new = "shared/" + os.path.basename(u).rsplit(".", 1)[0][:16] + ".wasm"
        if reuse and os.path.exists(f"{out}/../{reuse}/{new}"): new = f"../{reuse}/{new}"
        elif not os.path.exists(f"{out}/{new}"): shutil.copyfile(f"{src}/{u}", f"{out}/{new}")
        im["uri"] = new; im["mimeType"] = "image/ktx2"
    open(f"{out}/{base}.json", "w").write(json.dumps(js, separators=(",", ":")))
    print(n, "→", base + ".json", len(bins or b""), "bytes bin,", len(js.get("images", [])), "images")
