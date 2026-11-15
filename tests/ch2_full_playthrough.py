"""C11 第二章整章自动通关：像孩子一样走、按键、点实验面板，从营火一路玩到出口。
途中故意犯错（口令前喊、换错人、退水超时、撞礁石、划桨早按、实验选错结论、支点放错、心跳早按），确认都不惩罚、不卡死。
同时检查：C3–C8 每一步的状态、C9 提示升级、C10 笔记两页、中途离开再进入能续上、离开后碰撞和角色全部释放、JS 堆。
用法：python3 tests/ch2_full_playthrough.py <url> <输出目录>      url 带 ?intro=0&quality=low&warm=0
输出：report.json（每步状态和用时）、若干截图。"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

HELPERS = r"""
window.__T = {
  O(){ return __qhd.game.ch2.world(0,0,0); },
  P(){ return __qhd.game.ch2Play; },
  loc(a){ const O=this.O(), p=(a||__qhd.game.leader).pos; return [+(p.x-O.x).toFixed(2), +p.y.toFixed(2), +(p.z-O.z).toFixed(2)]; },
  step(n=1, dt=0.1){ window.__qhdFixedDt=dt; for(let i=0;i<n;i++) __qhdStep(); window.__qhdFixedDt=1/30; },
  key(code){ dispatchEvent(new KeyboardEvent('keydown',{code})); this.step(1,1/30); dispatchEvent(new KeyboardEvent('keyup',{code})); this.step(1,1/30); },
  walk(x,z,maxT=60){ const g=__qhd.game, O=this.O(); let t=0;
    while(t<maxT){ const p=g.leader.pos, dx=O.x+x-p.x, dz=O.z+z-p.z, d=Math.hypot(dx,dz); if(d<0.45) break;
      window.__qhdTestWish={x:dx/d,z:dz/d}; this.step(1,0.1); t+=0.1; }
    window.__qhdTestWish=null; this.step(2,0.1); return {at:this.loc(), t:+t.toFixed(1)}; },
  route(pts,maxT=90){ let tt=0; for(const [x,z] of pts){ const r=this.walk(x,z,maxT); tt+=r.t; } return {at:this.loc(), t:+tt.toFixed(1)}; },
  st(){ const g=__qhd.game, P=this.P(), s=P?P.s:null; return { stage:g.ch2Stage, active:g.active, squad:g.squad.slice(), team:P&&P.team,
    segs:s&&s.segs, fails:s&&s.fails, relaxed:s&&s.relaxed, posted:P&&{...P.posted}, sensed:P&&P.sensed.slice(), carry:s&&{...s.carry}, taken:s&&s.taken.length,
    boathouse:s&&s.boathouse, crafted:s&&s.crafted, float:s&&{...s.float}, lever:s&&{...s.lever}, fulcrum:s&&s.fulcrum, turtle:s&&s.turtle, leaves:s&&s.leaves.slice(),
    raft:P&&P.raft?{d:+P.raft.d.toFixed(1),u:+P.raft.u.toFixed(2),sec:P.raft.sec,paddled:P.raft.paddled}:null,
    step:P&&P.currentStep(), lastHint:P&&P.lastHint, panel:P&&P.panelOpen, time:+g.ch2Time.toFixed(1),
    say: document.getElementById('say').hidden ? '' : document.getElementById('say').innerText.replace(/\s+/g,' '),
    objective: document.getElementById('objective').innerText.replace(/\s+/g,' '),
    colliders: __qhd.ph.world.colliders.len(), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null }; },
  click(act){ const b=document.querySelector(`#ch2panel button[data-a="${act}"]`); if(!b) return 'no-button:'+act; if(b.disabled) return 'disabled:'+act; b.click(); this.step(2,0.1); return 'ok'; },
  check(label){ const i=[...document.querySelectorAll('#ch2panel input[type=checkbox]')].find(x=>x.dataset.g===label); if(i) i.checked=true; return !!i; },
  panelText(){ const p=document.getElementById('ch2panel'); return p?p.innerText.replace(/\s+/g,' '):''; },
  // 木筏自动掌舵：前方 8 m 内有礁石就往另一边；倒木前一直靠左；到急流按口令划
  raftDrive(maxT=120, hitFirstRock=false){ const P=this.P(), g=__qhd.game; let t=0, hits=0, early=false, lastD=-1; const ROCKS=[{d:25,u:1.0},{d:31,u:-1.0},{d:37,u:0.9}];
    while(t<maxT && P.raft){ const R=P.raft; if(R.d<lastD-1) hits++; lastD=R.d;
      let target=0; const next=ROCKS.find(r=>r.d>R.d-0.5 && r.d-R.d<8); if(next) target = (hitFirstRock && hits===0 && next.d===25) ? next.u : -Math.sign(next.u)*1.3;
      if(R.d>44) target=-1.3;
      window.__qhdTestSteer = Math.abs(target-R.u)>0.1 ? Math.sign(target-R.u) : 0;
      if(R.rhythm){ if(!early){ early=true; this.key('KeyF'); } else if(R.rhythm.beat>=3 && R.rhythm.t>=1.75) this.key('KeyF'); }
      this.step(1,0.1); t+=0.1; }
    window.__qhdTestSteer=0; return {t:+t.toFixed(1), hits, landed:!P.raft}; },
};
"""

async def main():
    rep = {"steps": [], "errors": []}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info"])
        pg = await b.new_page(viewport={"width": 960, "height": 540}); pg.set_default_timeout(600000)
        pg.on("pageerror", lambda e: rep["errors"].append(str(e)[:300]))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=600000)
        await pg.evaluate("localStorage.removeItem('qhd3d_save_v2')")
        await pg.click("#start"); await pg.evaluate("window.__qhdManual=true")
        for _ in range(600):
            if await pg.evaluate("!!(window.__qhd && __qhd.manifest && __qhd.manifest.some(r=>r.id==='wind'||r.id==='legacy_instances'))"): break
            await asyncio.sleep(1)
        await asyncio.sleep(4)
        await pg.evaluate(HELPERS); await pg.evaluate("window.__qhdNoRender=true")
        E = lambda js: pg.evaluate(js)
        await E("__T.step(20,1/30)")
        base = await E("({colliders: __qhd.ph.world.colliders.len(), actors: Object.keys(__qhd.game.actors).length, heap: performance.memory ? performance.memory.usedJSHeapSize/1048576 : null})")
        rep["base"] = base
        t0 = time.time()
        async def mark(name, extra=None, shot=None):
            s = await E("__T.st()"); s["name"] = name; s["wall_s"] = round(time.time() - t0, 1)
            if extra is not None: s["extra"] = extra
            rep["steps"].append(s); print("STEP", name, json.dumps({k: s.get(k) for k in ("stage", "step", "active", "segs", "time", "say")}, ensure_ascii=False)[:300], flush=True)
            if shot: await E("window.__qhdNoRender=false; __T.step(1,1/30)"); await pg.screenshot(path=f"{OUT}/{shot}.png"); await E("window.__qhdNoRender=true")
            return s
        await E("__qhdChapter('ch2')"); await E("__T.step(5,0.1)")
        await mark("进入第二章")

        # ---------- C3 ----------
        await E("__T.key('Digit3'); __T.key('KeyQ')")
        for i, (x, z) in enumerate([(-12, 15.6), (-9, 4.6), (-10, -7.4)]):
            r = await E(f"__T.walk({x},{z})"); await E("__T.step(6,0.1)")
            await mark(f"C3 线索 {i+1}", r)
        await mark("C3 三处线索看完", shot="c3_done")
        await E("__T.key('KeyQ')")

        # ---------- C4 ----------
        await E("__T.key('KeyF')"); s = await mark("C4 派派按 F（应提示换涵涵）")
        await E("__T.key('Digit1')"); r = await E("__T.walk(-7.6,-15.6)"); await E("__T.key('KeyE')")
        await mark("C4 汤团顶撑杆", r)
        await E("__T.key('KeyG')"); await mark("C4 按 G 换到对岸")
        r = await E("__T.walk(7.6,-15.6)"); await E("__T.key('KeyE')"); await mark("C4 佑佑守拉杆", r)
        await E("__T.key('Digit2')"); r = await E("__T.walk(7.4,-8)"); await E("__T.key('KeyF')"); await mark("C4 北北按 F（应提示换佑佑）")
        await E("__T.key('KeyQ')"); await mark("C4 北北摸第 1 段")
        await E("__T.key('Digit1')"); await E("__T.key('KeyF')"); await E("__T.step(26,0.1)")
        await mark("C4 口令后进入退水", shot="c4_window")
        r = await E("__T.walk(2.4,-8,8)"); await E("__T.step(10,0.1)"); await mark("C4 第 1 段过了", r)
        # 第 2 段：故意不走，等超时（不惩罚，回到稳的地方）
        await E("__T.key('KeyQ')"); await E("__T.key('Digit1')"); await E("__T.key('KeyF')"); await E("__T.step(26,0.1)")
        await E("__T.step(80,0.1)"); await mark("C4 第 2 段超时一次")
        await E("__T.key('Digit2')"); await E("__T.walk(2.5,-8,5)"); await E("__T.key('KeyQ')"); await E("__T.key('Digit1')"); await E("__T.key('KeyF')"); await E("__T.step(26,0.1)")
        r = await E("__T.walk(-1.6,-8,8)"); await E("__T.step(10,0.1)"); await mark("C4 第 2 段过了", r)
        await E("__T.key('KeyQ')"); await E("__T.key('Digit1')"); await E("__T.key('KeyF')"); await E("__T.step(26,0.1)")
        r = await E("__T.walk(-5.6,-8,8)"); await E("__T.step(10,0.1)"); await mark("C4 第 3 段过了", r)
        r = await E("__T.walk(-8.5,-8)"); await E("__T.step(120,0.1)")
        await mark("C4 汇合", r, shot="c4_reunited")

        # ---------- C5 / C6 ----------
        r = await E("__T.walk(-13,-11.4)"); await E("__T.key('KeyE')"); await mark("C5 捡到第一根（泡水木）", r)
        r = await E("__T.route([[-10,-2],[-12,5.8]])"); await E("__T.key('KeyE')"); await mark("C5 先去木盒（应提示先试水）", r)
        await E("__T.key('KeyE')"); await mark("C5 再按一次木盒（第二次试错，应自动给提示）")
        r = await E("__T.walk(-9.0,11)"); await E("__T.key('KeyE')"); await mark("C6 打开浮力实验", r, shot="c6_step1")
        await E("__T.check('干浮木')"); await E("__T.click('guess')"); await E("__T.step(14,0.1)")
        await mark("C6 放下水", await E("__T.panelText()"), shot="c6_drop")
        await E("__T.click('next')"); await E("__T.step(14,0.1)"); await mark("C6 加配重", await E("__T.panelText()"), shot="c6_weight")
        await E("__T.click('next')"); await E("__T.click('c1')"); await mark("C6 选错结论", await E("__T.panelText()"))
        await E("__T.click('next')"); await E("__T.click('next')"); await E("__T.click('c0')"); await mark("C6 选对结论")
        for (x, z) in [(-16, -0.6), (-19.6, 13), (-19.6, -6)]:
            await E(f"__T.walk({x},{z})"); await E("__T.key('KeyE')")
        await mark("C5 西岸两根浮木 + 藤绳")
        await E("__T.walk(-16,-14)"); await E("__T.key('KeyE')"); await mark("C5 北北读门牌（应提示佑佑）")
        await E("__T.key('Digit4')"); await E("__T.walk(-16,-14)"); await E("__T.key('KeyE')"); await mark("C5 佑佑开船屋")
        await E("__T.route([[-18,-14],[-19,-14.4]])"); await E("__T.key('KeyE')"); await mark("C5 拿到船桨")
        # 中途离开再进入：进度要续上
        await E("__qhdChapter('ch1')"); await E("__T.step(3,0.1)")
        left = await E("({colliders: __qhd.ph.world.colliders.len(), actors: Object.keys(__qhd.game.actors).length, panel: !!document.getElementById('ch2panel'), hud: !!document.getElementById('ch2hud')})")
        await E("__qhdChapter('ch2')"); await E("__T.step(5,0.1)")
        await mark("续档：离开第二章再回来", {"left": left})
        r = await E("__T.route([[-12,-8],[8,-8],[15.4,3.6]])"); await E("__T.key('KeyE')")
        r2 = await E("__T.route([[11,-12.4]])"); await E("__T.key('KeyE')"); await mark("C5 东岸两根浮木", [r, r2])
        r = await E("__T.route([[8,-8],[-8,-8],[-12,5.8]])"); await E("__T.key('KeyE')"); await mark("C5 木盒做筏", r, shot="c5_raft")
        r = await E("__T.walk(-7.2,6)"); await E("__T.step(10,0.1)"); await E("__T.key('KeyE')"); await mark("C7 上筏", r)

        # ---------- C7 ----------
        await E("__T.key('KeyH'); __T.key('KeyH')"); await mark("C9 木筏上要两次提示")
        rr = await E("__T.raftDrive(160, true)"); await mark("C7 漂流到石龟浅滩", rr, shot="c7_landed")

        # ---------- C8 ----------
        await E("__T.walk(39,50.6)"); await E("__T.key('KeyE')"); await mark("C8 先去推石龟（应提示先练习）")
        r = await E("__T.route([[33,51],[30.6,53.9]])"); await E("__T.key('KeyE')"); await mark("C8 打开杠杆实验", r, shot="c8_step1")
        await E("__T.click('g1')"); await E("__T.click('t2')"); await E("__T.step(15,0.1)"); await E("__T.click('t0')"); await E("__T.step(15,0.1)")
        await mark("C8 试了两个槽", await E("__T.panelText()"), shot="c8_try")
        await E("__T.click('next')"); await E("__T.click('c1')"); await E("__T.click('next')"); await E("__T.click('c0')"); await mark("C8 杠杆结论")
        await E("__T.route([[33,51],[39,50.6]])"); await E("__T.key('KeyE')"); await E("__T.click('f1')"); await E("__T.key('KeyE')"); await E("__T.click('f0')")
        await mark("C8 支点：先放中再放近")
        await E("__T.key('KeyE')"); await mark("C8 还没听心跳就按 E（应提示）")
        await E("__T.key('Digit5')"); await E("__T.route([[31.2,50],[32.6,56]])"); await E("__T.key('KeyQ')")
        await E("__T.key('Digit3')"); await E("__T.route([[33,51],[46,50.5],[45.4,56]])"); await E("__T.key('KeyQ')"); await E("__T.key('KeyQ')")
        await mark("C8 北北听心跳、派派看夹石")
        await E("__T.key('Digit1')"); await E("__T.route([[46,50.5],[39,50.6]])"); await E("__T.key('KeyE')"); await E("__T.step(3,0.1)"); await E("__T.key('KeyE')")
        await mark("C8 心跳早按一次")
        await E("__T.key('KeyE')")
        for _ in range(60):
            ok = await E("(()=>{const R=__T.P().turtle.rhythm; return !!R && R.beat>=3 && R.t>=2.3;})()")
            if ok: break
            await E("__T.step(1,0.1)")
        await E("__T.key('KeyE')"); await E("__T.step(30,0.1)"); await mark("C8 石龟平静", shot="c8_turtle")
        r = await E("__T.route([[47,50.6],[47,64],[40,64],[40,72.8]])"); await E("__T.step(5,0.1)")
        await mark("C8 出口：第二章完成", r, shot="done")

        # ---------- C10 笔记 ----------
        await E("__T.click('notes')"); notes0 = await E("__T.panelText()"); await E("window.__qhdNoRender=false; __T.step(1,1/30)"); await pg.screenshot(path=f"{OUT}/notes_p1.png")
        await E("__T.click('p1')"); notes1 = await E("__T.panelText()"); await pg.screenshot(path=f"{OUT}/notes_p2.png")
        await E("__T.click('close')")
        await mark("C10 笔记两页", {"p1": notes0[:400], "p2": notes1[:400]})
        # 离开：全部释放
        await E("__qhdChapter('ch1')"); await E("__T.step(5,0.1)")
        rep["after_leave"] = await E("({colliders: __qhd.ph.world.colliders.len(), actors: Object.keys(__qhd.game.actors).length, panel: !!document.getElementById('ch2panel'), hud: !!document.getElementById('ch2hud'), heap: performance.memory ? performance.memory.usedJSHeapSize/1048576 : null, save: (JSON.parse(localStorage.getItem('qhd3d_save_v2')||'{}').chapters||{}).ch2})")
        rep["wall_total_s"] = round(time.time() - t0, 1)
        await b.close()

    S = {s["name"]: s for s in rep["steps"]}
    g = lambda n: S.get(n, {})
    checks = {
        "C3_spotted": g("C3 三处线索看完").get("stage") == "spotted",
        "C4_captain_rule": "涵涵" in g("C4 派派按 F（应提示换涵涵）").get("say", "") and "佑佑" in g("C4 北北按 F（应提示换佑佑）").get("say", ""),
        "C4_posts": g("C4 汤团顶撑杆").get("posted", {}).get("brace") and g("C4 佑佑守拉杆").get("posted", {}).get("lever"),
        "C4_team_switch": g("C4 按 G 换到对岸").get("team") == "east",
        "C4_window_opens": g("C4 口令后进入退水").get("step") == "window" and g("C4 口令后进入退水").get("active") == "beibei",
        "C4_seg_progress": [g("C4 第 1 段过了").get("segs"), g("C4 第 2 段超时一次").get("segs"), g("C4 第 2 段过了").get("segs"), g("C4 第 3 段过了").get("segs")] == [1, 1, 2, 3],
        "C4_fail_no_penalty": g("C4 第 2 段超时一次").get("fails") == 1 and g("C4 第 2 段超时一次").get("segs") == 1,
        "C4_reunited": g("C4 汇合").get("stage") == "reunited" and len(g("C4 汇合").get("squad", [])) == 5 and "youyou" in (g("C4 汇合").get("leaves") or []),
        "C5_crate_needs_float": "试水" in g("C5 先去木盒（应提示先试水）").get("say", "") or "试" in g("C5 先去木盒（应提示先试水）").get("say", ""),
        "C9_auto_hint_after_2_errors": (g("C5 再按一次木盒（第二次试错，应自动给提示）").get("lastHint") or {}).get("tier", 0) >= 1,
        "C6_wrong_then_right": g("C6 选错结论").get("float", {}).get("done") is False and g("C6 选对结论").get("float", {}).get("done") is True,
        "C5_boathouse_needs_youyou": not g("C5 北北读门牌（应提示佑佑）").get("boathouse") and g("C5 佑佑开船屋").get("boathouse"),
        "C5_oar": g("C5 拿到船桨").get("carry", {}).get("oar") is True,
        "resume_after_leave": g("续档：离开第二章再回来").get("stage") == "reunited" and g("续档：离开第二章再回来").get("segs") == 3 and g("续档：离开第二章再回来").get("carry", {}).get("oar") is True,
        "leave_releases_midway": g("续档：离开第二章再回来").get("extra", {}).get("left", {}).get("colliders") == rep["base"]["colliders"] and g("续档：离开第二章再回来").get("extra", {}).get("left", {}).get("actors") == rep["base"]["actors"],
        "C5_crafted": g("C5 木盒做筏").get("crafted") is True,
        "C7_boarded": g("C7 上筏").get("stage") == "raft",
        "C9_manual_hint_tiers": (g("C9 木筏上要两次提示").get("lastHint") or {}).get("tier", 0) == 2,
        "C7_landed": g("C7 漂流到石龟浅滩").get("stage") == "turtle" and g("C7 漂流到石龟浅滩").get("extra", {}).get("landed") and g("C7 漂流到石龟浅滩").get("extra", {}).get("hits", 0) >= 1,
        "C8_lever_first": not g("C8 先去推石龟（应提示先练习）").get("fulcrum") and "练习" in g("C8 先去推石龟（应提示先练习）").get("say", ""),
        "C8_lever_done": g("C8 杠杆结论").get("lever", {}).get("done") is True and len(g("C8 杠杆结论").get("lever", {}).get("tried", [])) >= 2,
        "C8_fulcrum": g("C8 支点：先放中再放近").get("fulcrum") is True,
        "C8_turtle_calm": g("C8 石龟平静").get("turtle") is True and "beibei" in (g("C8 石龟平静").get("leaves") or []),
        "C8_done": g("C8 出口：第二章完成").get("stage") == "done",
        "C10_notes": "我猜" in g("C10 笔记两页").get("extra", {}).get("p1", "") and "我看到" in g("C10 笔记两页").get("extra", {}).get("p1", "") and "支点离石头越近" in g("C10 笔记两页").get("extra", {}).get("p2", ""),
        "leave_releases_all": rep["after_leave"]["colliders"] == rep["base"]["colliders"] and rep["after_leave"]["actors"] == rep["base"]["actors"] and not rep["after_leave"]["panel"] and not rep["after_leave"]["hud"],
        "no_page_errors": not rep["errors"],
    }
    rep["checks"] = checks; rep["pass"] = all(checks.values())
    rep["bot_game_time_s"] = g("C8 出口：第二章完成").get("time")
    json.dump(rep, open(f"{OUT}/report.json", "w"), ensure_ascii=False, indent=1)
    print("RESULT", json.dumps({"pass": rep["pass"], "failed": [k for k, v in checks.items() if not v], "bot_time": rep["bot_game_time_s"], "errors": rep["errors"][:3], "after_leave": rep["after_leave"], "base": rep["base"]}, ensure_ascii=False))

asyncio.run(main())
