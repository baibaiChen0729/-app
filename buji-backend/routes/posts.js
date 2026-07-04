// ══════════════════════════════════════════
// /v1/posts — 成片发布与列表
//   POST /v1/posts     发布页"好啦"调用
//   GET  /v1/posts     相册地图页加载调用
// ══════════════════════════════════════════

const express = require('express');
const db = require('../db/database');
const { saveBase64Image, deleteFile } = require('../services/imageStore');

const router = express.Router();

// ── POST /v1/posts ──────────────────────────────
// 发布成片：接收 base64 图片 + 文案 + 日期
router.post('/', (req, res) => {
  const { image, caption = '', date } = req.body || {};

  if (!image) {
    return res.status(400).json({ code: 400, msg: 'image required', data: null });
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ code: 400, msg: 'date required (YYYY-MM-DD)', data: null });
  }

  let saved;
  try {
    saved = saveBase64Image(image);
  } catch (e) {
    return res.status(400).json({ code: 400, msg: e.message, data: null });
  }

  try {
    db.prepare(`
      INSERT INTO posts (id, device_id, image_path, caption, date, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(saved.id, req.deviceId, saved.urlPath, caption.slice(0, 200), date, Date.now());
  } catch (e) {
    // DB 写失败 → 回滚已写入的图片文件
    deleteFile(saved.filename);
    console.error('[posts] DB insert failed:', e);
    return res.status(500).json({ code: 500, msg: 'db error', data: null });
  }

  res.json({
    code: 0,
    msg: 'ok',
    data: {
      id: saved.id,
      imageUrl: saved.urlPath,
    },
  });
});

// ── GET /v1/posts ───────────────────────────────
// 获取当前设备的成片列表（按创建时间倒序）
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM posts WHERE device_id = ?`
  ).get(req.deviceId).c;

  const rows = db.prepare(`
    SELECT id, image_path, caption, date, created_at
    FROM posts
    WHERE device_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.deviceId, limit, offset);

  res.json({
    code: 0,
    msg: 'ok',
    data: {
      total,
      page,
      limit,
      posts: rows.map(r => ({
        id: r.id,
        imageUrl: r.image_path,
        caption: r.caption,
        date: r.date,
        createdAt: r.created_at,
      })),
    },
  });
});

// ── DELETE /v1/posts/:id ────────────────────────
// 删除成片（用户自己的）
router.delete('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT image_path FROM posts WHERE id = ? AND device_id = ?`
  ).get(req.params.id, req.deviceId);

  if (!row) {
    return res.status(404).json({ code: 404, msg: 'post not found', data: null });
  }

  db.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
  const filename = row.image_path.replace(/^\/uploads\//, '');
  deleteFile(filename);

  res.json({ code: 0, msg: 'ok', data: null });
});

module.exports = router;
