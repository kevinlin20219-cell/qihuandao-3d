"""C3 追踪水痕：三处线索要派派举放大镜才看得出；别人按 Q / 走近只会提示换派派；三处看完对岸出现佑佑、北北；存档能续上；离开章节伙伴被释放。
用法：python3 tests/ch2_tracks_check.py <url> <输出目录>    （url 带 ?intro=0&quality=low&warm=0）"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
STATE = """(()=>{const g=__qhd.game, T=g.ch2Tracks; return {
  chapter:g.chapter, stage:g.ch2Stage, active:g.active, observing:g.observing,
  found: T ? T.clues.filter(c=>c.found).map(c=>c.id) : null, friends:g.ch2Friends.length,
  friendPos: g.ch2Friends.map(a=>{const O=g.ch2.world(0,0,0),p=a.pos; return [+(p.x-O.x).toFixed(1),+p.y.toFixed(2),+(p.z-O.z).toFixed(1)];}),
  objective: document.getElementById('objective').innerText.replace(/\\s+/g,' '),
  say: document.getElementById('say').hidden ? '' : document.getElementById('say').innerText.replace(/\\s+/g,' '),
  keys: document.getElementById('keys').innerText.replace(/\\s+/g,' '),
  colliders: __qhd.ph.world.colliders.len(), bodies: __qhd.ph.world.bodies.len(),
  save: (JSON.parse(localStorage.getItem('qhd3d_save_v2')||'{}').chapters||{}).ch2 || null};})()"""

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 960, "height": 540}); pg.set_default_timeout(300000); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=600000)
        await pg.evaluate("localStorage.removeItem('qhd3d_save_v2')")
        await pg.click("#start"); await pg.evaluate("window.__qhdManual=true")
        for _ in range(600):
            if await pg.evaluate("!!(window.__qhd && __qhd.manifest && __qhd.manifest.some(r=>r.id==='wind'||r.id==='legacy_instances'))"): break
            await asyncio.sleep(1)
        await asyncio.sleep(5)
        async def step(n=1, dt=1/30):
            await pg.evaluate(f"(()=>{{window.__qhdFixedDt={dt}; for(let i=0;i<{n};i++) __qhdStep(); window.__qhdFixedDt=1/30;}})()")
        async def key(k):
            await pg.keyboard.down(k); await step(1); await pg.keyboard.up(k); await step(1)
        async def tp(x, z, yaw=0):
            await pg.evaluate(f"(()=>{{const g=__qhd.game; g.leader.teleport(g.ch2.world({x},0.05,{z}),{yaw});}})()"); await step(3)
        async def st(): return await pg.evaluate(STATE)
        log = {}
        for _ in range(20):
            await step(1)
        base_cols = (await st())["colliders"]
        await pg.evaluate("__qhdChapter('ch2')"); await step(4)
        log["enter"] = await st()

        # 1) 汤团（默认）走到断枝旁：只提示换派派；按 Q 也不算找到
        await tp(-11.2, 15.6); await step(10, 0.1)
        log["tangtuan_near"] = await st()
        await key("KeyQ"); await step(6, 0.1)
        log["tangtuan_q"] = await st()
        # 2) 换派派，在没有线索的地方举放大镜：不算
        await key("Digit3"); await tp(-16, 24); await key("KeyQ"); await step(6, 0.1)
        log["paipai_q_nothing"] = await st()
        # 3) 三处线索：举着放大镜走过去
        shots = []
        for i, (x, z) in enumerate([(-11.2, 15.8), (-8.4, 4.9), (-9.3, -7.4)]):
            await tp(x, z, 0); await step(8, 0.1)
            log[f"clue{i+1}"] = await st()
            await pg.evaluate(f"(()=>{{const g=__qhd.game,O=g.ch2.world(0,0,0); __qhd.camOverride={{pos:[O.x+{x}+2.2,3.2,O.z+{z}+3.6],look:[O.x+{x}-0.6,0,O.z+{z}-0.6]}};}})()")
            await step(2); await pg.screenshot(path=f"{OUT}/0{i+1}_clue.png"); await pg.evaluate("__qhd.camOverride=null")
        await step(20, 0.1)
        log["after3"] = await st()
        # 对岸的佑佑、北北
        await pg.evaluate("(()=>{const g=__qhd.game,O=g.ch2.world(0,0,0); __qhd.camOverride={pos:[O.x-8.5,2.6,O.z-6.0],look:[O.x+13,0.8,O.z-10]};})()")
        await step(3); await pg.screenshot(path=f"{OUT}/04_friends.png"); await pg.evaluate("__qhd.camOverride=null")
        # 4) 回第一章：伙伴和第二章碰撞都释放；再进第二章：进度续上
        await pg.evaluate("__qhdChapter('ch1')"); await step(3)
        log["back_ch1"] = await st()
        await pg.evaluate("__qhdChapter('ch2')"); await step(4)
        log["reenter"] = await st()
        await pg.evaluate("__qhdChapter('ch1')"); await step(3)
        log["back_ch1_2"] = await st()
        await b.close()

    L = log
    res = {
        "errors": errs, "base_colliders": base_cols, "log": L,
        "start_objective_0of3": "0/3" in L["enter"]["objective"] and L["enter"]["stage"] == "tracks",
        "others_cannot_find": L["tangtuan_q"]["found"] == [] and "派派" in (L["tangtuan_near"]["say"] + L["tangtuan_q"]["say"]),
        "nothing_here": L["paipai_q_nothing"]["found"] == [] and L["paipai_q_nothing"]["observing"] and L["paipai_q_nothing"]["active"] == "paipai",
        "found_in_order": [len(L[f"clue{i}"]["found"]) for i in (1, 2, 3)] == [1, 2, 3],
        "spotted": L["after3"]["stage"] == "spotted" and L["after3"]["friends"] == 2,
        "friends_on_east_bank": all(p[0] > 6 and abs(p[1]) < 0.2 for p in L["after3"]["friendPos"]),
        "save_ok": (L["after3"]["save"] or {}).get("stage") == "spotted" and len((L["after3"]["save"] or {}).get("clues", [])) == 3,
        "leave_releases_all": L["back_ch1"]["friends"] == 0 and L["back_ch1"]["colliders"] == base_cols and L["back_ch1_2"]["colliders"] == base_cols,
        "reenter_restores": L["reenter"]["stage"] == "spotted" and len(L["reenter"]["found"]) == 3 and L["reenter"]["friends"] == 2,
        "q_key_shown_for_paipai": "细节之眼" in L["paipai_q_nothing"]["keys"] or "收起放大镜" in L["paipai_q_nothing"]["keys"],
    }
    res["pass"] = all(v for k, v in res.items() if k not in ("errors", "log", "base_colliders")) and not errs
    json.dump(res, open(f"{OUT}/report.json", "w"), ensure_ascii=False, indent=1)
    print("RESULT", json.dumps({k: v for k, v in res.items() if k != "log"}, ensure_ascii=False))

asyncio.run(main())
