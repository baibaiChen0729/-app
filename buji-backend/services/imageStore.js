// ══════════════════════════════════════════
// 图片存储服务
// 接收 base64 dataURL → 解码 → 写入本地文件
// 返回可访问的 URL 路径
// ══════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './data/uploads');

// 启动时确保目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * 保存 base64 图片到本地文件
 * @param {string} dataUrl - "data:image/png;base64,xxxxx" 格式
 * @returns {{ id: string, filename: string, urlPath: string, fullPath: string }}
 */
function saveBase64Image(dataUrl) {
  // 解析 dataURL：data:image/png;base64,xxxx
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) {
    throw new Error('invalid image dataURL');
  }
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const base64 = m[2];
  const buffer = Buffer.from(base64, 'base64');

  // 5MB 上限
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('image too large (>5MB)');
  }

  const id = uuidv4();
  const filename = `${id}.${ext}`;
  const fullPath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(fullPath, buffer);

  return {
    id,
    filename,
    urlPath: `/uploads/${filename}`,   // 前端访问路径
    fullPath,                           // 磁盘绝对路径
  };
}

/** 删除文件（用于回滚） */
function deleteFile(filename) {
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, filename));
  } catch (e) {
    // 静默失败
  }
}

module.exports = {
  UPLOADS_DIR,
  saveBase64Image,
  deleteFile,
};
