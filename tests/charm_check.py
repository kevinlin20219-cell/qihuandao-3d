"""派派书包挂件检查：新旧两版，静止 + 欢呼时从背后近拍书包，拼成一张图；报 mesh/材质/贴图/draw call。
用法：python3 tests/charm_check.py <根 URL> <输出目录> <旧 GLB> <新 GLB>
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ROOT, OUT, OLD, NEW = sys.argv[1:5]; os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
async def run(pw, glb, tag):
    b = await pw.chromium.launch(executable_path=CHROME, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = await b.new_page(viewport={"width": 800, "height": 600}); logs = []
    pg.on("pageerror", lambda e: logs.append(str(e))); pg.on("console", lambda m: logs.append(m.text) if m.type == "error" else None)
    await pg.goto(f"{ROOT}?model_paipai={glb}"); await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
    for _ in range(200):
        if await pg.evaluate("!!(__qhd.models&&__qhd.models.paipai&&__qhd.game.actors.paipai.anim)"): break
        await asyncio.sleep(0.2)
    await pg.keyboard.press("Digit3"); await asyncio.sleep(1.5)
    await pg.evaluate("(()=>{let n=__qhd.renderer.domElement; while(n&&n.parentElement){for(const c of n.parentElement.children) if(c!==n) c.style.visibility='hidden'; n=n.parentElement;}})()")
    info = await pg.evaluate("(()=>{const a=__qhd.game.actors.paipai; let sk=0, culled=0; a.model.traverse(o=>{if(o.isSkinnedMesh){sk++; if(o.frustumCulled) culled++;}}); return {...__qhd.models.paipai, skinned:sk, frustumCulledOn:culled, calls:__qhd.renderer.info.render.calls}})()")
    cam = """(()=>{const a=__qhd.game.actors.paipai, p=a.pos, y=a.yaw; const bx=p.x+Math.sin(y)*-0.95, bz=p.z+Math.cos(y)*-0.95;
      __qhd.camOverride={pos:[bx+0.35,p.y+1.15,bz],look:[p.x,p.y+0.85,p.z]};})()"""
    await pg.evaluate(cam); await asyncio.sleep(1.2)
    await pg.screenshot(path=f"{OUT}/{tag}_idle.png")
    await pg.evaluate("__qhd.game.actors.paipai.playOnce('cheer')"); await asyncio.sleep(1.6)
    await pg.evaluate(cam); await asyncio.sleep(0.3)
    await pg.screenshot(path=f"{OUT}/{tag}_cheer.png")
    await b.close(); return info, logs
async def main():
    async with async_playwright() as pw:
        res = {}
        for glb, tag in [(OLD, "old"), (NEW, "new")]:
            info, logs = await run(pw, glb, tag); res[tag] = info
            print(tag, json.dumps({k: info.get(k) for k in ["triangles", "meshes", "materials", "textures", "skinned", "frustumCulledOn", "calls", "clips"]}, ensure_ascii=False), "errors:", logs[:4])
        W, H = 400, 300; sheet = Image.new("RGB", (W * 2, H * 2)); d = ImageDraw.Draw(sheet)
        for r, tag in enumerate(["old", "new"]):
            for c, s in enumerate(["idle", "cheer"]):
                sheet.paste(Image.open(f"{OUT}/{tag}_{s}.png").resize((W, H)), (c * W, r * H)); d.rectangle([c * W, r * H, c * W + 90, r * H + 18], fill=(0, 0, 0)); d.text((c * W + 4, r * H + 3), f"{tag} {s}", fill=(255, 255, 255))
        sheet.save(f"{OUT}/contact_sheet.png")
asyncio.run(main())
