"""用户（11-06）：桥升起来要有画面。三机关完成 → raiseBridge()，按游戏时间截 4 张，看桥板是不是一块块升起来。
用法：python3 tests/bridge_rise_check.py <URL> <输出目录>"""
import asyncio, sys, os
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":1280,"height":720}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
        for _ in range(6000):
            if await pg.evaluate("!!__qhd.manifest"): break
            await asyncio.sleep(0.2)
        await pg.evaluate("__qhd.game.applyStage(4, true)"); await asyncio.sleep(1)
        await pg.evaluate("__qhd.game.raiseBridge()")
        g0 = await pg.evaluate("__qhd.game.time")
        for t in [0.6, 2.0, 3.4, 4.6, 5.8]:
            while (await pg.evaluate("__qhd.game.time")) - g0 < t: await asyncio.sleep(0.05)
            r = await pg.evaluate("[+__qhd.game.level.bridge.raised.toFixed(2), !!__qhd.game.cinematic]"); print(t, r)
            await pg.screenshot(path=f"{OUT}/rise_{t}.png")
        while await pg.evaluate("!!__qhd.game.cinematic"): await asyncio.sleep(0.1)
        print("end", await pg.evaluate("[__qhd.game.level.bridge.raised, __qhd.game.level.bridge.colliders.length, __qhd.game.stage]"))
        print("errors:", errs[:5]); await b.close()
asyncio.run(main())
