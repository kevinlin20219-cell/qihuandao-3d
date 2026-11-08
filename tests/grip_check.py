"""0267 吊桥起风抓扶绳实机检查：三人上桥 → 强制起风 → 看站位、左右手、in/loop/out 阶段、手和扶绳的距离 → 风停松手。
用法：python3 tests/grip_check.py <URL> <输出目录>"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
ST = """(()=>{const g=__qhd.game, out={}; for(const [id,a] of Object.entries(g.actors)){ const I=a.inter; const hb=n=>{let b=null; a.model&&a.model.traverse(o=>{ if(!b&&o.isBone&&o.name.replace(/^mixamorig:?/,'')===n) b=o; }); if(!b) return null; const p=b.getWorldPosition(a.pos.clone()); return p.toArray().map(v=>+v.toFixed(3));};
  const G=(window.__qhdGrip||{})[id]||{}; out[id]={x:+a.pos.x.toFixed(3), z:+a.pos.z.toFixed(2), y:+a.pos.y.toFixed(3), yaw:+a.yaw.toFixed(2), cur:I&&I.cur, state:I&&I.state, f:I&&+I.f.toFixed(2), hand:G.hand, L:hb('LeftHand'), R:hb('RightHand')}; } out.wind=g.wind.phase; return out;})()"""
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":1280,"height":720}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
        for _ in range(6000):
            if await pg.evaluate("!!__qhd.manifest && Object.values(__qhd.game.actors).every(a=>a.inter&&a.inter.sets.bridge_grip_left)"): break
            await asyncio.sleep(0.2)
        print("grip libs:", await pg.evaluate("JSON.stringify(__qhd.grip)"), "sets:", await pg.evaluate("JSON.stringify(Object.fromEntries(Object.entries(__qhd.game.actors).map(([k,a])=>[k,a.inter?Object.keys(a.inter.sets):null])))"))
        print("voice:", await pg.evaluate("(()=>{const L=window.__qhdLines; if(!L) return 'no lines'; const l=L.find('hanhan','派派，用你的放大镜看看北边的藤蔓（按 3 换成派派，再按 Q）。'); return JSON.stringify(l);})()"))
        await pg.evaluate("__qhd.game.applyStage(5, true)")
        P = "__qhd.game.leader.pos.constructor"
        # 三人在桥上：领队靠右（x=+0.3 朝 -Z 走向对岸）、两个伙伴在后面一左一中
        await pg.evaluate(f"""(()=>{{const g=__qhd.game, L=g.leader; L.teleport(new {P}(0.3,1.25,-58),Math.PI); const fs=g.followers(); fs[0].teleport(new {P}(-0.4,1.25,-56.5),Math.PI); fs[1].teleport(new {P}(0.1,1.25,-55),Math.PI); for(const f of fs){{f.goal=null;}} __qhd.cam.yaw=Math.PI*0.75; __qhd.cam.pitch=0.25; __qhd.cam.dist=5;}})()""")
        await asyncio.sleep(2)
        await pg.evaluate("(()=>{const W=__qhd.game.wind; W.phase='gust'; W.t=6.0;})()")
        g0 = await pg.evaluate("__qhd.game.time")
        for t,tag in [(0.25,'in'),(1.0,'loop1'),(2.2,'loop2')]:
            while (await pg.evaluate("__qhd.game.time")) - g0 < t: await asyncio.sleep(0.1)
            s = await pg.evaluate(ST); print(tag, json.dumps(s, ensure_ascii=False)); await pg.screenshot(path=f"{OUT}/{tag}.png")
            if tag == 'loop2':
                # 扶绳实际高度：在每个人的 z 上，从上往下打到 VIS_bridge_rope_±1
                print("rail y:", await pg.evaluate("""(()=>{const rc=new __qhd.RC(), o=__qhd.camera.position.clone(), d=o.clone().set(0,-1,0), ms=[]; __qhd.scene.traverse(m=>{ if(m.isMesh&&/bridge_rope/.test(m.name)) ms.push(m); }); const out={};
                  for (const [id,a] of Object.entries(__qhd.game.actors)) { const r=[]; for (const x of [-1.21,1.21]) { o.set(x,5,a.pos.z); rc.set(o,d); const h=rc.intersectObjects(ms,true)[0]; r.push(h? +h.point.y.toFixed(3):null); } out[id]=r; } return out;})()"""))
                for k,(yaw,pitch,dist) in {"side_r":(Math.PI if False else 1.5708,0.12,3.2),"side_l":(-1.5708,0.12,3.2)}.items() if False else []: pass
                for k,yaw in [("side_a",1.5708),("side_b",-1.5708)]:
                    await pg.evaluate(f"(()=>{{__qhd.cam.yaw={yaw}; __qhd.cam.pitch=0.12; __qhd.cam.dist=3.4;}})()")
                    g1 = await pg.evaluate("__qhd.game.time")
                    while (await pg.evaluate("__qhd.game.time")) - g1 < 0.25: await asyncio.sleep(0.1)
                    await pg.screenshot(path=f"{OUT}/{k}.png")
        for _ in range(900):  # 云端软件渲染帧率低，游戏时间走得慢：按游戏里的风相位等
            if await pg.evaluate("__qhd.game.wind.phase") != 'gust': break
            await asyncio.sleep(0.2)
        t0 = await pg.evaluate("__qhd.game.time")
        while (await pg.evaluate("__qhd.game.time")) - t0 < 0.3: await asyncio.sleep(0.1)
        s = await pg.evaluate(ST); print("out", json.dumps(s, ensure_ascii=False)); await pg.screenshot(path=f"{OUT}/out.png")
        t0 = await pg.evaluate("__qhd.game.time")
        while (await pg.evaluate("__qhd.game.time")) - t0 < 1.2: await asyncio.sleep(0.1)
        s = await pg.evaluate(ST); print("after", json.dumps(s, ensure_ascii=False))
        print("rope:", await pg.evaluate("(()=>{const r=[]; __qhd.scene.traverse(o=>{ if(/rail|rope|hand/i.test(o.name)&&o.isMesh&&r.length<6){ const bb=new __qhd.camera.position.constructor(); o.getWorldPosition(bb); r.push(o.name+':'+bb.toArray().map(v=>v.toFixed(2)).join(','));} }); return r;})()"))
        print("errors:", [e for e in errs if 'Failed to fetch' not in e][:6]); await b.close()
asyncio.run(main())
