"""用户（11-08）：闲置提示只在本阶段要做事的地方附近才说。
在离目标远 / 近两处各闲置一次，看会不会冒出提示台词。"""
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":640,"height":400}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
        for _ in range(100):
            if await pg.evaluate("!!(window.__qhd && __qhd.game)"): break
            await asyncio.sleep(0.2)
        await asyncio.sleep(3)
        async def idle_at(stage, gate, x, z):
            await pg.evaluate(f"""(()=>{{const g=__qhd.game; g.applyStage({stage}, true); g.gateOpen={str(gate).lower()}; g.ui.queue&&(g.ui.queue.length=0); g.ui.current=null;
              const a=g.leader; a.teleport(a.pos.clone().set({x},a.pos.y+0.5,{z}),0); g.idleT=31;}})()""")
            t0 = await pg.evaluate("__qhd.game.time")
            while (await pg.evaluate("__qhd.game.time")) - t0 < 0.3: await asyncio.sleep(0.05)
            return await pg.evaluate("(()=>{const u=__qhd.game.ui; const c=u.current; return c? (c.who+':'+c.text) : (u.queue&&u.queue.length? u.queue[0].who+':'+u.queue[0].text : null);})()")
        cases = [("过门后远离藤蔓", 0, True, 12, 6), ("过门后在藤蔓前", 0, True, 0, -12),
                 ("巨石阶段走回岔路口", 2, True, 0, 4), ("巨石阶段在巨石旁", 2, True, 0, -24)]
        for name, st, gate, x, z in cases:
            print(name, "→", await idle_at(st, gate, x, z))
        print("errors:", errs[:3]); await b.close()
asyncio.run(main())
