"""派派观察技能实机检查：站着观察（完整演出）、观察中走路、走路时收起、站着收起；截图 + 右手高度 + 放大镜可见性。"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
ROOT, OUT = sys.argv[1], sys.argv[2]
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
Q = "model_paipai=/incoming/char_paipai_forearm_material_candidate_v004.glb&prop_paipai=/incoming/prop_magnifier_v001.glb"
ST = """(()=>{const a=__qhd.game.actors.paipai, O=a.obs, m=a.model; const v=new m.position.constructor();
 const hand=m.getObjectByName('RightHand').getWorldPosition(v.clone()).y, head=m.getObjectByName('Head').getWorldPosition(v.clone()).y;
 return {state:O?O.state:null, o:O?+O.o.toFixed(2):null, sW:O?+O.sW.toFixed(2):null, skillT:O?+O.skill.time.toFixed(2):null, prop:O&&O.prop?O.prop.visible:null,
   handY:+hand.toFixed(3), headY:+head.toFixed(3), speed:+Math.hypot(a.vel.x,a.vel.z).toFixed(2), pose:a.pose, observing:__qhd.game.observing};})()"""
async def main():
    os.makedirs(OUT, exist_ok=True); log = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
        ctx = await b.new_context(viewport={"width": 960, "height": 640}, record_video_dir=f"{OUT}/video", record_video_size={"width": 960, "height": 640})
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(f"{ROOT}/game/dist/index.html?look=env&{Q}")
        await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start"); await asyncio.sleep(2)
        await pg.add_style_tag(content="#say,#toast,#hud,#party,#keys,#objective,#leaves,#observe{visibility:hidden!important}")
        for _ in range(80):
            if await pg.evaluate("!!(__qhd.props&&__qhd.props.paipai)"): break
            await asyncio.sleep(0.5)
        await pg.evaluate("__qhd.game.switchTo('paipai')"); await asyncio.sleep(0.5)
        P = "__qhd.game.leader.pos.constructor"
        await pg.evaluate(f"(()=>{{const g=__qhd.game; g.leader.teleport(new {P}(-6,0.05,8),0.6); __qhd.cam.yaw=0; __qhd.cam.pitch=0.1; __qhd.cam.dist=1.6;}})()")
        await asyncio.sleep(1.5)
        async def snap(tag):
            s = await pg.evaluate(ST); s["tag"] = tag; log.append(s); print(json.dumps(s, ensure_ascii=False), flush=True)
            await pg.screenshot(path=f"{OUT}/{len(log):02d}_{tag}.png")
        await snap("before")
        await pg.keyboard.press("KeyQ")
        for t in [0.5, 1.2, 2.0, 3.0, 4.5]:
            await asyncio.sleep(0.6); await snap(f"stand_observe")
        await pg.keyboard.down("KeyD"); await asyncio.sleep(1.2); await snap("walk_observe"); await asyncio.sleep(1.0); await snap("walk_observe")
        await pg.keyboard.press("KeyQ"); await asyncio.sleep(0.6); await snap("walk_put_away"); await asyncio.sleep(0.8); await snap("walk_after")
        await pg.keyboard.up("KeyD"); await asyncio.sleep(1.0)
        await pg.keyboard.down("KeyD"); await pg.keyboard.press("KeyQ"); await asyncio.sleep(1.2); await snap("walk_start_observe"); await pg.keyboard.up("KeyD"); await asyncio.sleep(1.5); await snap("stop_still_observing")
        await pg.keyboard.press("KeyQ")
        for _ in range(4): await asyncio.sleep(0.5); await snap("stand_lower")
        await pg.keyboard.press("KeyQ"); await asyncio.sleep(1.0); await pg.keyboard.press("Digit1"); await asyncio.sleep(1.5)
        s = await pg.evaluate(ST); s["tag"] = "after_switch_away"; log.append(s); print(json.dumps(s, ensure_ascii=False))
        await ctx.close(); await b.close()
    json.dump({"log": log, "errors": errs[:10]}, open(f"{OUT}/observe_check.json", "w"), ensure_ascii=False, indent=1)
    print("errors", errs[:5])
asyncio.run(main())
