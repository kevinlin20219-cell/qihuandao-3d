"""v56 涵涵右手队长旗：站 / 走 / 举旗三段 / 打断恢复 截图 + 拼图。用法：python3 tests/flag_check.py <URL> <输出目录>"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 640, "height": 640})
        logs = []; pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}")); pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=90000); await pg.click("#start")
        for _ in range(120):
            await asyncio.sleep(1)
            f = await pg.evaluate("__qhd.flag && __qhd.flag.hanhan")
            if f: break
        print("flag", f, flush=True)
        await pg.keyboard.press("Digit2"); await asyncio.sleep(1.5)
        cam = """(()=>{const h=__qhd.game.actors.hanhan,p=h.pos,y=h.yaw;const fx=Math.sin(y),fz=Math.cos(y);
          __qhd.camOverride={pos:[p.x+fx*2.2-fz*1.0,p.y+1.1,p.z+fz*2.2+fx*1.0],look:[p.x,p.y+0.75,p.z]};})()"""
        shots = []
        async def shot(tag):
            await pg.evaluate(cam); await asyncio.sleep(0.25)
            fn = f"{OUT}/{len(shots):02d}_{tag}.png"; await pg.screenshot(path=fn); shots.append(fn)
            st = await pg.evaluate("(()=>{const F=__qhd.game.actors.hanhan.flag;return F?{s:F.state,t:+F.t.toFixed(2),r:+F.r.toFixed(2),hand:F.inHand,sc:+F.prop.scale.x.toFixed(2)}:null})()"); print(tag, st, flush=True)
        await shot("idle")
        camb = cam.replace("p.x+fx*2.2-fz*1.0","p.x-fx*2.0-fz*0.9").replace("p.z+fz*2.2+fx*1.0","p.z-fz*2.0+fx*0.9")
        await pg.evaluate(camb); await asyncio.sleep(0.25); fn=f"{OUT}/{len(shots):02d}_idle_back.png"; await pg.screenshot(path=fn); shots.append(fn)
        # SwiftShader 下游戏时间比墙钟慢很多：直接设定状态和动画本地时间再截图
        for st, t in [("command",0.1),("command",0.6),("command",1.4),("draw",0.15),("draw",0.4),("enter",0.3),("loop",0.5),("loop",1.5),("exit",0.3),("stow",0.2)]:
            await pg.evaluate(f"(()=>{{const F=__qhd.game.actors.hanhan.flag;F.state='{st}';F.t={t};F.r=1;F.cancel=false;}})()")
            await asyncio.sleep(0.05); await shot(f"{st}_{t}")
        from PIL import Image
        ims = [Image.open(s).resize((320, 320)) for s in shots]; W = Image.new("RGB", (320 * 6, 320 * 2), "white")
        for i, im in enumerate(ims[:12]): W.paste(im, ((i % 6) * 320, (i // 6) * 320))
        W.save(f"{OUT}/sheet.jpg", quality=85)
        print("errors", [l for l in logs if "error" in l.lower()][:6])
        await b.close()
asyncio.run(main())
