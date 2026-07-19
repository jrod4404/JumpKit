# PostKit Image Generation — Phase 1: Template System

## Overview

Automated, brand-consistent image generation for every X and LinkedIn post. Uses pre-designed SVG templates filled dynamically by Auri, rendered to PNG. Zero API costs, fully local, instant generation.

## Goals

- Every post gets a professional, on-brand image automatically
- Pixel-perfect consistency (no AI artifacts, no weird text)
- Sub-second rendering per image
- No external API calls, no data leakage
- Auri handles the entire pipeline: content analysis → template selection → text fill → render → attach

## Architecture

```
Auri generates post text
       ↓
Auri classifies post type (quote | stat | tip | announcement | list)
       ↓
Auri selects matching template + fills template variables
       ↓
Node.js renders SVG → PNG (sharp/resvg)
       ↓
PNG saved to /media folder
       ↓
Post published with media_id (X) or media URN (LinkedIn)
```

## Template Types (5 initial templates)

### 1. Quote Template
- **Use case:** Inspirational/industry quotes, hot takes
- **Layout:** Large centered text, brand accent bar on left, small logo bottom-right
- **Variables:** `quote_text`, `author_name` (optional)
- **Visual:** Dark gradient background (brand colors), white bold text, accent underline

### 2. Stat/Number Template
- **Use case:** Data points, percentages, metrics
- **Layout:** Huge number centered, small descriptor text below
- **Variables:** `big_number`, `caption`, `source` (optional)
- **Visual:** Bold number in brand accent color, clean white/dark background

### 3. Tip/How-To Template
- **Use case:** Quick tips, advice, step-by-step
- **Layout:** "💡 TIP" header, 1-3 lines of text, brand footer
- **Variables:** `tip_number`, `tip_text`, `category_label`
- **Visual:** Light background, colored header pill, icon + text

### 4. Announcement Template
- **Use case:** Product updates, news, launches
- **Layout:** "NEW" or announcement badge, headline text, subtext
- **Variables:** `badge_text`, `headline`, `subtext`
- **Visual:** Brand color background, white text, badge pill top-left

### 5. List/Thread-Cover Template
- **Use case:** Thread starters, list posts, carousel-style
- **Layout:** Number + title, "swipe" or "thread" indicator
- **Variables:** `thread_number`, `title_text`, `total_count`
- **Visual:** High-contrast, large numerals, brand pattern background

## Template Design System

### Brand Variables (stored in PostKit settings)
```json
{
  "brand": {
    "name": "JumpKit",
    "primary_color": "#1a1a2e",
    "accent_color": "#00d4aa",
    "text_color": "#ffffff",
    "font_family": "Inter, system-ui, sans-serif",
    "logo_path": "/assets/logo-mark.svg",
    "logo_small_path": "/assets/logo-mark-small.svg"
  }
}
```

Note: Brand config is editable per workspace. This same system serves client campaigns — each campaign gets its own brand profile.

### SVG Template Structure
Each template is an SVG file with `{{VARIABLE}}` placeholders:

```svg
<svg width="1200" xheight="675" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1200" height="675" fill="{{BG_COLOR}}"/>
  
  <!-- Accent bar -->
  <rect x="0" y="0" width="12" height="675" fill="{{ACCENT_COLOR}}"/>
  
  <!-- Main text (auto-wrapped by renderer) -->
  <text x="80" y="337" font-family="Inter" font-size="56" 
        font-weight="700" fill="{{TEXT_COLOR}}">
    {{QUOTE_TEXT}}
  </text>
  
  <!-- Logo -->
  <image href="{{LOGO_PATH}}" x="1080" y="615" width="80" height="40"/>
</svg>
```

## Rendering Pipeline

### Dependencies
- `resvg-js` — SVG → PNG renderer (pure Rust/WASM, no system deps, fast)
- No browser needed, no headless Chrome

### Render Flow
1. Auri outputs JSON with template_id + filled variables
2. PostKit reads SVG template from `/templates/`
3. String replace `{{VARIABLES}}` with values
4. `resvg-js` renders SVG → PNG at 1200×675 (16:9 social standard)
5. PNG saved to `/media/{seed_id}_{post_id}_{platform}.png`

### Text Handling
- Auto-wrap long text (split on word boundaries, max chars per line per template)
- Font size auto-shrink for long content (start at template default, reduce until fit)
- Max 4 lines of body text per template
- Inter font family (bundled with PostKit in `/assets/fonts/`)

## Auri Integration

### Auri's Role
When generating posts, Auri now also outputs an `image` block per post:

