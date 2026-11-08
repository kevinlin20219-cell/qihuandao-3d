"""风中吊桥：一直往前走不停，应该被风吹回检查点；起风时停下则不会。"""
import asyncio, sys, os
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 760})
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start"); await asyncio.sleep(1)
        await pg.evaluate("(()=>{const g=__qhd.game; g.applyStage(5,true); g.applyStage(5); g.cp='bridgehead'; g.respawnAll(); const P=g.leader.pos.constructor; g.leader.teleport(new P(0,1.55,-48.8),0); __qhd.cam.yaw=0;})()")
        await asyncio.sleep(1)
        info = "({falls:__qhd.game.falls, wind:__qhd.game.wind.phase, z:+__qhd.game.leader.pos.z.toFixed(1), cp:__qhd.game.cp, warn:document.querySelector('#warn').classList.contains('on')})"
        await pg.keyboard.down("KeyW")
        shots = set()
        for i in range(120):
            await asyncio.sleep(0.25)
            r = await pg.evaluate(info)
            if r['wind'] != 'calm' and r['wind'] not in shots:
                shots.add(r['wind']); await pg.screenshot(path=f"{OUT}/wind_{r['wind']}.png")
            if i % 8 == 0: print(r)
            if r['falls'] >= 2: break
        await pg.keyboard.up("KeyW")
        print("final", await pg.evaluate(info))
        await b.close()
asyncio.run(main())
