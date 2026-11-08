"""同一模型在游戏里不同灯光设置下的固定机位 A/B 截图。
用法：python3 tests/look_ab.py <URL根> <GLB路径> <角色id> <输出目录> [look列表，逗号分隔]
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
ROOT, GLB, CID, OUT = sys.argv[1:5]
LOOKS = (sys.argv[5] if len(sys.argv) > 5 else "old,new,env").split(",")
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
BACK = -2.14  # 镜头在角色的 -X-Z 一侧，太阳在角色身后
# (名称, 角色朝向yaw, 镜头yaw, 俯角, 距离)；角色 yaw = 镜头 yaw 时正对镜头
SPOTS = [("play_34", 0.6, 0.0, 0.32, 4.5), ("play_front", 0.0, 0.0, 0.25, 4.5),
         ("close_front", 0.0, 0.0, 0.05, 0.85), ("close_34", 0.7, 0.0, 0.08, 0.9),
         ("close_side", 1.5708, 0.0, 0.08, 0.95), ("turn_back34", 2.4, 0.0, 0.15, 1.2),
         ("backlit_front", BACK, BACK, 0.08, 0.9), ("backlit_play", BACK + 0.5, BACK, 0.3, 4.5)]
async def main():
    os.makedirs(OUT, exist_ok=True); rep = {}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
        for look in LOOKS:
            pg = await b.new_page(viewport={"width": 1280, "height": 760})
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            await pg.goto(f"{ROOT}/game/dist/index.html?look={look}&model_{CID}={ROOT}{GLB}")
            await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start"); await asyncio.sleep(2)
            await pg.add_style_tag(content="#say,#toast,#hud,#party,#keys,#objective,#leaves{visibility:hidden!important}")
            for _ in range(80):
                if CID in (await pg.evaluate("(__qhd.models||{})")): break
                await asyncio.sleep(0.5)
            await pg.evaluate(f"__qhd.game.switchTo('{CID}')"); await asyncio.sleep(1)
            P = "__qhd.game.leader.pos.constructor"
            for name, ayaw, cyaw, pitch, dist in SPOTS:
                await pg.evaluate(f"(()=>{{const g=__qhd.game; g.leader.teleport(new {P}(0,0.05,6),{ayaw}); __qhd.cam.yaw={cyaw}; __qhd.cam.pitch={pitch}; __qhd.cam.dist={dist};}})()")
                await asyncio.sleep(1.6)
                await pg.screenshot(path=f"{OUT}/{look}_{name}.png")
            rep[look] = {"look_applied": await pg.evaluate("__qhd.look||null"), "errors": errs[:10]}
            await pg.close()
        await b.close()
    json.dump(rep, open(f"{OUT}/look_ab.json", "w"), ensure_ascii=False, indent=1); print(json.dumps(rep, ensure_ascii=False))
asyncio.run(main())
