"""远景层风动检查（0243）：远景层的克隆材质要同时带风（wind）和远雾（_far），近处同模型的材质不带 _far。
用法：python3 tests/far_wind_check.py <URL>
"""
import asyncio, sys, json
from playwright.async_api import async_playwright
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
JS = """(()=>{const out={far:0,farWind:0,farFog:0,nearFar:0,keys:{}};const farSet=new Set();
 __qhd.scene.traverse(o=>{const m=o; if(!m.isMesh) return; for(const mt of [].concat(m.material)){ const k=mt.customProgramCacheKey?mt.customProgramCacheKey():''; if(mt._farDone){farSet.add(mt);} }});
 __qhd.scene.traverse(o=>{const m=o; if(!m.isMesh) return; for(const mt of [].concat(m.material)){ const k=mt.customProgramCacheKey?mt.customProgramCacheKey():'';
   if(mt._farDone){out.far++; if(/wind/.test(k)) out.farWind++; if(/_far/.test(k)) out.farFog++; out.keys[k]=(out.keys[k]||0)+1;} else if(/_far/.test(k)) out.nearFar++; }});
 return out;})()"""
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 640, "height": 400}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(sys.argv[1]); await pg.wait_for_selector("#start:not([disabled])", timeout=60000); await pg.click("#start")
        for _ in range(4000):
            if await pg.evaluate("!!__qhd.manifest"): break
            await asyncio.sleep(0.2)
        await asyncio.sleep(2)
        r = await pg.evaluate(JS); print(json.dumps(r, ensure_ascii=False)); print("errors:", errs[:5])
        await b.close()
asyncio.run(main())
