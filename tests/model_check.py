"""交付模型的云端导入检查（静态候选模式）。
1) 模型检查页：正面/背面/侧面/3/4/面部/身高并排，与游戏相同的灯光。
2) 游戏内：用 ?model_<id>= 替换灰盒外观，在第一章几个位置截实机画面。
3) 内存：同一场景有/无模型各运行 60 秒，比较渲染进程 + GPU 进程 RSS。
用法：python3 tests/model_check.py <站点根URL> <游戏路径> <GLB路径> <角色id> <输出目录>
例：python3 tests/model_check.py http://127.0.0.1:8801 /game/dist /incoming/x.glb tangtuan /out
"""
import asyncio, sys, os, json, time, psutil
from playwright.async_api import async_playwright
ROOT, GAME, GLB, CID, OUT = sys.argv[1:6]
os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

def rss():
    t = 0
    for p in psutil.process_iter(["cmdline"]):
        try:
            cl = " ".join(p.info["cmdline"] or [])
            if "pw-browsers" in cl and ("--type=renderer" in cl or "--type=gpu-process" in cl): t += p.memory_info().rss
        except Exception: pass
    return round(t / 1048576)

async def game_run(pw, with_model, shots):
    b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
    pg = await b.new_page(viewport={"width": 1280, "height": 760})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    q = f"?model_{CID}={ROOT}{GLB}" if with_model else ""
    await pg.goto(f"{ROOT}{GAME}/index.html{q}"); await pg.wait_for_selector("#start:not([disabled])")
    await pg.click("#start"); await asyncio.sleep(2)
    info = {}
    if with_model:
        for _ in range(60):
            info = await pg.evaluate("(__qhd.models||{})")
            if CID in info: break
            await asyncio.sleep(0.5)
    await pg.evaluate(f"__qhd.game.switchTo('{CID}')")
    mem = []
    t0 = time.time()
    while time.time() - t0 < 60:
        await asyncio.sleep(10); mem.append(rss())
    if shots:
        P = "__qhd.game.leader.pos.constructor"
        # (名称, 位置, 角色朝向yaw, 镜头yaw, 俯角, 距离)。镜头yaw=0 时镜头在 +Z 一侧；角色yaw=0 时面朝 +Z（正对镜头）
        spots = [("start_back", "0,0.05,6", 3.14159, 0.0, 0.32, 4.5), ("start_front", "0,0.05,6", 0.0, 0.0, 0.15, 3.0),
                 ("start_side", "0,0.05,6", 1.5708, 0.0, 0.15, 3.0), ("boulder", "0,1.55,-28.2", 3.14159, 0.0, 0.3, 4.0),
                 ("bridgehead", "-5,1.55,-45.5", 0.0, 0.7, 0.22, 4.0)]
        for name, pos, ayaw, cyaw, pitch, dist in spots:
            await pg.evaluate(f"(()=>{{const g=__qhd.game; g.leader.teleport(new {P}({pos}),{ayaw}); __qhd.cam.yaw={cyaw}; __qhd.cam.pitch={pitch}; __qhd.cam.dist={dist};}})()")
            await asyncio.sleep(1.5)
            await pg.screenshot(path=f"{OUT}/game_{name}.png")
    await b.close()
    return {"mem_samples_mb": mem, "mem_avg_mb": round(sum(mem) / len(mem)), "model": info.get(CID), "errors": errs[:10]}

async def main():
    res = {"glb": GLB, "char": CID}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width": 1000, "height": 1000})
        await pg.goto(f"{ROOT}{GAME}/viewer.html?glb={ROOT}{GLB}&char={CID}")
        for _ in range(120):
            if await pg.evaluate("window.__view && __view.ready"): break
            await asyncio.sleep(0.5)
        res["viewer"] = await pg.evaluate("__view.stats")
        for v in ["front", "back", "side", "threequarter", "face", "lineup"]:
            await pg.evaluate(f"__view.setView('{v}')"); await asyncio.sleep(0.4)
            await pg.screenshot(path=f"{OUT}/view_{v}.png")
        await b.close()
        res["game_without_model"] = await game_run(pw, False, False)
        res["game_with_model"] = await game_run(pw, True, True)
    res["mem_delta_mb"] = res["game_with_model"]["mem_avg_mb"] - res["game_without_model"]["mem_avg_mb"]
    json.dump(res, open(f"{OUT}/model_check.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False, indent=1))

asyncio.run(main())
