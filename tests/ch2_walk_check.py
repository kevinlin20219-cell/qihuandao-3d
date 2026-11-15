"""C2 第二章七区灰盒：能走的地方都有地、河和石龟池没有地、从出生点能走到哪里、河边和池边挡得住、预留口子能开能关。
用法：python3 tests/ch2_walk_check.py <url> <输出目录>
url 建议带 ?intro=0&quality=low&warm=0。云端 2 核软件渲染很慢：点开始后马上停掉连续渲染，只手动推帧。"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# 页面里用物理射线做网格采样和连通（不需要渲染）
PROBE = r"""(() => {
  const q = __qhd, g = q.game, sh = g.ch2, V = q.camera.position.constructor, O = sh.world(0, 0, 0);
  const down = new V(0, -1, 0);
  const groundAt = (x, z) => { const f = new V(O.x + x, 5, O.z + z); const t = g.ph.ray(f, down, 8); return t == null ? null : 5 - t; };
  const inside = (r, x, z, m) => x > r[0] + m && x < r[1] - m && z > r[2] + m && z < r[3] - m;
  const res = { walk: {}, nowalk: {} };
  for (const r of sh.layout.walk) { let n = 0, ok = 0, bad = []; for (let x = r.xz[0] + 0.8; x < r.xz[1] - 0.79; x += 1) for (let z = r.xz[2] + 0.8; z < r.xz[3] - 0.79; z += 1) { n++; const y = groundAt(x, z); if (y != null && y > -0.02) ok++; else if (bad.length < 5) bad.push([x, z, y]); } res.walk[r.id] = { n, ok, bad }; } // C4 起地上有船屋、试水槽、练习石：落在道具顶上（y>0）不算缺地，只查有没有洞
  for (const r of sh.layout.nowalk) { let n = 0, hit = 0, bad = []; for (let x = r.xz[0] + 0.3; x < r.xz[1] - 0.29; x += 1) for (let z = r.xz[2] + 0.3; z < r.xz[3] - 0.29; z += 1) { n++; const y = groundAt(x, z); if (y != null) { hit++; if (bad.length < 5) bad.push([x, z, y]); } } res.nowalk[r.id] = { n, hit, bad }; }
  // 连通：0.5 m 网格，从出生点出发；相邻两格都要有地（y≈0），且两格之间 0.4 m 高处的水平射线没被挡
  const S = 0.5, key = (i, j) => i + ',' + j, seen = new Set(), sp = sh.spawn.pos;
  const si = Math.round((sp.x - O.x) / S), sj = Math.round((sp.z - O.z) / S);
  const okCell = (i, j) => { const y = groundAt(i * S, j * S); return y != null && Math.abs(y) < 0.02; };
  const free = (i, j, di, dj) => { const f = new V(O.x + i * S, 0.4, O.z + j * S), d = new V(di, 0, dj); return g.ph.ray(f, d, S) == null; };
  const st = [[si, sj]]; seen.add(key(si, sj));
  while (st.length) { const [i, j] = st.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj, k = key(a, b); if (seen.has(k) || a < -70 || a > 120 || b < -100 || b > 170) continue; if (!okCell(a, b) || !free(i, j, di, dj)) continue; seen.add(k); st.push([a, b]); } }
  const reach = {}; for (const r of sh.layout.walk) { let n = 0, inR = 0; for (const c of seen) { const [i, j] = c.split(',').map(Number); if (inside(r.xz, i * S, j * S, 0)) inR++; } for (let x = r.xz[0] + 0.8; x < r.xz[1] - 0.79; x += S) for (let z = r.xz[2] + 0.8; z < r.xz[3] - 0.79; z += S) n++; reach[r.id] = +(inR / Math.max(1, n)).toFixed(2); }
  let inWater = 0; for (const c of seen) { const [i, j] = c.split(',').map(Number); for (const r of sh.layout.nowalk) if (inside(r.xz, i * S, j * S, 0)) inWater++; }
  res.reach = reach; res.reachCells = seen.size; res.reachInWater = inWater;
  res.gates = Object.fromEntries(Object.values(sh.gates).map((x) => [x.id, x.open]));
  res.stats = sh.stats;
  return res;
})()"""

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 960, "height": 540}); pg.set_default_timeout(300000); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=600000)
        await pg.click("#start"); await pg.evaluate("window.__qhdManual=true")
        for _ in range(600):
            if await pg.evaluate("!!(window.__qhd && __qhd.manifest && __qhd.manifest.some(r=>r.id==='wind'||r.id==='legacy_instances') )"): break
            await asyncio.sleep(1)
        await asyncio.sleep(5)
        async def step(n=1, dt=1/30):
            await pg.evaluate(f"(()=>{{window.__qhdFixedDt={dt}; for(let i=0;i<{n};i++) __qhdStep(); window.__qhdFixedDt=1/30;}})()")
        for _ in range(40):  # 开始游戏要几帧（入口动画收尾）：推帧直到真的进入游戏，物理才开始步进
            if await pg.evaluate("__qhd.playing"): break
            await step(1)
        print("PLAYING", await pg.evaluate("__qhd.playing"), flush=True)
        await pg.evaluate("__qhdChapter('ch2')"); await step(3)
        probe = await pg.evaluate(PROBE); print("PROBE", json.dumps(probe, ensure_ascii=False)[:1500], flush=True)

        # 真走：从岸上朝河 / 池子走 4 秒（每隔一秒跳一次），看会不会掉下去
        async def push(name, sx, sz, dx, dz, secs=4.0):
            await pg.evaluate(f"(()=>{{const g=__qhd.game; g.leader.teleport(g.ch2.world({sx},0.05,{sz}),0); window.__qhdTestWish={{x:{dx},z:{dz}}};}})()")
            for k in range(int(secs)):
                await pg.keyboard.down("Space"); await step(1); await pg.keyboard.up("Space"); await step(5, 0.2)
            p = await pg.evaluate("(()=>{const g=__qhd.game,O=g.ch2.world(0,0,0),a=g.leader.pos; window.__qhdTestWish=null; return [a.x-O.x,a.y,a.z-O.z, g.respawning>0];})()")
            return {"name": name, "end_local": [round(v, 2) for v in p[:3]], "respawning": p[3]}
        pushes = [
            await push("西岸→河（入口段）", -9, 22, 1, 0),
            await push("西岸→河（码头段，上筏口关着）", -9, 6, 1, 0),
            await push("西岸→河（踏石口关着）", -9, -8, 1, 0),
            await push("西岸→上游尽头", -14, -36, 0, -1),
            await push("西岸→西边土坡", -19, 0, -1, 0),
            await push("入口→南边土坡", -14, 27, 0, 1),
            await push("东岸→河", 9, -2, -1, 0),
            await push("东岸→下游急流", 14, 11, 0, 1),
            await push("石龟滩→池子（南边）", 39, 49, 0, 1),
            await push("石龟滩→南边水面", 40, 48.5, 0, -1),
        ]
        await pg.screenshot(path=f"{OUT}/01_turtle_edge.png")
        # 预留口子：打开踏石口，从西岸朝河走，应该走出岸边掉进河（C4 会在口子外面放踏石）；再关上
        await pg.evaluate("__qhd.game.ch2.gates.stones_w.setOpen(true)")
        gate_open = await push("踏石口打开后朝河走", -9, -8, 1, 0, 3.0)
        await step(30, 0.2)  # 等掉水重来
        after = await pg.evaluate("(()=>{const g=__qhd.game,O=g.ch2.world(0,0,0),a=g.leader.pos; return [a.x-O.x,a.y,a.z-O.z];})()")
        await pg.evaluate("__qhd.game.ch2.gates.stones_w.setOpen(false)")
        gate_closed = await push("踏石口关回后朝河走", -9, -8, 1, 0)
        cols_after = await pg.evaluate("__qhd.ph.world.colliders.len()")
        # 灰盒全景：从入口上方看上游
        await pg.evaluate("(()=>{const O=__qhd.game.ch2.world(0,0,0); __qhd.camOverride={pos:[O.x-20,26,O.z+40],look:[O.x+2,0,O.z-12]};})()"); await step(2)
        await pg.screenshot(path=f"{OUT}/02_overview_upstream.png")
        await pg.evaluate("(()=>{const O=__qhd.game.ch2.world(0,0,0); __qhd.camOverride={pos:[O.x+20,30,O.z+20],look:[O.x+38,0,O.z+58]};})()"); await step(2)
        await pg.screenshot(path=f"{OUT}/03_overview_turtle.png")
        await pg.evaluate("__qhd.camOverride=null")
        await b.close()

    w = probe["walk"]; nw = probe["nowalk"]; r = probe["reach"]
    west = ["A_entry", "B_west_bank", "D_upstream_w"]; east = ["C_east_bank", "D_upstream_e"]; g = [k for k in r if k.startswith("G_")]
    res = {
        "url": URL, "errors": errs,
        "walk_ground_ok": all(v["ok"] == v["n"] for v in w.values()), "walk": w,
        "nowalk_clear": all(v["hit"] == 0 for v in nw.values()), "nowalk": nw,
        "reach": r, "reach_cells": probe["reachCells"], "reach_in_water": probe["reachInWater"],
        "west_connected": all(r[k] >= 0.95 for k in west),
        "east_and_turtle_unreachable_yet": all(r[k] == 0 for k in east + g),
        "pushes": pushes,
        "edges_hold": all((not p["respawning"]) and p["end_local"][1] > -0.1 for p in pushes),
        "gate_open_push": gate_open, "after_gate_open": [round(v, 2) for v in after],
        # 口子打开：走出岸边掉河。3 秒里可能已经掉下去并回到出生点（-14,25），所以「正在重来」「已经越过岸边」「回到了出生点」都算通过
        "gate_open_lets_through": gate_open["respawning"] or gate_open["end_local"][0] > -5.5 or gate_open["end_local"][1] < -0.1 or (abs(gate_open["end_local"][0] + 14) < 1 and abs(gate_open["end_local"][2] - 25) < 1),
        "gate_closed_holds": (not gate_closed["respawning"]) and gate_closed["end_local"][1] > -0.1 and gate_closed["end_local"][0] < -5.9,
        "gate_closed_push": gate_closed, "colliders_after_gate_cycle": cols_after,
        "stats": probe["stats"], "gates": probe["gates"],
    }
    res["pass"] = all(res[k] for k in ["walk_ground_ok", "nowalk_clear", "west_connected", "east_and_turtle_unreachable_yet", "edges_hold", "gate_open_lets_through", "gate_closed_holds"]) and not errs
    json.dump(res, open(f"{OUT}/report.json", "w"), ensure_ascii=False, indent=1)
    print("RESULT", json.dumps({k: res[k] for k in ["pass", "walk_ground_ok", "nowalk_clear", "west_connected", "east_and_turtle_unreachable_yet", "edges_hold", "gate_open_lets_through", "gate_closed_holds", "reach", "errors"]}, ensure_ascii=False))

asyncio.run(main())
