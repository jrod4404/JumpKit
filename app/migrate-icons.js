/**
 * Tabler Icons Migration: webfont → SVG sprite
 * Replaces all <i class="ti ti-X [extra-classes]" [style="..."]></i>
 * with <svg class="ti ti-X [extra-classes]" [style="..."]><use href="img/tabler-sprite.min.svg#tabler-X"/></svg>
 *
 * Special cases handled:
 * - nav-icon class preserved
 * - inline style preserved
 * - extra classes (e.g. jump-shared-badge) preserved
 * - Dynamic icon: <i class="ti ti-${iconName}" ...> → left as comment for manual fix
 */

const fs = require('fs');
const path = require('path');

const FILES = [
  'app.html',
  'index.html',
  'js/app.js',
  'js/jumps.js',
  'js/teams.js',
  'js/archive.js',
  'js/auth.js',
  'js/stats.js',
  'js/tests.js',
];

const BASE = path.join(__dirname);

// Regex: matches <i class="ti ti-ICON [extra]" [style="..."]></i>
// Group 1: full icon name (e.g. "ti-lock")
// Group 2: extra classes after icon name (e.g. " nav-icon jump-shared-badge")
// Group 3: any other attributes (e.g. style="..." title="...")
// Group 4: inner text (should be empty but just in case)
const ICON_RE = /<i\s+class="(ti\s+ti-([a-z0-9-]+))((?:\s+[a-z][a-z0-9-]*)*)"\s*((?:[a-z-]+="[^"]*"\s*)*)\s*>(.*?)<\/i>/g;

let totalReplaced = 0;
let totalDynamic = 0;

FILES.forEach(relPath => {
  const filePath = path.join(BASE, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${relPath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;

  // Handle dynamic icon first — flag it but don't break it
  if (content.includes('ti-${iconName}')) {
    console.log(`  ⚠️  Dynamic icon found in ${relPath} — will handle separately`);
    totalDynamic++;
  }

  content = content.replace(ICON_RE, (match, fullClass, iconName, extraClasses, attrs, inner) => {
    // Skip dynamic icon names
    if (iconName.includes('${')) return match;

    const svgClass = `ti ti-${iconName}${extraClasses}`;
    const attrStr = attrs ? attrs.trim() : '';
    const innerStr = inner ? inner.trim() : '';

    count++;
    return `<svg class="${svgClass}"${attrStr ? ' ' + attrStr : ''}><use href="img/tabler-sprite.min.svg#tabler-${iconName}"/></svg>${innerStr ? innerStr : ''}`;
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ ${relPath}: ${count} icons replaced`);
  totalReplaced += count;
});

console.log(`\n✅ Total replaced: ${totalReplaced}`);
if (totalDynamic > 0) {
  console.log(`⚠️  Dynamic icons needing manual fix: ${totalDynamic} file(s)`);
}
