// B1 版本化存档（0306 计划）。新键 qhd3d_save_v2：{ v: 2, current, chapters: { ch1: {...} }, migrated, updated }。
// 旧的第一章存档 qhd3d_ch1_slice_v1 只读不删：第一次读到时迁移进新格式（migrated=true 之后不再看旧键，
// 这样「重新开始」清掉新档后，旧档不会又被迁回来）。任何解析或校验失败都当作没有存档（返回 null），不抛错。
export const SAVE_V2 = 'qhd3d_save_v2';
export const LEGACY_CH1 = 'qhd3d_ch1_slice_v1';
export type ChapterId = 'ch1' | 'ch2';
export interface SaveFile { v: 2; current: ChapterId; chapters: Partial<Record<ChapterId, Record<string, unknown>>>; migrated: boolean; updated: number }

const store = (): Storage | null => { try { return localStorage; } catch { return null; } };
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** 第一章存档的最低校验：stage 是数字、cp 是字符串，其余字段由 Game.load 自己兜底 */
export function validCh1(x: unknown): x is Record<string, unknown> {
  return isObj(x) && typeof x.stage === 'number' && Number.isFinite(x.stage) && x.stage >= 0 && x.stage < 32 && typeof x.cp === 'string';
}

function parse(raw: string | null): unknown { if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }

export function readFile(): SaveFile | null {
  const s = store(); if (!s) return null;
  const f = parse(s.getItem(SAVE_V2));
  if (isObj(f) && f.v === 2 && isObj(f.chapters)) {
    const chapters: SaveFile['chapters'] = {};
    for (const [k, v] of Object.entries(f.chapters)) if ((k === 'ch1' && validCh1(v)) || (k === 'ch2' && isObj(v))) chapters[k as ChapterId] = v as Record<string, unknown>;
    return { v: 2, current: f.current === 'ch2' ? 'ch2' : 'ch1', chapters, migrated: true, updated: Number(f.updated) || 0 };
  }
  // 新档不存在或损坏：试着迁移旧的第一章存档（不删除旧键）
  const old = parse(s.getItem(LEGACY_CH1));
  if (validCh1(old)) { const m: SaveFile = { v: 2, current: 'ch1', chapters: { ch1: old }, migrated: true, updated: Date.now() }; writeFile(m); return m; }
  return null;
}

export function writeFile(f: SaveFile) { const s = store(); if (!s) return; try { s.setItem(SAVE_V2, JSON.stringify({ ...f, updated: Date.now() })); } catch { /* 存储满或被禁用：不保存 */ } }

export function readChapter(id: ChapterId): Record<string, unknown> | null { return readFile()?.chapters[id] ?? null; }

export function writeChapter(id: ChapterId, data: Record<string, unknown>) {
  const f = readFile() ?? { v: 2, current: id, chapters: {}, migrated: true, updated: 0 };
  f.chapters[id] = data; f.current = id; writeFile(f);
}

/** 清掉某一章（「重新开始」）。写一个空的新档而不是删键，防止旧档再被迁移回来 */
export function clearChapter(id: ChapterId) {
  const f = readFile() ?? { v: 2, current: id, chapters: {}, migrated: true, updated: 0 };
  delete f.chapters[id]; writeFile(f);
}
