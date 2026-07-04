// ══════════════════════════════════════════════════════════
//  步集 BUJI — App 图标生成器（零依赖，纯 Node.js 内置）
//  生成 192×192 和 512×512 两种规格的 PNG 图标
//  输出到 public/assets/icon-192.png  /  public/assets/icon-512.png
// ══════════════════════════════════════════════════════════

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG 编码 ────────────────────────────────────────────────
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput  = Buffer.concat([typeBytes, data]);
  const crcVal    = crc32(crcInput);
  const lenBuf    = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf    = Buffer.alloc(4); crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function makePNG(size, pixelFn) {
  // 逐行构建原始图像数据（filter=0 None，每行头一字节为 0x00）
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      row[1 + x * 4]     = r & 0xFF;
      row[1 + x * 4 + 1] = g & 0xFF;
      row[1 + x * 4 + 2] = b & 0xFF;
      row[1 + x * 4 + 3] = a & 0xFF;
    }
    rows.push(row);
  }
  const rawData    = Buffer.concat(rows);
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA

  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── 图标像素逻辑 ────────────────────────────────────────────
//  整体风格：深色底（#0a0a14）+ 中心桃粉渐变光晕 + 六个散布波点
function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

const DOTS = [
  // 相对坐标（0~1）+ 相对半径 + 颜色
  { cx: 0.64, cy: 0.30, r: 0.09,  col: [255, 224, 196] },   // peach
  { cx: 0.28, cy: 0.66, r: 0.075, col: [255, 184, 214] },   // pink
  { cx: 0.74, cy: 0.67, r: 0.06,  col: [255, 210, 175] },   // light peach
  { cx: 0.22, cy: 0.30, r: 0.065, col: [196, 168, 255] },   // lavender
  { cx: 0.58, cy: 0.18, r: 0.045, col: [255, 255, 255] },   // white
  { cx: 0.16, cy: 0.52, r: 0.038, col: [255, 184, 214] },   // pink sm
  { cx: 0.80, cy: 0.45, r: 0.032, col: [191, 229, 240] },   // icy blue
];

function iconPixel(x, y, size) {
  const nx = x / size, ny = y / size;

  // 深色背景渐变（左上角偏暖深红 → 右下角深蓝黑）
  let r = lerp(26,  8, nx + ny * 0.4);
  let g = lerp(8,   8, nx + ny * 0.4);
  let b = lerp(16, 22, nx + ny * 0.4);

  // 中心桃粉光晕（椭圆，soft radial gradient）
  const dx = nx - 0.5, dy = ny - 0.5;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.52) {
    const glow = Math.pow(Math.max(0, 1 - dist / 0.42), 2.2) * 0.55;
    r = lerp(r, 255, glow * 0.95);  // warm pink hue
    g = lerp(g, 168, glow * 0.55);
    b = lerp(b, 200, glow * 0.70);
  }

  // 六个波点（带柔软边缘）
  for (const dot of DOTS) {
    const ddx = nx - dot.cx, ddy = ny - dot.cy;
    const dd  = Math.hypot(ddx, ddy);
    if (dd < dot.r) {
      const alpha = Math.pow(1 - dd / dot.r, 0.6) * 0.92;
      r = Math.round(lerp(r, dot.col[0], alpha));
      g = Math.round(lerp(g, dot.col[1], alpha));
      b = Math.round(lerp(b, dot.col[2], alpha));
    }
  }

  // 圆角蒙版（让图标有轻微圆角可见 → iOS 系统会再套圆角，这里不强制截断）
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

// ── 输出 ────────────────────────────────────────────────────
const outDir = path.join(__dirname, 'public', 'assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const buf  = makePNG(size, iconPixel);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`[icon] ✓ ${file}  (${buf.length} bytes)`);
}
console.log('[icon] 图标生成完成！');
