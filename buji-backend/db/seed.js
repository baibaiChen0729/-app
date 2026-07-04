// ══════════════════════════════════════════
// 数据初始化脚本
// 首次启动/清库后运行：npm run seed
// 会填入默认形状 + 任务模板
// ══════════════════════════════════════════

require('dotenv').config();
const db = require('./database');

console.log('[seed] 开始初始化默认数据...');

// ── ① 形状配置（对齐 live-template-camera.html 现有4种形状）──
const shapes = [
  { id: 'circle',   name: '波点',   icon: '●',  params: {},                                sort_order: 0 },
  { id: 'teardrop', name: '雨滴',   icon: '💧', params: {},                                sort_order: 1 },
  { id: 'star',     name: '五角星', icon: '★',  params: { points: 5, innerRatio: 0.42 },   sort_order: 2 },
  { id: 'char',     name: '喵',     icon: '喵', params: { char: '喵' },                    sort_order: 3 },
];

const upsertShape = db.prepare(`
  INSERT INTO shapes (id, name, icon, params, sort_order, active)
  VALUES (@id, @name, @icon, @params, @sort_order, 1)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    icon = excluded.icon,
    params = excluded.params,
    sort_order = excluded.sort_order
`);

const insertShapes = db.transaction((list) => {
  for (const s of list) {
    upsertShape.run({ ...s, params: JSON.stringify(s.params) });
  }
});
insertShapes(shapes);
console.log(`[seed] ✓ 形状配置：${shapes.length} 条`);

// ── ② 配置版本号（前端拉config时用于判断更新）──
const now = new Date().toISOString().slice(0, 10);
db.prepare(`
  INSERT INTO config_meta (key, value) VALUES ('version', ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`).run(now);
console.log(`[seed] ✓ 配置版本号：${now}`);

// ── ③ 任务模板（对齐 discover-page.html 现有6条任务风格）──
// title_tpl 支持 {place_name} 占位符，会被高德POI真实地点名替换
// poi_type 是高德POI类型编码（https://lbs.amap.com/api/webservice/download）
//   060100 = 便利店 / 110101 = 公园 / 050300 = 咖啡厅 / 141201 = 书店
// 无 poi_type 的模板走通用版（不带地点名）
const templates = [
  { id: 'tpl_drink',   title_tpl: '去{place_name}\n买一支没买过的饮料', poi_type: '060100' },
  { id: 'tpl_park',    title_tpl: '在{place_name}里\n找一棵好看的树',   poi_type: '110101' },
  { id: 'tpl_coffee',  title_tpl: '去{place_name}\n拍一张手边的咖啡',   poi_type: '050300' },
  { id: 'tpl_book',    title_tpl: '在{place_name}\n拍一本封面好看的书', poi_type: '141201' },
  // 通用任务（不依赖POI，任何地点都能用）
  { id: 'tpl_manhole', title_tpl: '找一个\n好看的井盖',       poi_type: '' },
  { id: 'tpl_sky',     title_tpl: '记录此刻\n天空的颜色',     poi_type: '' },
  { id: 'tpl_animal',  title_tpl: '观察一只\n路过的小动物',   poi_type: '' },
  { id: 'tpl_words',   title_tpl: '写下现在\n最想说的一句话', poi_type: '' },
];

const upsertTpl = db.prepare(`
  INSERT INTO task_templates (id, title_tpl, poi_type, image_url, active)
  VALUES (@id, @title_tpl, @poi_type, @image_url, 1)
  ON CONFLICT(id) DO UPDATE SET
    title_tpl = excluded.title_tpl,
    poi_type = excluded.poi_type
`);

const insertTpls = db.transaction((list) => {
  for (const t of list) {
    upsertTpl.run({ image_url: '', ...t });
  }
});
insertTpls(templates);
console.log(`[seed] ✓ 任务模板：${templates.length} 条`);

console.log('[seed] 完成！');
