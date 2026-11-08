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

        await pg.evaluate("(()=>{const g=__qhd.game; g.openGate(true); g.fixRopeclip(true); g.applyStage(5); const a=g.leader; a.teleport(new THREE.Vector3(0,1.6,-78.5), Math.PI);})()".replace("new THREE.Vector3", "a.pos.clone().set"))
        await asyncio.sleep(2)
        for a in ["tangtuan","paipai","hanhan"]:
            await pg.evaluate(f"(()=>{{const g=__qhd.game; const a=g.actors['{a}']; if(a!==g.leader) a.teleport(g.leader.pos.clone().add(a.pos.clone().set({ {"tangtuan":-1,"paipai":1,"hanhan":0}[a]},0,1)));}})()")
        await asyncio.sleep(1)
        await shot("meet")
        print("deer stage", await pg.evaluate("__qhd.game.stage"), flush=True)
        await press("Digit2", 0.8)
        await walk_to(-1.5, -81.2, tol=0.5)
        await press("KeyF", 0.6)
        await walk_to(-3.2, -80.6, tol=0.5)
        await press("KeyF", 0.6)
        await walk_to(0.3, -82.0, tol=0.4)
        for _ in range(300):
            st2 = await pg.evaluate("(()=>{const D=__qhd.game.level.deerState;return {low:D.low, calm:!!D.calmPad.occupant, lure:__qhd.game.level.lures.map(p=>p.occupant)}})()")
            if st2["low"] > 0.85 and st2["calm"]: break
            await asyncio.sleep(0.2)
        print("deer before E", st2, flush=True)
        await shot("deer_low")
        await press("KeyE", 0.5)
        print("deer freed", await pg.evaluate("__qhd.game.level.deerState.freed"), "leaves", await pg.evaluate("__qhd.game.leaves"), flush=True)
        for _ in range(300):
            if await pg.evaluate("!document.querySelector('#done').hidden"): break
            await asyncio.sleep(0.2)
        done = await pg.evaluate("!document.querySelector('#done').hidden")
        print("game time stage", await pg.evaluate("[__qhd.game.stage, __qhd.game.level.deerState.leave]"), flush=True)
        await shot("done" if done else "not_done")
        print(json.dumps({"done": done}), "errors:", [l for l in logs if "error" in l.lower()][:8], flush=True)
        await b.close()

asyncio.run(main())
