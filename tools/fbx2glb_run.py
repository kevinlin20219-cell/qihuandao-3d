import asyncio, json, base64, os, hashlib, sys
from playwright.async_api import async_playwright
OUT=sys.argv[1]; H=sys.argv[2] if len(sys.argv)>2 else "0"
FBX="/incoming/paipai_fbx/tripo_convert_bb44f78f-b969-4c83-8665-fac6db00499e.fbx"
async def main():
    os.makedirs(OUT+"/shots",exist_ok=True)
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":600,"height":800}); logs=[]
        pg.on("console",lambda m: logs.append(m.text[:200])); pg.on("pageerror",lambda e: logs.append("ERR "+str(e)))
        await pg.goto(f"http://127.0.0.1:8801/game/tools/fbx2glb.html?fbx={FBX}&h={H}&tex=/incoming/paipai_fbx/tripo_convert_bb44f78f-b969-4c83-8665-fac6db00499e.fbm/&texpre=char_paipai_mixamo_rig_raw_v001_")
        for _ in range(240):
            if await pg.evaluate("window.__R&&__R.done"): break
            await asyncio.sleep(0.5)
        R=await pg.evaluate("__R"); shots=await pg.evaluate("__shots"); g=await pg.evaluate("window.__glb||''")
        for k,v in shots.items(): open(f"{OUT}/shots/{k}.png","wb").write(base64.b64decode(v.split(",")[1]))
        if g:
            data=base64.b64decode(g); p=f"{OUT}/char_paipai_rig_cloud_v001.glb"; open(p,"wb").write(data); R["glbSha256"]=hashlib.sha256(data).hexdigest()
        R["consoleTail"]=logs[-15:]
        json.dump(R,open(f"{OUT}/conversion_report.json","w"),ensure_ascii=False,indent=1)
        await b.close()
asyncio.run(main())
