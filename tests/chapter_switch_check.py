"""C1 章节切换检查：第一章 ⇄ 第二章空壳往返 N 次。
记录每次切换后的几何体 / 贴图 / 程序数、JS 堆、碰撞体数、领队位置与章节，以及报错；最后验证存档分段。
用法：python3 tests/chapter_switch_check.py <URL（含 ?intro=0）> <输出目录> [次数=5]
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]; N = int(sys.argv[3]) if len(sys.argv) > 3 else 5
os.makedirs(OUT, exist_ok=True)
import glob
CH = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome") or [None])[0]
SNAP = """(()=>{const q=__qhd,g=q.game,i=q.renderer.info.memory;
 return {chapter:g.chapter, geo:i.geometries, tex:i.textures, prog:q.renderer.info.programs?q.renderer.info.programs.length:null,
  heap: performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,
  colliders:q.ph.world.colliders.len(), shell: !!q.scene.getObjectByName('chapter2_shell'),
  lead:g.leader.pos.toArray().map(v=>+v.toFixed(2)), stage:g.stage, cp:g.cp, ch2cp:g.ch2Cp,
  keys: document.getElementById('keys').innerText.replace(/\\s+/g,' '), say: document.getElementById('say').hidden ? '' : document.getElementById('say').innerText.replace(/\\s+/g,' '),
  save: JSON.parse(localStorage.getItem('qhd3d_save_v2')||'null')};})()"""

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CH, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc"])
        pg = await b.new_page(viewport={"width": 960, "height": 540}); pg.set_default_timeout(300000); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:300])); pg.on("console", lambda m: errs.append(m.text[:300]) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=300000); await pg.click("#start"); await pg.evaluate("window.__qhdManual=true")
        for _ in range(900):
            if await pg.evaluate("!!__qhd.manifest && __qhd.manifest.some(r=>r.id==='wind'||r.id==='legacy_instances')"): break
            await asyncio.sleep(0.3)
        await asyncio.sleep(5)
        # 2 核软件渲染一帧要很久：停掉连续渲染，改成手动推帧（每帧 1/30 秒游戏时间）
        await pg.evaluate("window.__qhdManual=true; window.__qhdFixedDt=1/30")
        async def step(n=1, dt=1/30):
            await pg.evaluate(f"(()=>{{window.__qhdFixedDt={dt}; for(let i=0;i<{n};i++) __qhdStep(); window.__qhdFixedDt=1/30;}})()")
        gc = "(()=>{ if (window.gc) { gc(); gc(); } })()"
        log = []; walked = []
        async def snap(tag):
            await pg.evaluate(gc); await asyncio.sleep(0.5)
            s = await pg.evaluate(SNAP); s["tag"] = tag; log.append(s)
            print(json.dumps({k: v for k, v in s.items() if k != "save"}, ensure_ascii=False), flush=True)
            return s
        # 新档、石门没开：先直接进第二章看一眼，不能出现第一章的踏石提示和台词
        await step(3)
        fresh = await pg.evaluate("(()=>{const g=__qhd.game; return {gate:g.gateOpen, say:!document.getElementById('say').hidden};})()")
        await pg.evaluate("__qhdChapter('ch2')"); await step(3)
        fresh2 = await pg.evaluate(SNAP); print("FRESH", json.dumps({"before": fresh, "keys": fresh2["keys"], "say": fresh2["say"], "lead": fresh2["lead"]}, ensure_ascii=False), flush=True)
        await pg.screenshot(path=f"{OUT}/00_fresh_ch2.png")
        await pg.evaluate("__qhdChapter('ch1')"); await step(3)
        # 第一章里先改一点状态，回来后要还在
        await pg.evaluate("__qhd.game.openGate(true)")
        await pg.evaluate("(()=>{const g=__qhd.game; g.cp='north'; g.save();})()")
        await step(3)
        base = await snap("ch1_base")
        await pg.screenshot(path=f"{OUT}/00_ch1.png")
        for i in range(1, N + 1):
            await pg.evaluate("__qhdChapter('ch2')"); await step(3)
            # 在第二章里走几步、跳一下、掉下水一次（第 1 次）
            p0 = await pg.evaluate("__qhd.game.leader.pos.toArray()")
            await pg.keyboard.down("KeyW"); await step(6, 0.2); await pg.keyboard.up("KeyW")
            await pg.keyboard.down("Space"); await step(1); await pg.keyboard.up("Space"); await step(4, 0.2)
            p1 = await pg.evaluate("__qhd.game.leader.pos.toArray()")
            walked.append(round(((p1[0]-p0[0])**2+(p1[2]-p0[2])**2)**0.5, 2))
            if i == 1:
                await pg.screenshot(path=f"{OUT}/{i:02d}_ch2.png")
                await pg.evaluate("(()=>{const g=__qhd.game,a=g.leader; a.teleport(g.ch2.world(0,2,0),0);})()"); await step(12, 0.3)
                s = await snap(f"ch2_{i}_after_fall")
                await pg.screenshot(path=f"{OUT}/{i:02d}_ch2_after_fall.png")
            else:
                s = await snap(f"ch2_{i}")
            await pg.evaluate("__qhdChapter('ch1')"); await step(2)
            s = await snap(f"ch1_{i}")
            if i == N: await pg.screenshot(path=f"{OUT}/{i:02d}_ch1_back.png")
        # 存档分段：第二章里清档只清第二章，第一章进度还在
        await pg.evaluate("__qhdChapter('ch2')"); await step(2)
        seg = await pg.evaluate("(()=>{const g=__qhd.game; const before=JSON.parse(localStorage.getItem('qhd3d_save_v2')); g.clearSave(); const after=JSON.parse(localStorage.getItem('qhd3d_save_v2')); g.enterChapter('ch1'); const back=JSON.parse(localStorage.getItem('qhd3d_save_v2')); return {before:Object.keys(before.chapters), beforeCur:before.current, after:Object.keys(after.chapters), ch1cp:after.chapters.ch1&&after.chapters.ch1.cp, back:Object.keys(back.chapters), backCur:back.current, backCp:back.chapters.ch1&&back.chapters.ch1.cp};})()")
        print("SEG", json.dumps(seg, ensure_ascii=False), flush=True)
        await b.close()
    last = log[-1]
    ch2s = [x for x in log if x["chapter"] == "ch2"]
    res = {
        "switches": N,
        "walked_in_ch2_m": walked,
        "walk_ok": all(w > 1.0 for w in walked),
        "fresh_ch2_keys": fresh2["keys"], "fresh_ch2_say": fresh2["say"],
        # C3 起进第二章会有涵涵的开场台词：只查有没有第一章残留的提示和台词
        "fresh_ch2_clean": ("踏石" not in fresh2["keys"]) and ("口令" not in fresh2["keys"]) and ('吊桥' not in fresh2["say"]) and ('林子' not in fresh2["say"]) and ('三条' not in fresh2["say"]) and ('接着走' not in fresh2["say"]),
        "ch2_keys_clean": all(("踏石" not in x["keys"]) and ('吊桥' not in x["say"]) and ('林子' not in x["say"]) and ('三条' not in x["say"]) and ('接着走' not in x["say"]) for x in ch2s),
        "errors": errs[:30],
        "geo_back_to_base": [x["geo"] - base["geo"] for x in log if x["chapter"] == "ch1"],
        "tex_back_to_base": [x["tex"] - base["tex"] for x in log if x["chapter"] == "ch1"],
        "colliders_back_to_base": [x["colliders"] - base["colliders"] for x in log if x["chapter"] == "ch1"],
        "heap_ch1": [x["heap"] for x in log if x["chapter"] == "ch1"],
        "heap_ch2": [x["heap"] for x in ch2s],
        "programs": [x["prog"] for x in log],
        "shell_gone_in_ch1": all(not x["shell"] for x in log if x["chapter"] == "ch1"),
        "shell_present_in_ch2": all(x["shell"] for x in ch2s),
        "ch1_state_kept": all(x["cp"] == "north" and x["stage"] == base["stage"] for x in log if x["chapter"] == "ch1"),
        "fall_respawned_to_ch2_spawn": ch2s and abs(ch2s[0]["lead"][0] - 2986) < 3 and abs(ch2s[0]["lead"][2] - 25) < 3,
        "save_final": last["save"],
        "save_segments": seg,
        "save_segments_ok": seg["before"] == ["ch1", "ch2"] or set(seg["before"]) == {"ch1", "ch2"},
        "clear_in_ch2_keeps_ch1": "ch1" in seg["after"] and "ch2" not in seg["after"] and seg["ch1cp"] == "north" and seg["backCur"] == "ch1" and seg["backCp"] == "north",
    }
    json.dump({"log": log, "result": res}, open(f"{OUT}/report.json", "w"), ensure_ascii=False, indent=1)
    print("RESULT", json.dumps(res, ensure_ascii=False))

asyncio.run(main())
