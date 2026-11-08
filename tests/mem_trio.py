"""三人带动作模型同时在场的内存：无模型 vs 三个模型（各 60 秒，每 10 秒采样）。"""
import asyncio, sys, time, json, psutil
from playwright.async_api import async_playwright
ROOT = sys.argv[1]
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
Q = "model_tangtuan=/incoming/char_tangtuan_locomotion_candidate_v002.glb&model_paipai=/incoming/char_paipai_locomotion_candidate_v003.glb&model_hanhan=/incoming/char_hanhan_tpose_rig_candidate_v003.glb&anim_hanhan=tangtuan"
def rss():
    t = 0
    for p in psutil.process_iter(["cmdline"]):
        try:
            cl = " ".join(p.info["cmdline"] or [])
            if "pw-browsers" in cl and ("--type=renderer" in cl or "--type=gpu-process" in cl): t += p.memory_info().rss
        except Exception: pass
    return round(t / 1048576)
async def run(q):
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width": 1280, "height": 760}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(f"{ROOT}/game/dist/index.html?look=env&" + q); await pg.wait_for_selector("#start:not([disabled])"); await pg.click("#start")
        # 让领队来回走，动作一直在播
        mem = []; t0 = time.time(); k = 0
        while time.time() - t0 < 60:
            key = "KeyW" if k % 2 == 0 else "KeyS"; await pg.keyboard.down(key); await asyncio.sleep(5); await pg.keyboard.up(key); k += 1
            if k % 2 == 0: mem.append(rss())
        await b.close(); return {"mem": mem, "avg": round(sum(mem) / len(mem)), "errors": errs[:5]}
async def main():
    a = await run(""); m = await run(Q)
    r = {"without_models": a, "with_three_animated": m, "delta_mb": m["avg"] - a["avg"]}
    print(json.dumps(r, ensure_ascii=False)); json.dump(r, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
asyncio.run(main())
