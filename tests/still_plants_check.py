"""找不随风动的近景植物：名字像草/蕨/灌木/花/叶，但材质没有挂风（模型里 _wind_weight 全零或没有这个属性）。
用法：python3 tests/still_plants_check.py <URL>
"""
import asyncio, sys, json
from playwright.async_api import async_playwright
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
JS = r"""(()=>{const re=/grass|fern|bush|flower|leaf|leaves|shrub|plant|tuft|frond|vine|moss_mat/i; const still={}, moving={}; let amps=new Set();
 __qhd.scene.traverse(o=>{ if(!o.isMesh) return; const nm=o.name; if(!re.test(nm)) return; const mats=[].concat(o.material);
   const k=mats.map(m=>m.customProgramCacheKey?m.customProgramCacheKey():'').join('|'); const w=/wind[0-9.]/.exec(k);
   let top=o; while(top.parent&&top.parent!==__qhd.scene) top=top.parent; const key=top.name.replace(/_\d+$/,'')+' / '+nm.slice(0,40);
   const ha=!!o.geometry.attributes._wind_weight; const bag=w?moving:still; bag[key]=(bag[key]||0)+1; if(w) amps.add(k.match(/wind([0-9.]+)/)[1]); if(!w) bag[key+(ha?' [权重全零]':' [没有权重]')]=(bag[key+(ha?' [权重全零]':' [没有权重]')]||0)+1, delete bag[key]; });
 return {moving:Object.keys(moving).length, amps:[...amps], still};})()"""
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
        print(json.dumps(await pg.evaluate(JS), ensure_ascii=False, indent=0)); print("errors:", errs[:5])
        await b.close()
asyncio.run(main())
