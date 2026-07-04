// ══════════════════════════════════════════
// 设备 ID 中间件
// 所有 /v1/* 请求必须带 X-Device-Id 请求头
// 前端首次启动本地生成 UUID 并存 localStorage
// ══════════════════════════════════════════

function deviceId(req, res, next) {
  const id = req.get('X-Device-Id');
  if (!id || id.length < 8) {
    return res.status(400).json({
      code: 400,
      msg: 'X-Device-Id header required',
      data: null,
    });
  }
  req.deviceId = id;
  next();
}

module.exports = deviceId;
