"""Codex 0059–0067 动作实机检查：汤团蓄力推掌、检查机关；涵涵指令；三人欢呼（派派观察中获叶、重复获叶、涵涵原生欢呼）。"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
ROOT, OUT = sys.argv[1], sys.argv[2]
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
Q = ("model_tangtuan=/incoming/char_tangtuan_cheer_candidate_v001.glb&model_paipai=/incoming/char_paipai_cheer_candidate_v001.glb"
     "&model_hanhan=/incoming/char_hanhan_cheer_candidate_v001.glb&anim_hanhan=tangtuan&prop_paipai=/incoming/prop_magnifier_v001.glb")
ST = """((id)=>{const g=__qhd.game,a=g.actors[id]; const S=a.oneShot, C=a.cmd;
 return {who:id, shot:S?S.name:null, f:S?+S.f.toFixed(2):0, t:S?+S.a.time.toFixed(2):null, cmd:C?+C.c.toFixed(2):null, cmdT:C?+C.a.time.toFixed(2):null,
   yaw:+a.yaw.toFixed(2), stage:g.stage, prop:a.obs&&a.obs.prop?a.obs.prop.visible:null, obs:a.obs?a.obs.state:null, leaves:g.leaves.slice(),
   cheerClipTracks: a.shots&&a.shots.cheer?a.shots.cheer.getClip().tracks.length:null, cheerNative: a.shots&&a.shots.cheer? a.clips.some(c=>c===a.shots.cheer.getClip()):null};})"""
async def main():
    os.makedirs(OUT, exist_ok=True); log = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
        ctx = await b.new_context(viewport={"width": 960, "height": 640}, record_video_dir=f"{OUT}/video", record_video_size={"width": 960, "height": 640})
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(f"{ROOT}/game/dist/index.html?look=env&{Q}")
        await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start"); await asyncio.sleep(2)
        await pg.add_style_tag(content="#toast,#hud,#party,#keys,#objective,#leaves,#xray{visibility:hidden!important}")
        for _ in range(120):
            if await pg.evaluate("(()=>{const A=__qhd.game.actors;return !!(A.tangtuan.anim&&A.paipai.anim&&A.hanhan.anim&&__qhd.props&&__qhd.props.paipai)})()"): break
            await asyncio.sleep(0.5)
        P = "__qhd.game.leader.pos.constructor"
        async def gwait(secs):
            t0 = await pg.evaluate("__qhd.game.time")
            while (await pg.evaluate("__qhd.game.time")) - t0 < secs: await asyncio.sleep(0.1)
        async def snap(tag, who):
            s = await pg.evaluate(ST + f"('{who}')"); s["tag"] = tag; log.append(s); print(json.dumps(s, ensure_ascii=False), flush=True)
            await pg.screenshot(path=f"{OUT}/{len(log):02d}_{tag}.png")
        # 0. 开门，进空地
        await pg.evaluate("__qhd.game.openGate(true)")
        # 1. 汤团空地蓄力推掌
        await pg.evaluate(f"(()=>{{const g=__qhd.game; g.switchTo('tangtuan'); g.leader.teleport(new {P}(0,0.05,4),0); __qhd.cam.yaw=0.5; __qhd.cam.pitch=0.12; __qhd.cam.dist=3.2;}})()")
        await gwait(1.0); await pg.keyboard.press("KeyQ"); await gwait(0.4); await snap("pushwave_charge", "tangtuan")
        await gwait(0.7); await snap("pushwave_out", "tangtuan")
        await pg.keyboard.press("KeyQ"); await gwait(0.1); await snap("pushwave_repeatQ", "tangtuan")
        await gwait(3.0); await snap("pushwave_done", "tangtuan")
        # 2. 检查机关：巨石已推走（阶段 Inspect），背对绞盘站着按 Q
        await pg.evaluate(f"(()=>{{const g=__qhd.game; g.applyStage(3, true); const w=g.level.winch.pos; g.leader.teleport(new {P}(w.x+1.2,w.y+0.05,w.z+1.4),0); __qhd.cam.yaw=2.4; __qhd.cam.dist=3.0;}})()")
        await gwait(1.0); await pg.keyboard.press("KeyQ"); await gwait(1.4); await snap("inspect", "tangtuan")
        await gwait(1.2); await snap("inspect_late", "tangtuan")
        await gwait(1.5); await snap("inspect_done", "tangtuan")
        # 3. 涵涵指令：站在配重石西边 3 米处，镜头在身后
        await pg.evaluate(f"(()=>{{const g=__qhd.game; g.switchTo('hanhan'); g.leader.teleport(new {P}(2.2,1.55,-45.0),0); __qhd.cam.yaw=1.2; __qhd.cam.dist=3.0;}})()")
        await gwait(1.0); await pg.keyboard.press("KeyQ"); await gwait(0.9); await snap("command_point", "hanhan")
        await gwait(1.8); await snap("command_done", "hanhan")
        # 4. 派派观察中获叶：放大镜要收起、播欢呼；重复获叶不再欢呼
        await pg.evaluate(f"(()=>{{const g=__qhd.game; g.switchTo('paipai'); g.leader.teleport(new {P}(0,1.55,-42),0); __qhd.cam.yaw=0.3; __qhd.cam.dist=2.6;}})()")
        await gwait(0.8); await pg.keyboard.press("KeyQ"); await gwait(1.6); await snap("paipai_observing", "paipai")
        await pg.evaluate("__qhd.game.leaves=__qhd.game.leaves.filter(x=>x!=='paipai'); __qhd.game.awardLeaf('paipai','测试')"); await gwait(1.0); await snap("paipai_cheer", "paipai")
        await gwait(2.4); await snap("paipai_cheer_done", "paipai")
        await pg.evaluate("__qhd.game.awardLeaf('paipai','重复')"); await gwait(0.5); await snap("paipai_repeat_award", "paipai")
        # 5. 涵涵原生欢呼、汤团欢呼
        await pg.evaluate(f"(()=>{{const g=__qhd.game; g.observing=false; g.switchTo('hanhan'); g.leader.teleport(new {P}(-1,1.55,-42),0); g.actors.tangtuan.teleport(new {P}(1.2,1.55,-42.3),0); __qhd.cam.yaw=0.0; __qhd.cam.dist=4.0;}})()")
        await gwait(0.8)
        await pg.evaluate("__qhd.game.leaves=[]; __qhd.game.awardLeaf('hanhan','测试'); __qhd.game.awardLeaf('tangtuan','测试')"); await gwait(1.2)
        await snap("cheer_hanhan", "hanhan"); s2 = await pg.evaluate(ST + "('tangtuan')"); s2["tag"] = "cheer_tangtuan"; log.append(s2); print(json.dumps(s2, ensure_ascii=False))
        await gwait(2.4); await snap("cheer_done", "hanhan")
        await ctx.close(); await b.close()
    json.dump({"log": log, "errors": errs[:10]}, open(f"{OUT}/actions_check.json", "w"), ensure_ascii=False, indent=1)
    print("errors", errs[:5])
asyncio.run(main())
