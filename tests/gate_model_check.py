"""自动试玩：用真实按键走完第一章灰盒样段，并截图。
用法：python3 tests/playthrough.py <URL> <截图目录>
"""
import asyncio, sys, os, math, json, time
from playwright.async_api import async_playwright

URL = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 760})
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(URL)
        await pg.wait_for_selector("#start:not([disabled])", timeout=60000)
        await pg.screenshot(path=f"{OUT}/00_title.png")
        await pg.click("#start")
        await asyncio.sleep(1.5)
        n = [0]

        async def st():
            return await pg.evaluate("({stage: __qhd.game.stage, active: __qhd.game.active, p: __qhd.game.leader.pos.toArray(), wind: __qhd.game.wind.phase, falls: __qhd.game.falls, fps: __qhd.fps, cine: !!__qhd.game.cinematic, say: document.querySelector('#say').hidden ? '' : document.querySelector('#say').innerText})")

        async def shot(tag):
            n[0] += 1
            s = await st()
            await pg.screenshot(path=f"{OUT}/{n[0]:02d}_{tag}.png")
            print(f"{n[0]:02d} {tag:18s} stage={s['stage']} active={s['active']} pos={[round(v,1) for v in s['p']]} fps={s['fps']} say={s['say'][:40]!r}", flush=True)

        async def face(x, z):
            await pg.evaluate(f"(()=>{{const p=__qhd.game.leader.pos; __qhd.cam.yaw=Math.atan2(-( {x} - p.x), -( {z} - p.z));}})()")

        async def walk_to(x, z, tol=0.5, timeout=25, run=False, wind_safe=False):
            t0 = time.time()
            held = False
            if run: await pg.keyboard.down("ShiftLeft")
            while time.time() - t0 < timeout:
                s = await st()
                px, pz = s["p"][0], s["p"][2]
                d = math.hypot(x - px, z - pz)
                if d < tol: break
                if wind_safe and s["wind"] != "calm":
                    if held: await pg.keyboard.up("KeyW"); held = False
                    await asyncio.sleep(0.15); continue
                await face(x, z)
                if not held: await pg.keyboard.down("KeyW"); held = True
                await asyncio.sleep(0.08)
            if held: await pg.keyboard.up("KeyW")
            if run: await pg.keyboard.up("ShiftLeft")
            await asyncio.sleep(0.25)

        async def press(k, wait=0.4):
            await pg.keyboard.press(k); await asyncio.sleep(wait)

        async def wait_stage(target, timeout=20):
            t0 = time.time()
            while time.time() - t0 < timeout:
                if (await st())["stage"] >= target: return True
                await asyncio.sleep(0.2)
            return False

        for _ in range(100):
            if await pg.evaluate("!!(window.__qhd.env && __qhd.env.gate)"): break
            await asyncio.sleep(0.2)
        info = await pg.evaluate("""(()=>{const G=__qhd.game.level.gate; let col=0,colVis=0; G.model.traverse(o=>{if(o.name.startsWith('COL_')){col++; let v=true; for(let p=o;p;p=p.parent) if(!p.visible) v=false; if(v) colVis++;}});
          return {env:__qhd.env.gate, left:G.left.name, right:G.right.name, grayVisible:G.gray.filter(o=>o.visible).length, pads:G.padVis.map(p=>p.name), text:G.text&&G.text.visible, col, colVis}})()""")
        print("gate model", json.dumps(info, ensure_ascii=False), flush=True)
        await shot("closed")
        await walk_to(-1.7, 18.2, tol=0.35)
        await asyncio.sleep(1.5)
        print("one pad", await pg.evaluate("({crack:__qhd.game.level.gate.crack, L:__qhd.game.level.gate.left.position.x, padY:__qhd.game.level.gate.padVis.map(p=>+p.position.y.toFixed(3))})"), flush=True)
        await shot("one_pad_crack")
        await press("KeyF", 0.3)
        for _ in range(200):
            if await pg.evaluate("__qhd.game.level.gate.pads.every(p=>p.occupant)"): break
            await asyncio.sleep(0.2)
        await press("KeyF", 0.05)
        for _ in range(40):
            if await pg.evaluate("!!__qhd.game.shout"): break
            await asyncio.sleep(0.05)
        for _ in range(1200):  # 按游戏时间等到「一」；场景重时软件渲染很慢，最多等 60 秒
            t = await pg.evaluate("__qhd.game.shout ? __qhd.game.shout.t : -1")
            if t < 0 or t >= 1.85: break
            await asyncio.sleep(0.05)
        await press("KeyE", 0.3)
        for _ in range(150):
            if await pg.evaluate("__qhd.game.level.gate.open >= 1"): break
            await asyncio.sleep(0.2)
        await asyncio.sleep(1.0)
        print("open", await pg.evaluate("({open:__qhd.game.level.gate.open, L:__qhd.game.level.gate.left.position.x, R:__qhd.game.level.gate.right.position.x, text:__qhd.game.level.gate.text&&__qhd.game.level.gate.text.visible})"), flush=True)
        await walk_to(0, 19.5, tol=0.4); await face(0, 10); await asyncio.sleep(0.6)
        await shot("open_text")
        await walk_to(0, 12, run=True)
        print("through", (await st())["p"], flush=True)
        await face(0, 20); await asyncio.sleep(0.6)
        await shot("back_side")
        print("errors:", [l for l in logs if "error" in l.lower()][:8], flush=True)
        await b.close()

asyncio.run(main())
