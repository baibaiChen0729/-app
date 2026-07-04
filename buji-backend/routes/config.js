// ══════════════════════════════════════════
// GET /v1/config — 形状配置下发
// 前端启动时拉一次，本地缓存，version 变化才重拉
// ══════════════════════════════════════════

const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.get('/', (req, res) => {
  const currentVersion = db.prepare(
    `SELECT value FROM config_meta WHERE key = 'version'`
  ).get()?.value || '0';

  const clientVersion = req.query.version;
  const changed = clientVersion !== currentVersion;

  // 未变化 → 只返回版本号，前端用缓存
  if (!changed) {
    return res.json({
      code: 0,
      msg: 'ok',
      data: { version: currentVersion, changed: false },
    });
  }

  // 变化 → 返回完整配置
  const rows = db.prepare(`
    SELECT id, name, icon, params
    FROM shapes WHERE active = 1
    ORDER BY sort_order ASC
  `).all();

  const shapes = rows.map(r => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    params: JSON.parse(r.params || '{}'),
  }));

  res.json({
    code: 0,
    msg: 'ok',
    data: {
      version: currentVersion,
      changed: true,
      shapes,
    },
  });
});

module.exports = router;
