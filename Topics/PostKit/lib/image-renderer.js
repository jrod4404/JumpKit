const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const MEDIA_DIR = path.join(__dirname, '..', 'media');

const templateCache = {};
function loadTemplate(name) {
  // Always read from disk so template edits are picked up without restart
  const filePath = path.join(TEMPLATES_DIR, `${name}.svg`);
  const svg = fs.readFileSync(filePath, 'utf8');
  return svg;
}

const DEFAULT_BRAND = {
  primary_color: '#0F0F1A',
  accent_color: '#00D4AA',
  text_color: '#FFFFFF',
  name: 'JumpKit'
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxCharsPerLine, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  // Add ellipsis if text was truncated
  const totalUsedWords = lines.join(' ').split(/\s+/).length;
  if (totalUsedWords < words.length && lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last.length > maxCharsPerLine - 3) {
      lines[maxLines - 1] = last.substring(0, maxCharsPerLine - 3) + '...';
    } else {
      lines[maxLines - 1] = last + '...';
    }
  }
  return lines;
}

function buildTspans(lines, x, startY, lineHeight) {
  return lines.map((line, i) =>
    `<tspan x="${x}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');
}

// Template-specific text wrapping configs
// startY = y coordinate of the FIRST line of text (dynamically calculated based on line count for vertical centering)
// We compute startY at render time so text blocks are vertically centered in the safe area
const TEMPLATE_CONFIG = {
  quote:        { textVar: 'QUOTE_TEXT',   linesVar: 'QUOTE_TEXT_LINES',   maxChars: 26, maxLines: 5, lineHeight: 60,  x: 120, safeTop: 200, safeBottom: 540 },
  stat:         { textVar: 'CAPTION',      linesVar: 'CAPTION_LINES',      maxChars: 35, maxLines: 2, lineHeight: 45,  x: 600, safeTop: 440, safeBottom: 560, centered: true },
  tip:          { textVar: 'TIP_TEXT',     linesVar: 'TIP_TEXT_LINES',     maxChars: 32, maxLines: 5, lineHeight: 52,  x: 100, safeTop: 220, safeBottom: 560 },
  announcement: { textVar: 'HEADLINE',     linesVar: 'HEADLINE_LINES',     maxChars: 30, maxLines: 4, lineHeight: 60,  x: 100, safeTop: 170, safeBottom: 510 },
  'list-cover': { textVar: 'TITLE_TEXT',   linesVar: 'TITLE_TEXT_LINES',   maxChars: 30, maxLines: 4, lineHeight: 56,  x: 100, safeTop: 210, safeBottom: 530 },
};

// Variables whose values are raw SVG (tspan HTML) — do NOT escape these
const RAW_SVG_VARS = new Set([
  'QUOTE_TEXT_LINES',
  'CAPTION_LINES',
  'TIP_TEXT_LINES',
  'HEADLINE_LINES',
  'TITLE_TEXT_LINES',
  'SUBTEXT_LINES',
]);

function renderImage(options) {
  const { template, variables, outputPath, brand } = options;
  const b = { ...DEFAULT_BRAND, ...brand };

  let svg = loadTemplate(template);

  // Merge brand colors into variables
  const allVars = {
    ACCENT_COLOR: b.accent_color,
    BG_COLOR: b.primary_color,
    TEXT_COLOR: b.text_color,
    BRAND_NAME: b.name,
    ...variables,
  };

  // Handle text wrapping for the template's main text variable
  const cfg = TEMPLATE_CONFIG[template];
  if (cfg && allVars[cfg.textVar]) {
    const lines = wrapText(allVars[cfg.textVar], cfg.maxChars, cfg.maxLines);
    // Dynamically center the text block vertically within the safe area
    const blockHeight = (lines.length - 1) * cfg.lineHeight;
    const safeHeight = cfg.safeBottom - cfg.safeTop;
    const startY = Math.round(cfg.safeTop + (safeHeight - blockHeight) / 2);
    allVars[cfg.linesVar] = buildTspans(lines, cfg.x, startY, cfg.lineHeight);
    delete allVars[cfg.textVar];
  }

  // Also handle SUBTEXT for announcement
  if (template === 'announcement' && allVars.SUBTEXT) {
    const subLines = wrapText(allVars.SUBTEXT, 38, 2);
    // Position subtext below headline, centered in the lower area
    const subBlockHeight = (subLines.length - 1) * 42;
    const subStartY = Math.round(440 + (80 - subBlockHeight) / 2);
    allVars.SUBTEXT_LINES = buildTspans(subLines, 100, subStartY, 42);
    delete allVars.SUBTEXT;
  }

  // Replace all {{VARIABLE}} placeholders.
  // RAW_SVG_VARS are injected verbatim (they contain valid SVG tspan markup).
  // All other vars are XML-escaped to prevent injection.
  // Use split/join instead of regex replace to avoid $-substitution bugs
  // (e.g. '$10' in replacement strings being interpreted as backreferences).
  for (const [key, value] of Object.entries(allVars)) {
    const replacement = RAW_SVG_VARS.has(key)
      ? String(value || '')
      : escapeXml(String(value || ''));
    const token = '{{' + key + '}}';
    svg = svg.split(token).join(replacement);
  }

  // Remove any unreplaced {{PLACEHOLDER}} tokens (variables that were never provided)
  svg = svg.replace(/\{\{[A-Z_]+\}\}/g, '');

  // Inject brand logo if provided — replaces the JumpKit text wordmark
  if (b.logo_path) {
    const logoFullPath = path.join(__dirname, '..', b.logo_path);
    if (fs.existsSync(logoFullPath)) {
      const logoData = fs.readFileSync(logoFullPath);
      const logoExt = path.extname(b.logo_path).toLowerCase();
      const mimeType = logoExt === '.svg' ? 'image/svg+xml' :
                       logoExt === '.jpg' || logoExt === '.jpeg' ? 'image/jpeg' :
                       'image/png';
      const logoB64 = logoData.toString('base64');
      // Logo element: 270px wide (50% bigger than original 180), positioned bottom-right
      const logoSvg = `<image href="data:${mimeType};base64,${logoB64}" x="860" y="528" width="270" height="112" preserveAspectRatio="xMidYMid meet" opacity="0.85"/>`;
      // Remove the JumpKit text wordmark and replace with logo image
      svg = svg.replace(/<text[^>]*>JumpKit<\/text>/g, logoSvg);
    }
  }

  // Render SVG → PNG at 2× scale for retina quality
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 2400 },
  });
  const pngBuffer = resvg.render().asPng();

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, pngBuffer);
  return outputPath;
}

module.exports = { renderImage, loadTemplate, wrapText, buildTspans, escapeXml, DEFAULT_BRAND, TEMPLATE_CONFIG };
