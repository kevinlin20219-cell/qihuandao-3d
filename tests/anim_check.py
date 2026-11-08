"""骨骼动画实机检查：侧面走 / 跑 / 停下 / 正面走 / 转身，每个人物出逐帧图和 GIF，并测脚底滑动。
用法：python3 tests/anim_check.py <URL根> <输出目录> <人物id,...>   （模型地址见 MODELS）
"""
import asyncio, sys, os, json, math
from playwright.async_api import async_playwright
from PIL import Image
ROOT, OUT = sys.argv[1], sys.argv[2]
WHO = sys.argv[3].split(",")
MODELS = {"tangtuan": "/incoming/char_tangtuan_locomotion_candidate_v002.glb",
          "paipai": "/incoming/char_paipai_locomotion_candidate_v003.glb",
          "hanhan": "/incoming/char_hanhan_tpose_rig_candidate_v003.glb"}
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SAMPLER = """(()=>{const g=__qhd.game; window.__feet=[]; const T=window.THREE_V||null;
 function tick(){ const a=g.leader; if(a.model){ const L=a.model.getObjectByName('LeftFoot'), R=a.model.getObjectByName('RightFoot');
   if(L&&R){ const l=L.getWorldPosition(L.position.clone()), r=R.getWorldPosition(R.position.clone());
     __feet.push({t:performance.now()/1000, l:[l.x,l.y,l.z], r:[r.x,r.y,r.z], v:Math.hypot(a.vel.x,a.vel.z), anim:a.anim?a.anim.cur:null}); } }
   if(window.__sampling) requestAnimationFrame(tick); }
 window.__sampling=true; tick(); })()"""
def slide(feet):
    # 着地脚（两只脚里更低的那只）每帧的水平移动速度：理想情况接近 0
    out = []
    for a, b in zip(feet, feet[1:]):
        dt = b["t"] - a["t"]
        if dt <= 0: continue
        k = "l" if a["l"][1] < a["r"][1] else "r"
        v = math.hypot(b[k][0] - a[k][0], b[k][2] - a[k][2]) / dt
        out.append((a["v"], v, a["anim"]))
    return out
async def main():
    os.makedirs(OUT, exist_ok=True)
    q = "&".join(f"model_{k}={ROOT}{v}" for k, v in MODELS.items()) + "&anim_hanhan=tangtuan"
    rep = {}; marks = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
        ctx = await b.new_context(viewport={"width": 960, "height": 640}, record_video_dir=f"{OUT}/video", record_video_size={"width": 960, "height": 640})
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        T0 = asyncio.get_event_loop().time()
        await pg.goto(f"{ROOT}/game/dist/index.html?look=env&{q}")
        await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start"); await asyncio.sleep(2)
        await pg.add_style_tag(content="#say,#toast,#hud,#party,#keys,#objective,#leaves{visibility:hidden!important}")
        for _ in range(120):
            m = await pg.evaluate("__qhd.models||{}")
            if all(k in m for k in MODELS): break
            await asyncio.sleep(0.5)
        await asyncio.sleep(9)  # 等借用动作的链接
        rep["models"] = await pg.evaluate("__qhd.models")
        rep["anim_src"] = await pg.evaluate("Object.fromEntries(Object.entries(__qhd.game.actors).map(([k,a])=>[k,a.anim?{src:a.anim.src,refWalk:+a.anim.refWalk.toFixed(3),refRun:+a.anim.refRun.toFixed(3),walk:a.def.walk,run:a.def.run}:null]))"); print("anim", rep["anim_src"], flush=True)
        P = "__qhd.game.leader.pos.constructor"
        for who in WHO:
            await pg.evaluate(f"__qhd.game.switchTo('{who}')"); await asyncio.sleep(0.8)
            await pg.evaluate(f"(()=>{{const g=__qhd.game; g.leader.teleport(new {P}(-11,0.05,8),1.5708); __qhd.cam.yaw=0; __qhd.cam.pitch=0.12; __qhd.cam.dist=3.6;}})()")
            await asyncio.sleep(1.5)
            frames = {}
            async def grab(tag, secs, keys):
                marks.append((who, tag, round(asyncio.get_event_loop().time() - T0, 2)))
                for k in keys: await pg.keyboard.down(k)
                fr = []
                await asyncio.sleep(secs)
                for k in keys: await pg.keyboard.up(k)
                frames[tag] = fr
            await pg.evaluate("window.__sampling=false"); await pg.evaluate(SAMPLER)
            await grab("idle", 1.5, [])
            await grab("walk_side", 3.0, ["KeyD"])
            await grab("stop", 1.5, [])
            await grab("run_side", 2.5, ["ShiftLeft", "KeyD"])
            await grab("stop_run", 1.5, [])
            await pg.evaluate("window.__sampling=false")
            feet = await pg.evaluate("__feet")
            await grab("walk_front", 2.0, ["KeyS"])
            await grab("turn", 2.0, ["KeyA"])
            # 逐帧图存 GIF；每段挑 4 帧拼成静态图
            os.makedirs(f"{OUT}/{who}", exist_ok=True)
            import io
            allf = []
            for tag, fr in frames.items():
                ims = [Image.open(io.BytesIO(x)).convert("RGB").resize((280, 290)) for x in fr]
                allf += ims
                if ims:
                    ims[0].save(f"{OUT}/{who}/{tag}.gif", save_all=True, append_images=ims[1:], duration=110, loop=0)
                    pick = [ims[int(i * (len(ims) - 1) / 3)] for i in range(4)] if len(ims) >= 4 else ims
                    strip = Image.new("RGB", (280 * len(pick), 290)); [strip.paste(im, (i * 280, 0)) for i, im in enumerate(pick)]; strip.save(f"{OUT}/{who}/{tag}_strip.png")
            s = slide(feet)
            def stat(name):
                xs = [v for (bv, v, a) in s if a == name and bv > 0.5]
                return {"frames": len(xs), "median_planted_foot_speed": round(sorted(xs)[len(xs)//2], 3) if xs else None,
                        "body_speed": round(sorted([bv for (bv, v, a) in s if a == name and bv > 0.5])[len(xs)//2], 2) if xs else None}
            rep[who] = {"walk": stat("walk"), "run": stat("run"), "samples": len(feet), "frames": {k: len(v) for k, v in frames.items()}}
            print(who, json.dumps(rep[who], ensure_ascii=False), flush=True)
        rep["marks"] = marks
        rep["errors"] = errs[:20]
        rep["video"] = await pg.video.path()
        await ctx.close(); await b.close()
    json.dump(rep, open(f"{OUT}/anim_check.json", "w"), ensure_ascii=False, indent=1)
    print("errors", errs[:10])
asyncio.run(main())
