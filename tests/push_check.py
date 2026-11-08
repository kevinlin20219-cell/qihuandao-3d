"""汤团推巨石实机检查：斜向接近 → 撑住 → 推 → 停下撑住 → 松手 → 再推到滚走。录像 + 每步数值。"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
ROOT, OUT = sys.argv[1], sys.argv[2]
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
Q = os.environ.get("PUSH_Q", "model_tangtuan=/incoming/char_tangtuan_push_candidate_v001.glb")
ST = """(()=>{const g=__qhd.game, a=g.actors.tangtuan, B=g.level.boulder, m=a.model; const V=B.mesh.position.constructor;
 const c=B.mesh.position; const hand=(n)=>{const o=m.getObjectByName(n); if(!o) return null; const p=o.getWorldPosition(new V()); return +(p.distanceTo(c)-B.radius).toFixed(3);};
 return {bracing:g.bracing, pushing:g.pushing, stage:g.stage, progress:+B.progress.toFixed(3), ballZ:+c.z.toFixed(3), actorZ:+a.pos.z.toFixed(3), actorX:+a.pos.x.toFixed(3),
   gap:+(a.pos.z-c.z).toFixed(3), speed:+Math.hypot(a.vel.x,a.vel.z).toFixed(2), pushLayer:a.push?+a.push.p.toFixed(2):null, pushWalk:a.push?+a.push.w.toFixed(2):null,
   palmL:hand('LeftHand'), palmR:hand('RightHand'), yaw:+a.yaw.toFixed(2), gone:B.gone};})()"""
async def main():
    os.makedirs(OUT, exist_ok=True); log = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
        ctx = await b.new_context(viewport={"width": 960, "height": 640}, record_video_dir=f"{OUT}/video", record_video_size={"width": 960, "height": 640})
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(f"{ROOT}/index.html?{Q}")
        await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start"); await asyncio.sleep(2)
        await pg.add_style_tag(content="#say,#toast,#hud,#party,#keys,#objective,#leaves{visibility:hidden!important}")
        for _ in range(6000):  # 等场景清单（含巨石模型）加载完，云端软件渲染要 5–10 分钟
            if await pg.evaluate("!!__qhd.manifest"): break
            await asyncio.sleep(0.2)
        for _ in range(80):
            if await pg.evaluate("!!(__qhd.game.actors.tangtuan.push)"): break
            await asyncio.sleep(0.5)
        await pg.evaluate("__qhd.game.applyStage(2, true); __qhd.game.switchTo('tangtuan')")
        P = "__qhd.game.leader.pos.constructor"
        # 从斜后方接近（x 偏 0.5）
        await pg.evaluate(f"(()=>{{const g=__qhd.game; g.leader.teleport(new {P}(0.45,1.55,-28.0),3.14159); for(const f of g.followers()) {{ f.teleport(new {P}(f===g.actors.hanhan?-1.0:1.0,1.55,-26.6),3.14); f.goal=f.pos.clone(); f.holding=true; }} __qhd.cam.yaw=0.6; __qhd.cam.pitch=0.15; __qhd.cam.dist=3.6;}})()")
        await asyncio.sleep(1.5)
        async def step(tag, secs, keys_down=(), keys_up=()):
            for k in keys_down: await pg.keyboard.down(k)
            for k in keys_up: await pg.keyboard.up(k)
            t0 = await pg.evaluate("__qhd.game.time")
            while (await pg.evaluate("__qhd.game.time")) - t0 < secs: await asyncio.sleep(0.1)
            s = await pg.evaluate(ST); s["tag"] = tag; log.append(s); print(json.dumps(s, ensure_ascii=False), flush=True)
            pass  # 不截图：截图会让页面失焦、清掉按住的键
        await step("approach", 0.3)
        await step("brace_align", 1.5, ["KeyE"])
        await step("brace_hold", 1.5)
        await step("push", 1.5, ["KeyW"])
        await step("push2", 1.2)
        await step("stop_hold", 1.5, (), ["KeyW"])
        await step("release", 1.2, (), ["KeyE"])
        await step("re_brace", 1.5, ["KeyE"])
        await step("push_to_roll", 2.5, ["KeyW"])
        await step("roll", 2.5, (), ["KeyW", "KeyE"])
        await ctx.close(); await b.close()
    json.dump({"log": log, "errors": errs[:10]}, open(f"{OUT}/push_check.json", "w"), ensure_ascii=False, indent=1)
    print("errors", errs[:5])
asyncio.run(main())
