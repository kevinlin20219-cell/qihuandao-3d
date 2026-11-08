"""内存测试：按资产规范 v0.2 第 5.1 节的口径。
60 秒预热取基线；之后在关卡中循环走动、换人、用本领、重复触发谜题；每 10 秒采样渲染进程 + GPU 进程 RSS。
用法：python3 tests/memtest.py <URL> <输出JSON> <分钟>
"""
import asyncio, sys, json, time, math, random, psutil
from playwright.async_api import async_playwright
URL, OUT, MIN = sys.argv[1], sys.argv[2], float(sys.argv[3])

def rss():
    d = {}
    for p in psutil.process_iter(["cmdline"]):
        try:
            cl = " ".join(p.info["cmdline"] or [])
            if "pw-browsers" not in cl: continue
            t = "browser"
            for part in cl.split():
                if part.startswith("--type="): t = part[7:]
            d[t] = d.get(t, 0) + p.memory_info().rss / 1048576
        except Exception: pass
    return d

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 760})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start")
        t0 = time.time(); samples = []; nextS = 0
        spots = [(0, 6), (-8, -8), (8, -8), (0, -11), (-6, 4), (6, 4)]
        keys = ["Digit1", "Digit2", "Digit3", "KeyQ", "KeyE", "KeyH", "KeyQ"]
        cycle = 0
        while time.time() - t0 < MIN * 60:
            el = time.time() - t0
            if el >= nextS:
                r = rss(); heap = await pg.evaluate("Math.round(performance.memory.usedJSHeapSize/1048576)")
                fps = await pg.evaluate("__qhd.fps")
                samples.append({"t": round(el), "renderer": round(r.get("renderer", 0)), "gpu": round(r.get("gpu-process", 0)), "js_heap": heap, "fps": fps})
                print(samples[-1], flush=True); nextS += 10
            # 每 3 分钟：把谜题整段重来一次（换阶段、升桥、重生），检验反复创建/移除碰撞体不泄漏
            if el > cycle * 180 + 120:
                cycle += 1
                await pg.evaluate("(()=>{const g=__qhd.game; g.applyStage(5,true); g.cp='bridge2'; g.respawnAll(); g.cp='start'; g.respawnAll();})()")
            x, z = random.choice(spots)
            await pg.evaluate(f"(()=>{{const p=__qhd.game.leader.pos; __qhd.cam.yaw=Math.atan2(-({x}-p.x),-({z}-p.z));}})()")
            await pg.keyboard.down("KeyW"); await asyncio.sleep(random.uniform(0.8, 2.0)); await pg.keyboard.up("KeyW")
            await pg.keyboard.press(random.choice(keys)); await asyncio.sleep(0.3)
        await b.close()
    base = next((s for s in samples if s["t"] >= 60), samples[0])
    tail = [s for s in samples if s["t"] >= samples[-1]["t"] - 300]
    tot = lambda s: s["renderer"] + s["gpu"]
    res = {"minutes": MIN, "baseline_t60": base, "baseline_total_mb": tot(base), "last5min_avg_total_mb": round(sum(map(tot, tail)) / len(tail)),
           "peak_total_mb": max(map(tot, samples)), "growth_pct": round((sum(map(tot, tail)) / len(tail) / tot(base) - 1) * 100, 1), "errors": errs[:10], "samples": samples}
    res["pass"] = res["growth_pct"] <= 15 and not errs
    json.dump(res, open(OUT, "w"), ensure_ascii=False, indent=1)
    print("RESULT", json.dumps({k: v for k, v in res.items() if k != "samples"}, ensure_ascii=False))
asyncio.run(main())
