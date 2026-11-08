"""按 Codex 的 game_review_request.json 固定机位在游戏里出图（当前灯光 / 远景 / 泛光），并报告绘制次数、面数、报错，拼一张总览。
用法：python3 tests/review_views.py <URL> <game_review_request.json> <输出目录>
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
URL, REQ, OUT = sys.argv[1:4]; os.makedirs(OUT, exist_ok=True)
req = json.load(open(REQ)); vw = req.get("viewport", {"width": 1200, "height": 800})
if isinstance(vw, list): vw = {"width": vw[0], "height": vw[1]}
CH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CH, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport=vw); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=90000); await pg.click("#start")
        for _ in range(600):
            if await pg.evaluate("!!__qhd.manifest && __qhd.manifest.some(r=>r.id==='wind'||r.id==='legacy_instances')"): break
            await asyncio.sleep(0.3)
        rep = await pg.evaluate("__qhd.manifest || []")
        for r in rep: print("  ", json.dumps(r, ensure_ascii=False))
        await pg.evaluate("(()=>{let n=__qhd.renderer.domElement; while(n&&n.parentElement){for(const c of n.parentElement.children) if(c!==n) c.style.visibility='hidden'; n=n.parentElement;}})()")
        # 角色站在门外踏石之间，固定位置
        await pg.evaluate("(()=>{const g=__qhd.game,a=g.leader; a.teleport(a.pos.clone().set(0,0.05,21.0),Math.PI); ['hanhan','paipai'].forEach((id,i)=>g.actors[id].teleport(a.pos.clone().set(i?1.4:-1.4,0.05,22.2),Math.PI));})()")
        info = await pg.evaluate("({fov: (()=>{let c=null; return 55})(), pr: __qhd.renderer.getPixelRatio(), q: new URLSearchParams(location.search).get('quality')||'auto'})")
        tiles = []
        for v in req["views"]:
            await pg.evaluate("__qhd.game.openGate ? (%s) : 0" % ("__qhd.game.openGate(true)" if v.get("gate") != "closed" else "(()=>{const G=__qhd.game.level.gate; G.open=0; G.opening=false; G.crack=0; __qhd.game.gateOpen=false;})()"))
            if v.get("at"):  # 站位视角：领队瞬移到 at=[x,z]（朝 yaw），镜头在身后 4.5 m、高 2.4 m
                x, z = v["at"]; yaw = v.get("yaw", 3.14159)
                await pg.evaluate(f"(()=>{{const g=__qhd.game,a=g.leader; __qhd.camOverride=null; a.teleport(a.pos.clone().set({x},6,{z}),{yaw});}})()"); await asyncio.sleep(1.5)
                await pg.evaluate(f"(()=>{{const p=__qhd.game.leader.pos,fx=Math.sin({yaw}),fz=Math.cos({yaw}); __qhd.camOverride={{pos:[p.x-fx*4.5,p.y+2.4,p.z-fz*4.5],look:[p.x+fx*6,p.y+1,p.z+fz*6]}};}})()")
            else: await pg.evaluate(f"__qhd.camOverride={{pos:{v['pos']},look:{v['look']}}}")
            await asyncio.sleep(2.5)
            st = await pg.evaluate("({zones: __qhd.zones ? __qhd.zones.shown : -1, calls:__qhd.frameStats.calls, tris:__qhd.frameStats.triangles, text: __qhd.game.level.gate.text?__qhd.game.level.gate.text.visible:null, plaque: __qhd.game.level.gate.textExtra.map(o=>o.visible)})")
            f = f"{OUT}/{v['id']}.png"; await pg.screenshot(path=f); tiles.append((v["id"], f, st))
            print(f"{v['id']:<30} 分区显示 {st['zones']} 绘制 {st['calls']:>4}  三角形 {st['tris']:>7}  刻字 {st['text']} 底板 {st['plaque']}", flush=True)
        print("画质", info, "泛光", "开" if info["pr"] >= 1.0 else "关", "errors:", errs[:5])
        W, H = 600, 400; cols = 3; rows = (len(tiles) + cols - 1) // cols
        s = Image.new("RGB", (W * cols, H * rows)); d = ImageDraw.Draw(s)
        for i, (t, f, st) in enumerate(tiles):
            x, y = (i % cols) * W, (i // cols) * H; s.paste(Image.open(f).resize((W, H)), (x, y)); d.rectangle([x, y, x + 330, y + 18], fill=(0, 0, 0)); d.text((x + 4, y + 3), f"{t}  draw {st['calls']} tri {st['tris']//1000}k", fill=(255, 255, 0))
        s.save(f"{OUT}/sheet.png"); await b.close()
asyncio.run(main())
