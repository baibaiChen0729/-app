// ══════════════════════════════════════════
// GET /v1/tasks/today — 基于位置生成今日任务
// ？lat=&lng= 可选：无位置时降级为通用任务
// ══════════════════════════════════════════

const express = require('express');
const { generateTodayTasks } = require('../services/taskGenerator');

const router = express.Router();

router.get('/today', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const count = Math.min(20, Math.max(1, parseInt(req.query.count) || 6));

  const hasLocation = !isNaN(lat) && !isNaN(lng);
  const tasks = await generateTodayTasks(
    hasLocation ? lat : null,
    hasLocation ? lng : null,
    count
  );

  res.json({
    code: 0,
    msg: 'ok',
    data: {
      date: new Date().toISOString().slice(0, 10),
      hasLocation,
      tasks,
    },
  });
});

module.exports = router;
