"""派派整包回归（0085 要求）：欢呼特写镜头、切人、暂停、移动打断欢呼、观察举放、读档；检查挂件跟随和报错，拼一张总览图。
用法：python3 tests/paipai_regress.py <URL(带 model_paipai)> <输出目录>
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
URL, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
CH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
PROBE = """(()=>{const g=__qhd.game,a=g.actors.paipai; const c=a.model&&a.model.getObjectByName('paipai_bag_charm_rigid'); const s=a.model&&(a.model.getObjectByName('Spine'));
 const v=c?c.getWorldPosition(c.position.clone()):null, w=s?s.getWorldPosition(s.position.clone()):null;
 return {active:g.active, shot:a.oneShot?a.oneShot.name:null, obs:a.obs&&a.obs.state, prop:a.obs&&a.obs.prop?a.obs.prop.visible:null, cine:!!g.cinematic, d:v&&w?+v.distanceTo(w).toFixed(3):null, paused:!document.querySelector('#pause').hidden}})()"""
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CH, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 800, "height": 520}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(URL.split("?")[0] + "?gray=1"); await pg.evaluate("localStorage.clear()"); await pg.goto(URL)
        await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
        for _ in range(200):
            if await pg.evaluate("!!(__qhd.game.actors.paipai.anim)"): break
            await asyncio.sleep(0.2)
        shots, res = [], {}
        async def until(js, t=30):
            for _ in range(int(t / 0.2)):
                if await pg.evaluate(js): return True
                await asyncio.sleep(0.2)
            return False
        async def snap(tag):
            r = await pg.evaluate(PROBE); res[tag] = r; print(f"{tag:<16}", json.dumps(r, ensure_ascii=False), flush=True)
            f = f"{OUT}/{len(shots):02d}_{tag}.png"; await pg.screenshot(path=f); shots.append((tag, f))
        await pg.keyboard.press("Digit3"); await asyncio.sleep(1.2)
        # 1 欢呼特写（得叶子）
        await pg.evaluate("__qhd.game.awardLeaf('paipai','测试')"); await asyncio.sleep(1.3)
        await snap("cheer_closeup")
        await until("!__qhd.game.cinematic && !__qhd.game.actors.paipai.oneShot"); await snap("after_cheer")
        # 2 移动打断欢呼
        await pg.evaluate("__qhd.game.actors.paipai.playOnce('cheer')"); await asyncio.sleep(0.4)
        await pg.keyboard.down("KeyW"); await until("!__qhd.game.actors.paipai.oneShot", 8); await snap("cheer_interrupt"); await pg.keyboard.up("KeyW")
        # 3 观察举起 → 收起
        await asyncio.sleep(0.6); await pg.keyboard.press("KeyQ"); await until("__qhd.game.actors.paipai.obs.state==='hold' && __qhd.game.actors.paipai.obs.prop && __qhd.game.actors.paipai.obs.prop.visible", 20); await snap("observe_hold")
        await pg.keyboard.press("KeyQ"); await until("__qhd.game.actors.paipai.obs.state==='off'", 45); await snap("observe_off")
        # 4 切人再切回
        await pg.keyboard.press("Digit1"); await asyncio.sleep(1.0); await snap("switch_tangtuan")
        await pg.keyboard.press("Digit3"); await asyncio.sleep(1.0); await snap("switch_back")
        # 5 暂停 / 继续
        await pg.keyboard.press("Escape"); await asyncio.sleep(0.6); await snap("paused")
        await pg.keyboard.press("Escape"); await asyncio.sleep(0.6)
        # 6 跑步近景（镜头跟着跑）
        await pg.keyboard.down("KeyW"); await pg.keyboard.down("ShiftLeft"); await asyncio.sleep(1.2)
        await pg.evaluate("(()=>{const a=__qhd.game.actors.paipai,p=a.pos,y=a.yaw+1.57+0.5; __qhd.camOverride={pos:[p.x-Math.sin(y)*1.0+Math.sin(a.yaw)*0.9,p.y+0.9,p.z-Math.cos(y)*1.0+Math.cos(a.yaw)*0.9],look:[p.x+Math.sin(a.yaw)*0.5,p.y+0.78,p.z+Math.cos(a.yaw)*0.5]};})()")
        await asyncio.sleep(0.15); await snap("run_waist")
        await pg.evaluate("__qhd.camOverride=null"); await pg.keyboard.up("ShiftLeft"); await pg.keyboard.up("KeyW"); await asyncio.sleep(0.8)
        # 7 读档
        await pg.evaluate("__qhd.game.save()"); await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
        for _ in range(200):
            if await pg.evaluate("!!(__qhd.game.actors.paipai.anim)"): break
            await asyncio.sleep(0.2)
        await pg.keyboard.press("Digit3"); await asyncio.sleep(1.5); await snap("reloaded")
        leaves = await pg.evaluate("__qhd.game.leaves")
        ds = [r["d"] for r in res.values() if r["d"] is not None]
        checks = {
            "欢呼时有特写镜头": res["cheer_closeup"]["cine"] and res["cheer_closeup"]["shot"] == "cheer",
            "特写结束回到正常镜头": not res["after_cheer"]["cine"],
            "移动能打断欢呼": res["cheer_interrupt"]["shot"] is None,
            "观察举起有放大镜": res["observe_hold"]["obs"] in ("hold", "raise") and res["observe_hold"]["prop"] is True,
            "观察能收起": res["observe_off"]["obs"] == "off",
            "切人后切回正常": res["switch_back"]["active"] == "paipai",
            "暂停界面出现": res["paused"]["paused"],
            "读档后叶子还在": "paipai" in leaves,
            "挂件始终贴着书包(0.22–0.25m)": all(0.22 <= d <= 0.25 for d in ds),
        }
        for k, v in checks.items(): print("✓" if v else "✗", k)
        W, H = 320, 208; s = Image.new("RGB", (W * 4, H * 3)); dr = ImageDraw.Draw(s)
        for i, (t, f) in enumerate(shots):
            x, y = (i % 4) * W, (i // 4) * H; s.paste(Image.open(f).resize((W, H)), (x, y)); dr.rectangle([x, y, x + 130, y + 15], fill=(0, 0, 0)); dr.text((x + 3, y + 2), t, fill=(255, 255, 0))
        s.save(f"{OUT}/sheet.png"); print("errors:", errs[:5]); await b.close()
        sys.exit(0 if all(checks.values()) and not errs else 1)
asyncio.run(main())
