"""C11 第二章内存长测：游戏内 30 分钟（推帧模拟，每 40 帧真正渲染 1 帧（游戏内每 4 秒画一帧）），在第二章里来回走、每 5 分钟回一次第一章再进第二章。
每分钟记录：JS 堆（先 gc）、three.js 几何体 / 贴图 / 着色器数、碰撞体数。看有没有一直往上涨。
用法：python3 tests/ch2_memory_soak.py <url> <输出目录> [分钟=30]"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]; MIN = int(sys.argv[3]) if len(sys.argv) > 3 else 30
os.makedirs(OUT, exist_ok=True)
SNAP = "(()=>{ if (window.gc) gc(); const i=__qhd.renderer.info; return {heap: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null, geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs ? i.programs.length : null, cols: __qhd.ph.world.colliders.len(), chapter: __qhd.game.chapter, t: +__qhd.game.ch2Time.toFixed(0)}; })()"
# 西岸一圈：营火 → 码头 → 船屋前 → 上游 → 回营火（都在可走区里）
LOOP = [(-14, 25), (-12, 8), (-15, -2), (-15, -18), (-20, -30), (-10, -30), (-10, 0), (-14, 25)]

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc"])
        pg = await b.new_page(viewport={"width": 960, "height": 540}); pg.set_default_timeout(900000); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=600000)
        await pg.evaluate("localStorage.removeItem('qhd3d_save_v2')"); await pg.click("#start"); await pg.evaluate("window.__qhdManual=true")
        for _ in range(600):
            if await pg.evaluate("!!(window.__qhd && __qhd.manifest && __qhd.manifest.some(r=>r.id==='wind'||r.id==='legacy_instances'))"): break
            await asyncio.sleep(1)
        await asyncio.sleep(4)
        await pg.evaluate("""window.__S = { k: 0, step(n){ for(let i=0;i<n;i++){ window.__qhdNoRender = (this.k++ % 40) !== 0; window.__qhdFixedDt=0.1; __qhdStep(); } window.__qhdNoRender=false; window.__qhdFixedDt=1/30; },
          walk(x,z,maxT){ const g=__qhd.game, O=g.ch2.world(0,0,0); let t=0; while(t<maxT){ const p=g.leader.pos, dx=O.x+x-p.x, dz=O.z+z-p.z, d=Math.hypot(dx,dz); if(d<0.6) break; window.__qhdTestWish={x:dx/d,z:dz/d}; this.step(1); t+=0.1; } window.__qhdTestWish=null; return t; } }""")
        await pg.evaluate("__qhdChapter('ch2')"); await pg.evaluate("__S.step(20)")
        samples = [{"min": 0, **(await pg.evaluate(SNAP))}]
        sim = 0.0; nextMin = 1; nextSwitch = 5; li = 0
        while sim < MIN * 60:
            x, z = LOOP[li % len(LOOP)]; li += 1
            t = await pg.evaluate(f"__S.walk({x},{z},40)"); sim += max(t, 0.1)
            if t < 0.2: await pg.evaluate("__S.step(20)"); sim += 2
            if sim >= nextSwitch * 60:
                await pg.evaluate("__qhdChapter('ch1')"); await pg.evaluate("__S.step(10)"); await pg.evaluate("__qhdChapter('ch2')"); await pg.evaluate("__S.step(10)"); sim += 2; nextSwitch += 5
            while sim >= nextMin * 60:
                s = {"min": nextMin, **(await pg.evaluate(SNAP))}; samples.append(s); print("MIN", json.dumps(s), flush=True); nextMin += 1
        await b.close()
    first = samples[1] if len(samples) > 1 else samples[0]; last = samples[-1]
    res = {"minutes": MIN, "errors": errs, "samples": samples,
           "heap_growth_mb": round((last["heap"] or 0) - (first["heap"] or 0), 1),
           "geo_growth": last["geo"] - first["geo"], "tex_growth": last["tex"] - first["tex"], "cols_growth": last["cols"] - first["cols"]}
    hs = [s["heap"] for s in samples[1:] if s["heap"]]
    res["heap_min_max"] = [min(hs), max(hs)] if hs else None
    res["pass"] = not errs and res["geo_growth"] <= 2 and res["tex_growth"] <= 2 and res["cols_growth"] == 0 and res["heap_growth_mb"] < 15
    json.dump(res, open(f"{OUT}/report.json", "w"), ensure_ascii=False, indent=1)
    print("RESULT", json.dumps({k: v for k, v in res.items() if k != "samples"}, ensure_ascii=False))

asyncio.run(main())
