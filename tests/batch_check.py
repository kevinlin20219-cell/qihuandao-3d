"""一批场景模型的通用检查：读导入报告 + 每个模型拍一张小图，拼成一张总览图（省 token：只看一张图）。
用法：python3 tests/batch_check.py <带 env_manifest 的 URL> <输出目录>
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont
URL, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
FONT = next((f for f in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"] if os.path.exists(f)), None)

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 960, "height": 600})
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}")); pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=60000)
        await pg.click("#start")
        for _ in range(300):
            if await pg.evaluate("!!__qhd.manifest"): break
            await asyncio.sleep(0.2)
        rep = await pg.evaluate("__qhd.manifest || []")
        print(f"{'id':<16}{'ok':<4}{'三角面':>7}{'mesh':>6}{'材质':>5}{'贴图':>5}{'实例':>5}{'藏灰盒':>7}{'藏COL':>6}  中心")
        for r in rep:
            print(f"{r['id']:<16}{'✓' if r['ok'] else '✗':<4}{r.get('triangles',0):>7}{r.get('meshes',0):>6}{r.get('materials',0):>5}{r.get('textures',0):>5}{r.get('instances',0):>5}{r.get('hiddenGray',0):>7}{r.get('colHidden',0):>6}  {r.get('center') or r.get('err')}")
        await pg.evaluate("(()=>{let n=__qhd.renderer.domElement; while(n&&n.parentElement){for(const c of n.parentElement.children) if(c!==n) c.style.visibility='hidden'; n=n.parentElement;}})(); __qhd.game.level.pickups.forEach(p=>{p.group.visible=true})")
        tiles = []
        for r in rep:
            if not r["ok"] or not r.get("center"): continue
            c = r["center"]; d = float(sys.argv[3]) if len(sys.argv) > 3 else 3.2
            await pg.evaluate(f"__qhd.camOverride={{pos:[{c[0]+d*0.3},{c[1]+d*0.45},{c[2]+d}],look:[{c[0]},{c[1]},{c[2]}]}}")
            await asyncio.sleep(1.2)
            p = f"{OUT}/{r['id']}.png"; await pg.screenshot(path=p); tiles.append((r["id"], p))
        await pg.evaluate("__qhd.camOverride=null")
        if tiles:
            W, H, cols = 320, 200, 3; rows = (len(tiles) + cols - 1) // cols
            sheet = Image.new("RGB", (W * cols, H * rows), (30, 30, 30)); dr = ImageDraw.Draw(sheet)
            font = ImageFont.truetype(FONT, 16) if FONT else None
            for i, (name, p) in enumerate(tiles):
                im = Image.open(p).resize((W, H)); x, y = (i % cols) * W, (i // cols) * H
                sheet.paste(im, (x, y)); dr.rectangle([x, y, x + len(name) * 9 + 8, y + 20], fill=(0, 0, 0)); dr.text((x + 4, y + 1), name, fill=(255, 255, 255), font=font)
            sheet.save(f"{OUT}/contact_sheet.png"); print("总览图:", f"{OUT}/contact_sheet.png")
        errs = [l for l in logs if "error" in l.lower()]
        print("errors:", errs[:8]); await b.close()
        sys.exit(1 if errs or not all(r["ok"] for r in rep) else 0)
asyncio.run(main())
