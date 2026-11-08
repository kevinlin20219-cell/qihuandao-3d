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

        await shot("start")
        # 入口双锁石门：站上左踏石 → F 派人踩右踏石 → F 喊口令 → 「一」时按 E
        await walk_to(-1.7, 18.2, tol=0.35)
        await press("KeyF", 0.3)
        for _ in range(200):
            if await pg.evaluate("__qhd.game.level.gate.pads.every(p=>p.occupant)"): break
            await asyncio.sleep(0.2)
        await shot("gate_both")
        await press("KeyF", 0.05)
        for _ in range(40):
            if await pg.evaluate("!!__qhd.game.shout"): break
            await asyncio.sleep(0.05)
        for _ in range(200):
            t = await pg.evaluate("__qhd.game.shout ? __qhd.game.shout.t : -1")
            if t < 0 or t >= 1.85: break
            await asyncio.sleep(0.05)
        await press("KeyE", 0.3)
        for _ in range(100):
            if await pg.evaluate("__qhd.game.level.gate.open >= 1"): break
            await asyncio.sleep(0.2)
        print("gate", await pg.evaluate("({opening:__qhd.game.level.gate.opening, open:__qhd.game.level.gate.open})"), flush=True)
        await shot("gate_open")
        await walk_to(0, 12, run=True)
        # 西边死路
        await walk_to(-24.2, -7.9, tol=0.6, run=True, timeout=70)
        await shot("west_deadend")
        for _ in range(3):  # 捡铁钩（截图后第一下按键可能丢）
            await press("KeyE", 0.6)
            if await pg.evaluate("__qhd.game.bag.includes('iron_hook')"): break
        print("bag", await pg.evaluate("__qhd.game.bag"), flush=True)
        await walk_to(-10, -8, run=True, timeout=50)
        # 派派观察
        await press("Digit3")
        await walk_to(0, -11.2, run=True)
        await press("KeyQ", 1.2)
        await shot("paipai_observe")
        await press("KeyQ")
        await walk_to(0, -13.8)
        await press("KeyE", 2.0)
        await shot("vines_open")
        await walk_to(1.2, -15.6, tol=0.5)
        for _ in range(3):  # 捡藤条
            await press("KeyE", 0.6)
            if await pg.evaluate("__qhd.game.bag.includes('vine_rope')"): break
        print("bag", await pg.evaluate("__qhd.game.bag"), flush=True)
        # 非汤团推巨石
        await walk_to(0, -27.6, run=True)
        await press("KeyE", 1.2)
        await shot("paipai_cant_push")
        # 汤团推
        await press("Digit1", 1.0)
        await walk_to(0, -27.9, tol=0.35, timeout=30)
        await face(0, -40)
        await pg.keyboard.down("KeyE"); await pg.keyboard.down("KeyW")
        ok = False
        for _ in range(450):
            await asyncio.sleep(0.1)
            if (await st())["stage"] >= 3: ok = True; break
            await face(0, -40)
        await pg.keyboard.up("KeyW"); await pg.keyboard.up("KeyE")
        if not ok:
            await asyncio.sleep(4)
        await wait_stage(3, 10)
        await shot("boulder_gone")
        # 机关透视
        await walk_to(0, -29.2)
        await press("KeyQ", 1.5)
        await shot("xray")
        # 做钩绳、装到绳扣上
        await walk_to(0, -40.3, tol=0.5, run=True)
        await press("KeyE", 1.0)
        print("bag", await pg.evaluate("__qhd.game.bag"), flush=True)
        await walk_to(2.6, -47.8, tol=0.5)
        await press("KeyE", 1.0)
        print("rope fixed", await pg.evaluate("__qhd.game.level.ropeclipFix.fixed"), flush=True)
        await shot("rope_fixed")
        # 涵涵号令
        await press("Digit2", 1.0)
        await walk_to(-4.0, -45.0, run=True)
        await press("KeyQ", 0.6)
        await walk_to(4.0, -45.0, run=True)
        await press("KeyQ", 0.6)
        # 换人再换回来：已派出的伙伴不能跟着走
        await press("Digit1", 0.8); await press("Digit2", 0.8)
        await shot("commands")
        await walk_to(2.6, -48.6, tol=0.35)
        await asyncio.sleep(1.5)
        await shot("three_points")
        # 口令：先故意早按（应失败、阶段不变），再按「一」的时机按 E
        for _ in range(400):  # 等三处都有人（伙伴可能还在走过去）
            if await pg.evaluate("__qhd.game.level.pads.every(p=>p.occupant)"): break
            await asyncio.sleep(0.2)
        print("pads", await pg.evaluate("__qhd.game.level.pads.map(p=>p.occupant)"), flush=True)
        print("tangtuan", await pg.evaluate("(()=>{const a=__qhd.game.actors.tangtuan;return {pos:a.pos.toArray().map(v=>+v.toFixed(2)), goal:a.goal&&a.goal.toArray(), holding:a.holding, lockYaw:a.lockYaw, vel:a.vel.toArray().map(v=>+v.toFixed(2))}})()"), flush=True)
        await press("KeyF", 0.05)
        for _ in range(40):
            if await pg.evaluate("!!__qhd.game.shout"): break
            await asyncio.sleep(0.05)
        print("shout started", await pg.evaluate("JSON.stringify(__qhd.game.shout)"), (await st())["say"], await pg.evaluate("__qhd.game.level.pads.map(p=>p.occupant)"), await pg.evaluate("[__qhd.game.stage, !!__qhd.game.cinematic, document.querySelector(\"#pause\")?.hidden]"), flush=True)
        await press("KeyE", 0.8)
        print("after early E shout =", await pg.evaluate("JSON.stringify(__qhd.game.shout)"), "fails =", await pg.evaluate("__qhd.game.shoutFails"), flush=True)
        s_early = (await st())["stage"]; print("early_press_stage", s_early, flush=True)
        await asyncio.sleep(2.5)
        await press("KeyF", 0.05)
        for _ in range(40):
            if await pg.evaluate("!!__qhd.game.shout"): break
            await asyncio.sleep(0.05)
        # 按游戏内的倒数时间等到「一」（软件渲染帧率低，不能按真实秒数等）
        shot_done = False
        for _ in range(200):
            t = await pg.evaluate("__qhd.game.shout ? __qhd.game.shout.t : -1")
            if t < 0: break
            if t > 1.0 and not shot_done: await shot("shout_countdown"); shot_done = True
            if t >= 1.85: break
            await asyncio.sleep(0.05)
        await press("KeyE", 0.3)
        await wait_stage(5, 15)
        await asyncio.sleep(1.5)
        await shot("bridge_raising")
        while (await st())["cine"]: await asyncio.sleep(0.3)
        await asyncio.sleep(1.0)
        await shot("bridge_up")
        # 过桥：起风时停下
        await walk_to(0, -48.6)
        await walk_to(0, -51.5)
        for z in [-55, -59, -63, -67, -71, -75, -77]:
            await walk_to(0, z, timeout=30, wind_safe=True)
            s = await st()
            if s["wind"] != "calm" and z in (-59, -67):
                await shot(f"bridge_wind_{abs(z)}")
        await asyncio.sleep(2.5)
        await shot("far_side")
        # 苔鹿：涵涵在粉色圈旁 F 派派派，在左苔花旁 F 派汤团，然后到鹿面前等它低头按 E
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
        await asyncio.sleep(6.5)
        done = await pg.evaluate("!document.querySelector('#done').hidden")
        await shot("done" if done else "not_done")
        s = await st()
        print(json.dumps({"done": done, "falls": s["falls"], "stage": s["stage"]}))
        errs = [l for l in logs if "error" in l.lower()]
        print("errors:", errs[:10])
        await b.close()

asyncio.run(main())