```json
{
  "post_id": "abc123",
  "platform": "x",
  "content": "Stop bookmarking 50 tabs. JumpKit organizes your workspace links into one clean dashboard.",
  "image": {
    "template": "tip",
    "variables": {
      "tip_number": "1",
      "tip_text": "Stop bookmarking 50 tabs",
      "category_label": "PRODUCTIVITY"
    }
  }
}
```

### Auri Decision Logic
Auri analyzes the post content and picks the best template:
- Contains a quote or strong statement → **quote**
- Contains numbers/stats/percentages → **stat**
- Contains advice or how-to → **tip**
- Contains news/launch/update → **announcement**
- Thread starter or list → **list-cover**
- Pure text (no strong visual) → **tip** as default fallback

### Fallback
If Auri doesn't output an image block, PostKit checks settings:
- `auto_image: true` → PostKit picks template using simple keyword matching
- `auto_image: false` → post goes out without image

## API Changes (PostKit Server)

### New Endpoints
- `POST /api/images/generate` — manually trigger image for a post (pass post_id)
- `GET /api/templates` — list available templates
- `PUT /api/brand` — update brand config (colors, logo, font)

### Post Creation Flow Update
1. Auri generates posts → PostKit saves to DB
2. For each post with an `image` block:
   - Load template SVG
   - Fill variables
   - Render PNG via resvg-js
   - Save to /media
   - Store `media_path` in post record
3. When publishing to X: upload media first, attach media_id to tweet
4. When publishing to LinkedIn: upload media to LinkedIn, attach media URN

### Publishing Changes
**X publishing** — add media upload step:
```js
// 1. Upload media
const media = await xClient.post('media/upload', { media: imageBuffer });
// 2. Create tweet with media
await xClient.post('tweets/create', { 
  text: post.content, 
  media: { media_ids: [media.media_id_string] } 
});
```

**LinkedIn publishing** — add media upload step:
```js
// 1. Register upload
const upload = await linkedinApi.post('v2/assets?action=registerUpload', { ... });
// 2. Upload binary
await axios.put(upload.value.uploadMechanism.uploadUrl, imageBuffer);
// 3. Reference in UGC post
const ugcPost = { ..., content: { media: { id: upload.value.asset } } };
```

## File Structure

```
PostKit/
├── templates/
│   ├── quote.svg
│   ├── stat.svg
│   ├── tip.svg
│   ├── announcement.svg
│   └── list-cover.svg
├── assets/
│   ├── fonts/
│   │   ├── Inter-Regular.ttf
│   │   ├── Inter-SemiBold.ttf
│   │   └── Inter-Bold.ttf
│   ├── logo-mark.svg
│   └── logo-mark-small.svg
├── media/           ← generated PNGs land here
│   └── ...
├── lib/
│   └── image-renderer.js   ← template fill + SVG→PNG logic
```

## Database Changes

```sql
-- Brand config table
CREATE TABLE brand_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT DEFAULT 'JumpKit',
  primary_color TEXT DEFAULT '#1a1a2e',
  accent_color TEXT DEFAULT '#00d4aa',
  text_color TEXT DEFAULT '#ffffff',
  logo_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Add media columns to posts table
ALTER TABLE posts ADD COLUMN media_path TEXT;
ALTER TABLE posts ADD COLUMN template_id TEXT;
```

## Settings UI Changes

New "Brand" section in Settings:
- Brand name (text input)
- Primary color (color picker)
- Accent color (color picker)
- Text color (color picker)
- Logo upload (SVG/PNG)
- Auto-generate images toggle (on/off)
- Template preview gallery (shows each template with current brand styling)

## Implementation Steps

1. **Create 5 SVG templates** — designed with brand placeholders, clean layouts
2. **Bundle Inter font** — add TTF files to /assets/fonts/
3. **Install resvg-js** — `npm install @resvg/resvg-js`
4. **Build image-renderer.js** — template loading, variable injection, text wrapping, SVG→PNG
5. **Update server.js** — new endpoints, brand config CRUD, media upload on publish
6. **Update Auri skill** — output image blocks with template selection per post
7. **Update app.js** — brand settings UI, template preview, show image thumbnails on posts
8. **Update X publishing** — media upload step
9. **Update LinkedIn publishing** — media upload step
10. **Test end-to-end** — seed → Auri → posts with images → publish to X + LI

## Performance Expectations

- Template fill + SVG render: **<200ms per image**
- No network calls (fully local)
- Storage: ~200KB per PNG (1200×675)
- Batch of 12 posts: **<3 seconds total** for all images

## Phase 2 Preview (Flux Local — future)

Once Phase 1 is solid:
- Add Flux Schnell via `diffusers` + MLX or ComfyUI
- For creative/illustrative posts that don't fit templates
- Auri decides: template or creative generation
- Same /media pipeline, same publishing flow
- Expected: ~10s per creative image
