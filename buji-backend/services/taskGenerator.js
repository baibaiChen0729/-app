// ══════════════════════════════════════════
// 任务生成服务
// 输入：经纬度 (可选)
// 输出：多张任务卡数据 [{ id, title, image }]
//
// 流程：
//   1. 若有经纬度且配置了 AMAP_KEY → 调高德POI，把真实地点名填进模板
//   2. 否则 → 走静态降级（模板不带地点名）
// ══════════════════════════════════════════

const axios = require('axios');
const db = require('../db/database');

const AMAP_KEY = process.env.AMAP_KEY || '';
const AMAP_URL = 'https://restapi.amap.com/v3/place/around';

/**
 * 调高德 POI 搜索
 * @returns {Array<{id, name, type}>}
 */
async function searchNearbyPOIs(lat, lng, types, radius = 800) {
  if (!AMAP_KEY) return [];
  try {
    const { data } = await axios.get(AMAP_URL, {
      params: {
        key: AMAP_KEY,
        location: `${lng},${lat}`,  // 高德是 经度在前
        types,                       // "060100|110101|050300"
        radius,
        offset: 20,
        page: 1,
        extensions: 'base',
      },
      timeout: 3000,
    });
    if (data.status !== '1') return [];
    return (data.pois || []).map(p => ({
      id: p.id,
      name: p.name,
      type: p.typecode,
    }));
  } catch (e) {
    console.warn('[taskGenerator] 高德POI搜索失败:', e.message);
    return [];
  }
}

/**
 * 从模板 + POI 生成任务标题
 * @param {string} template - 如 "去{place_name}买一支没买过的饮料"
 * @param {object} poi - { name: "全家便利店" }
 */
function renderTitle(template, poi) {
  if (poi && template.includes('{place_name}')) {
    return template.replace('{place_name}', poi.name);
  }
  // 无POI：去掉占位符相关短语（保守做法：模板里应有兜底文案）
  return template.replace(/{place_name}/g, '附近');
}

/**
 * 主函数：生成今日任务
 * @param {number} lat 纬度（可选）
 * @param {number} lng 经度（可选）
 * @param {number} count 生成数量（默认6）
 * @returns {Array<{id, title, image}>}
 */
async function generateTodayTasks(lat, lng, count = 6) {
  // ── 1. 拉取所有启用的模板 ──
  const templates = db.prepare(`
    SELECT id, title_tpl, poi_type, image_url
    FROM task_templates WHERE active = 1
  `).all();

  if (templates.length === 0) {
    return [];
  }

  // ── 2. 收集所有需要查询的POI类型 ──
  const poiTypes = [...new Set(
    templates.filter(t => t.poi_type).map(t => t.poi_type)
  )];

  // ── 3. 有位置 + 有KEY + 有POI型 → 调高德 ──
  let poisByType = {};   // { '060100': [poi1, poi2], ... }
  if (lat && lng && poiTypes.length > 0 && AMAP_KEY) {
    const pois = await searchNearbyPOIs(lat, lng, poiTypes.join('|'));
    pois.forEach(p => {
      if (!poisByType[p.type]) poisByType[p.type] = [];
      poisByType[p.type].push(p);
    });
  }

  // ── 4. 打乱模板顺序，依次填充 ──
  const shuffled = [...templates].sort(() => Math.random() - 0.5);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const tasks = [];
  for (const tpl of shuffled) {
    if (tasks.length >= count) break;

    let poi = null;
    if (tpl.poi_type && poisByType[tpl.poi_type]?.length) {
      // 从该类型的POI中随机挑一个
      const pool = poisByType[tpl.poi_type];
      poi = pool[Math.floor(Math.random() * pool.length)];
    } else if (tpl.poi_type) {
      // 模板需要POI但没查到（无KEY/无位置/接口失败）→ 跳过
      // 除非该模板同时也能通用，这里保守跳过
      // 但为了保证有任务返回，若模板通用版可用则保留
      // 处理逻辑：如果 title_tpl 本身不带 {place_name}，则不需要POI
      if (tpl.title_tpl.includes('{place_name}')) continue;
    }

    tasks.push({
      id: `${tpl.id}_${today}_${tasks.length}`,
      title: renderTitle(tpl.title_tpl, poi),
      image: tpl.image_url || '',
    });
  }

  // ── 5. 兜底：如果一个都没有（所有模板都需POI但查不到），返回通用任务 ──
  if (tasks.length === 0) {
    const generic = templates.filter(t => !t.title_tpl.includes('{place_name}'));
    for (const tpl of generic.slice(0, count)) {
      tasks.push({
        id: `${tpl.id}_${today}_${tasks.length}`,
        title: renderTitle(tpl.title_tpl, null),
        image: tpl.image_url || '',
      });
    }
  }

  return tasks;
}

module.exports = {
  generateTodayTasks,
};
