// 角色数值，来源：docs/游戏设计文档_v0.2.md 第 7.1 节。
export type CharId = 'tangtuan' | 'hanhan' | 'paipai' | 'youyou' | 'beibei' | 'oudi' | 'jiaxun' | 'jiashuo';

export interface CharDef {
  id: CharId;
  name: string;
  grade: string;
  height: number;      // 米
  weight: number;      // 公斤
  walk: number;        // m/s
  run: number;         // m/s
  jump: number;        // 米
  skill: string;       // 本领名
  role: string;        // 定位
  body: number;        // 灰盒衣服颜色
  hair: number;        // 灰盒头发颜色
  canPushHeavy: boolean;
}

export const CHARS: Record<CharId, CharDef> = {
  tangtuan: { id: 'tangtuan', name: '汤团', grade: '5 年级', height: 1.50, weight: 45, walk: 2.4, run: 4.2, jump: 0.6, skill: '推力', role: '力量 / 机关', body: 0x5b7f4a, hair: 0x2b2118, canPushHeavy: true },
  hanhan:   { id: 'hanhan',   name: '涵涵', grade: '5 年级', height: 1.50, weight: 35, walk: 2.5, run: 4.6, jump: 0.7, skill: '号令', role: '队长 / 指挥', body: 0x8a63c9, hair: 0x2a1c14, canPushHeavy: false },
  paipai:   { id: 'paipai',   name: '派派', grade: '3 年级', height: 1.32, weight: 27, walk: 2.2, run: 4.0, jump: 0.6, skill: '细节之眼', role: '侦查 / 洞察', body: 0xe08aa6, hair: 0x3a2617, canPushHeavy: false },
  youyou:   { id: 'youyou',   name: '佑佑', grade: '1 年级', height: 1.22, weight: 23, walk: 2.3, run: 4.8, jump: 1.0, skill: '地图领航', role: '开路 / 领航', body: 0xd9573f, hair: 0x2a1c14, canPushHeavy: false },
  beibei:   { id: 'beibei',   name: '北北', grade: '2 年级', height: 1.26, weight: 25, walk: 2.2, run: 4.2, jump: 0.7, skill: '触感', role: '感知 / 音乐', body: 0x6aa8d8, hair: 0x22160f, canPushHeavy: false },
  oudi:     { id: 'oudi',     name: '欧弟', grade: '1 年级', height: 1.20, weight: 20, walk: 2.3, run: 4.5, jump: 0.7, skill: '机械小鸟', role: '奇思 / 侦察', body: 0x58b36b, hair: 0x5a3a1c, canPushHeavy: false },
  jiaxun:   { id: 'jiaxun',   name: '甲寻', grade: '3 年级', height: 1.35, weight: 31, walk: 2.5, run: 5.0, jump: 0.8, skill: '路线规划', role: '捣蛋 / 路线', body: 0xe0a83c, hair: 0x1d140d, canPushHeavy: false },
  jiashuo:  { id: 'jiashuo',  name: '甲朔', grade: '幼儿园', height: 1.08, weight: 18, walk: 1.9, run: 3.4, jump: 0.4, skill: '低处检修', role: '小小检修员', body: 0x4f9ea0, hair: 0x1d140d, canPushHeavy: false },
};

export const CHAPTER1_SQUAD: CharId[] = ['tangtuan', 'hanhan', 'paipai'];
