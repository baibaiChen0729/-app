// ══════════════════════════════════════════
// SQLite 数据库初始化 + 单例连接
// 依赖 better-sqlite3（同步 API，用起来像普通函数）
// ══════════════════════════════════════════

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/buji.db';

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');   // 更好的并发写入
db.pragma('foreign_keys = ON');

// ── 建表（幂等，重启不会丢数据）────────────────────
db.exec(`
  -- 成片记录（核心业务表）
  CREATE TABLE IF NOT EXISTS posts (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    image_path  TEXT NOT NULL,
    caption     TEXT NOT NULL DEFAULT '',
    date        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_device ON posts(device_id, created_at DESC);

  -- 形状配置（后台可改，前端拉取）
  CREATE TABLE IF NOT EXISTS shapes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    icon        TEXT NOT NULL,
    params      TEXT NOT NULL DEFAULT '{}',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1
  );

  -- 配置版本号（用于前端缓存判断是否需要更新）
  CREATE TABLE IF NOT EXISTS config_meta (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
  );

  -- 任务模板库（运营维护）
  CREATE TABLE IF NOT EXISTS task_templates (
    id          TEXT PRIMARY KEY,
    title_tpl   TEXT NOT NULL,
    poi_type    TEXT NOT NULL DEFAULT '',
    image_url   TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1
  );
`);

module.exports = db;
