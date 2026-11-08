"""第一章钩绳套件（0071）状态检查：瞬移到各处按 E，检查显隐 + 背包图标 + 读档恢复，最后拼一张总览图。
用法：python3 tests/kit_check.py <带 env_manifest 的 URL> <输出目录>
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
from PIL import Image
URL, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
STATE = """(()=>{const L=__qhd.game.level, vis=o=>{if(!o) return null; for(let p=o;p;p=p.parent) if(!p.visible) return false; return true;}, g=n=>__qhd.game.level.root?null:null;
 const hook=L.pickups[0], vine=L.pickups[1];
 return {bag:[...__qhd.game.bag], bagImg:document.querySelectorAll('#bag img').length,
  stump:vis(hook.group.getObjectByName('VIS_old_stump')), hookItem:vis(hook.item), hookItemName:hook.item.name,
  vineItem:vis(vine.item), broken:vis(L.ropeclipFix.broken), fixed:vis(L.ropeclipFix.fixed?L.ropeclipFix.fixedVis:L.ropeclipFix.fixedVis), ropeFixed:L.ropeclipFix.fixed,
  bench:vis(L.workbench.group.children[0]), benchPos:L.workbench.group.position.toArray(), bagText:document.querySelector('#bag')?.textContent||'', y:+__qhd.game.leader.pos.y.toFixed(2)}})()"""

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 960, "height": 600})
        logs = []; pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}")); pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        async def boot():
            await pg.goto(URL); await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
            for _ in range(4000):
                if await pg.evaluate("!!__qhd.manifest"): break
                await asyncio.sleep(0.2)
            await asyncio.sleep(1)
        async def tp(x, y, z, yaw=0):
            await pg.evaluate(f"(()=>{{const a=__qhd.game.leader; a.teleport(a.pos.clone().set({x},{y},{z}), {yaw}); __qhd.cam.yaw={yaw};}})()"); await frames(4)
        async def frames(n):  # 按游戏帧等（场景重时云端软件渲染很慢，固定秒数不够）
            for _ in range(n): await pg.evaluate("new Promise(r=>requestAnimationFrame(()=>r()))")
        async def press_e():
            await pg.keyboard.down("KeyE"); await frames(3); await pg.keyboard.up("KeyE"); await frames(4)
        shots = []
        async def step(tag):
            s = await pg.evaluate(STATE); print(f"{tag:<12}", json.dumps(s, ensure_ascii=False), flush=True)
            p = f"{OUT}/{len(shots):02d}_{tag}.png"; await pg.screenshot(path=p); shots.append(p); return s
        await pg.goto(URL); await pg.evaluate("localStorage.clear()"); await boot()
        res = {}
        res['start'] = await step("start")
        await tp(-24.2, 0.05, -8.2, 0); await press_e(); await frames(90)  # v52：挪步 0.25 s + 蹲拿，手碰到铁钩（约 1 s）才收起
        res['hook'] = await step("took_hook")
        await pg.evaluate("(()=>{const v=__qhd.game.level.pickups[1]; v.visible=true; v.group.visible=true;})()")
        await tp(1.2, 0.05, -15.3, 0); await press_e()
        res['vine'] = await step("took_vine")
        await tp(0, 1.6, -41.5, 0); await frames(40)
        res['stumpgone'] = await step("old_stump_spot")
        await tp(-6.5, 1.6, -38.9, 0); await press_e()
        res['craft'] = await step("crafted")
        await pg.evaluate("__qhd.game.applyStage(4, true)")
        await tp(2.6, 1.55, -47.6, 0); await press_e()
        res['fix'] = await step("installed")
        await pg.evaluate("__qhd.game.save()"); await boot()
        res['reload'] = await step("reloaded")
        checks = {
            "开局铁钩可见、木桩可见": res['start']['hookItem'] and res['start']['stump'],
            "捡铁钩后木桩还在、铁钩不见": res['hook']['stump'] and res['hook']['hookItem'] is False and 'iron_hook' in res['hook']['bag'],
            "捡藤条后藤卷不见": res['vine']['vineItem'] is False and 'vine_rope' in res['vine']['bag'],
            "做成钩绳": res['craft']['bag'] == ['hook_rope'],
            "背包显示 PNG 图标": res['hook']['bagImg'] >= 1 and res['craft']['bagImg'] == 1,
            "装上后断钩藏、修好的显示": res['fix']['ropeFixed'] and res['fix']['broken'] is False and res['fix']['fixed'] and res['fix']['bag'] == [],
            "读档后木桩在、铁钩不见、绳扣修好": res['reload']['stump'] and res['reload']['hookItem'] is False and res['reload']['ropeFixed'] and res['reload']['fixed'] and res['reload']['broken'] is False,
            "工作台模型可见": res['start']['bench'],
            "制作点在桥头木盒": abs(res['start']['benchPos'][0]+6.5)<0.01 and abs(res['start']['benchPos'][2]+40)<0.01,
            "旧树桩位置可以站人（无圆柱碰撞）": res['stumpgone']['y'] < 1.75,
            "背包显示完整名字": '结实的藤条' in res['vine']['bagText'],
        }
        for k, v in checks.items(): print("✓" if v else "✗", k)
        W, H = 320, 200; sheet = Image.new("RGB", (W * 3, H * 2))
        for i, p in enumerate(shots[:6]): sheet.paste(Image.open(p).resize((W, H)), ((i % 3) * W, (i // 3) * H))
        sheet.save(f"{OUT}/contact_sheet.png")
        errs = [l for l in logs if "error" in l.lower()]; print("errors:", errs[:8])
        await b.close(); sys.exit(0 if all(checks.values()) and not errs else 1)
asyncio.run(main())
