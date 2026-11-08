// 用法：npx esbuild src/runtime/chapter_save.ts --format=esm --outfile=/tmp/cs.mjs && node tests/chapter_save_test.mjs /tmp/cs.mjs
const mem = new Map(); globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const S = await import(process.argv[2]);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
ok(S.readChapter('ch1') === null, '空存储 → null');
mem.set(S.LEGACY_CH1, JSON.stringify({ stage: 3, cp: 'gate', leaves: [] }));
ok(S.readChapter('ch1')?.stage === 3, '旧档迁移');
ok(mem.has(S.LEGACY_CH1), '旧键保留');
S.writeChapter('ch1', { stage: 5, cp: 'bridge' }); ok(S.readChapter('ch1').stage === 5, '写新档');
S.clearChapter('ch1'); ok(S.readChapter('ch1') === null, '清档后不再迁回旧档');
mem.set(S.SAVE_V2, '{bad json'); ok(S.readChapter('ch1')?.stage === 3, '新档损坏 → 退回旧档迁移');
mem.set(S.SAVE_V2, JSON.stringify({ v: 2, chapters: { ch1: { stage: 'x', cp: 1 } } })); ok(S.readChapter('ch1') === null, '字段不合法 → null');
mem.clear(); mem.set(S.LEGACY_CH1, 'garbage'); ok(S.readChapter('ch1') === null, '旧档损坏 → null');
