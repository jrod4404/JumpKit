from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import textwrap, math, os as _os

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'Commercial' / 'affiliates'
OUT_PDF = OUT_DIR / 'JumpKit_Client_Facing_One_Pager.pdf'
OUT_PNG = OUT_DIR / 'JumpKit_Client_Facing_One_Pager_preview.png'
LOGO = ROOT / 'landing' / 'logo-light.png'
HERO = ROOT / 'landing' / 'assets' / 'hero-mac-light.jpg'
WIN = ROOT / 'landing' / 'assets' / 'hero-windows-light.jpg'
ICON = ROOT / 'landing' / 'icon-512.png'
WEEKLY_CHART = Path(__file__).resolve().parent / 'weekly-chart.png'

W, H = 2550, 3300  # Letter at 300dpi-ish ratio; multi-page PDF
M = 150
ROYAL = (26, 79, 214)
TURQ = (0, 194, 199)
INK = (16, 32, 51)
MUTED = (86, 105, 126)
LINE = (214, 229, 242)
SOFT = (246, 250, 254)
PS_BG = (240, 242, 245)
DARK = (7, 22, 38)
WHITE = (255, 255, 255)

FONT_REG = '/System/Library/Fonts/Supplemental/Arial.ttf'
FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
FONT_BLACK = '/System/Library/Fonts/Supplemental/Arial Black.ttf'

def font(size, bold=False, black=False):
    return ImageFont.truetype(FONT_BLACK if black else (FONT_BOLD if bold else FONT_REG), size)

F = {
    'tiny': font(28), 'tiny_b': font(28, True), 'small': font(33), 'small_b': font(33, True),
    'body': font(39), 'body_b': font(39, True), 'h3': font(46, True), 'h2': font(56, True),
    'h1': font(102, black=True), 'h1b': font(102, black=True), 'price': font(70, black=True),
}

def gradient(size, c1=ROYAL, c2=TURQ, horizontal=True):
    w, h = size
    img = Image.new('RGB', size, c1)
    pix = img.load()
    denom = max(1, (w-1 if horizontal else h-1))
    for y in range(h):
        for x in range(w):
            t = (x if horizontal else y) / denom
            pix[x, y] = tuple(int(c1[i]*(1-t) + c2[i]*t) for i in range(3))
    return img

def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0,0,size[0]-1,size[1]-1], radius=radius, fill=255)
    return m

def paste_rounded(base, img, box, radius=48, shadow=True, sh_alpha=80, sh_blur=24, sh_dx=18, sh_dy=22):
    x1,y1,x2,y2 = box
    img = img.resize((x2-x1, y2-y1), Image.LANCZOS).convert('RGBA')
    mask = rounded_mask(img.size, radius)
    if shadow:
        sh = Image.new('RGBA', img.size, (0,0,0,sh_alpha))
        sh.putalpha(mask.filter(ImageFilter.GaussianBlur(sh_blur)))
        base.alpha_composite(sh, (x1+sh_dx, y1+sh_dy))
    img.putalpha(mask)
    base.alpha_composite(img, (x1,y1))

def cover_crop(path, size):
    im = Image.open(path).convert('RGB')
    sw, sh = size
    scale = max(sw/im.width, sh/im.height)
    nw, nh = int(im.width*scale), int(im.height*scale)
    im = im.resize((nw,nh), Image.LANCZOS)
    left = (nw-sw)//2; top=(nh-sh)//2
    return im.crop((left, top, left+sw, top+sh))

def contain_on_bg(path, size, bg=(7,22,38)):
    im = Image.open(path).convert('RGB')
    sw, sh = size
    scale = min(sw/im.width, sh/im.height)
    nw, nh = int(im.width*scale), int(im.height*scale)
    im = im.resize((nw,nh), Image.LANCZOS)
    canvas = Image.new('RGB', size, bg)
    canvas.paste(im, ((sw-nw)//2, (sh-nh)//2))
    return canvas

def draw_wrapped(draw, text, xy, fnt, fill, width, line_gap=8, max_lines=None):
    x,y = xy
    words = text.split()
    lines=[]; cur=''
    for w in words:
        test = w if not cur else cur+' '+w
        if draw.textbbox((0,0), test, font=fnt)[2] <= width:
            cur=test
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    if max_lines and len(lines)>max_lines:
        lines=lines[:max_lines]
        while lines and draw.textbbox((0,0), lines[-1]+'…', font=fnt)[2] > width:
            lines[-1]=lines[-1][:-1]
        lines[-1]+='…'
    for line in lines:
        draw.text((x,y), line, font=fnt, fill=fill)
        y += fnt.size + line_gap
    return y

def rect(draw, box, fill, outline=None, radius=36, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def check_item(draw, x, y, text, maxw, fill=MUTED, check_fill=(229,250,252)):
    draw.ellipse([x,y+4,x+42,y+46], fill=check_fill)
    draw.text((x+12,y+6), '✓', font=F['small_b'], fill=(0,120,143))
    return draw_wrapped(draw, text, (x+58,y), F['small'], fill, maxw-58, line_gap=3)

# ── Real Tabler icons (same as landing page, pre-rendered to PNG) ───
_ICON_DIR = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '_icons')
_icon_cache = {}
def _load_icon(name):
    if name not in _icon_cache:
        _icon_cache[name] = Image.open(_os.path.join(_ICON_DIR, name + '.png')).convert('RGBA')
    return _icon_cache[name]

def _chip_icon(target, x, y, s, bg, icon_name, shadow=None):
    d2 = ImageDraw.Draw(target)
    if shadow:
        sh = Image.new('RGBA', (s+40, s+40), (0,0,0,0))
        ImageDraw.Draw(sh).rounded_rectangle([16,16,16+s,16+s], radius=20, fill=shadow)
        target.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)), (x-20, y-16))
    d2.rounded_rectangle([x, y, x+s, y+s], radius=20, fill=bg)
    im = _load_icon(icon_name).resize((int(s*0.62), int(s*0.62)), Image.LANCZOS)
    ix = x + int((s - int(s*0.62))/2)
    iy = y + int((s - int(s*0.62))/2)
    target.alpha_composite(im, (ix, iy))

def _wrap_count(draw, text, fnt, width):
    words = text.split()
    lines = 0; cur = ''
    for w in words:
        test = w if not cur else cur + ' ' + w
        if draw.textbbox((0,0), test, font=fnt)[2] <= width:
            cur = test
        else:
            lines += 1; cur = w
    if cur: lines += 1
    return lines

# ═══════════════════════════════════════════════════════════════════
#  HEADER + FOOTER builders (shared across pages 2/3)
# ═══════════════════════════════════════════════════════════════════
def _page_background(page, d2):
    # left accent
    g = gradient((38,H), ROYAL, TURQ, horizontal=False).convert('RGBA')
    page.alpha_composite(g, (0,0))
    # soft blobs
    for cx,cy,r,col in [(300,250,430,(0,194,199,32)), (2260,300,360,(26,79,214,25)), (2120,3000,520,(0,194,199,22))]:
        blob = Image.new('RGBA', (r*2, r*2), (0,0,0,0)); bd = ImageDraw.Draw(blob)
        bd.ellipse([0,0,r*2,r*2], fill=col)
        blob = blob.filter(ImageFilter.GaussianBlur(24))
        page.alpha_composite(blob, (cx-r, cy-r))

def _header(page, d2, pill_label='Product Overview'):
    logo = Image.open(LOGO).convert('RGBA')
    logo_w = round(460 * 1.15)
    logo_h = int(logo.height * logo_w / logo.width)
    page.alpha_composite(logo.resize((logo_w, logo_h), Image.LANCZOS), (M, 110))
    _lw = d2.textbbox((0,0), pill_label, font=F['tiny_b'])[2]
    _pad = 42
    _x0 = W - M - _lw - 2*_pad
    _psh = Image.new('RGBA', (_lw + 2*_pad + 60, 100), (0,0,0,0))
    ImageDraw.Draw(_psh).rounded_rectangle([30, 22, 30+_lw+2*_pad, 22+79], radius=40, fill=(14,24,42,42))
    page.alpha_composite(_psh.filter(ImageFilter.GaussianBlur(10)), (_x0-30, 126-22+12))
    rect(d2, [_x0, 126, W-M, 205], fill=(232,249,252), outline=(171,232,238), radius=40)
    d2.text((_x0+_pad, 148), pill_label, font=F['tiny_b'], fill=(0,105,126))

def _footer(page, d2, full=True):
    fy = 3198
    d2.line([M, fy, W-M, fy], fill=LINE, width=2)
    _ft = 'Stop Searching. Start Jumping.'
    _fw = d2.textbbox((0,0), _ft, font=font(44, True))[2]
    d2.text(((W-_fw)//2, fy+24), _ft, font=font(44, True), fill=(55,64,78))

# ═══════════════════════════════════════════════════════════════════
#  REUSABLE CARD DRAWERS
# ═══════════════════════════════════════════════════════════════════
def _soft_card(page, d2, box, radius=45, fill=PS_BG, outline=None, sh_alpha=58, sh_y=30):
    x1,y1,x2,y2 = box
    shw = x2-x1; shh = y2-y1
    sh = Image.new('RGBA', (shw+80, shh+70), (0,0,0,0))
    ImageDraw.Draw(sh).rounded_rectangle([40,30,shw+40,shh+30], radius=radius, fill=(14,24,42,sh_alpha))
    page.alpha_composite(sh.filter(ImageFilter.GaussianBlur(3)), (x1-40, y1-30))
    rect(d2, box, fill=fill, outline=outline, radius=radius, width=3 if outline else 2)

def _section_header(page, d2, y, label, icon_name, ptext_x, title, intro=None, icon_color=(0,105,126), pill_bg=(232,249,252), intro_width=1800, show_title=True, pill_w=360, hero_style=False, icon_tint=None):
    """Centered section header: pill (icon+label) then Arial-Bold title. Returns end y."""
    cx = (ptext_x + W - M)//2
    # pill — hero_style matches the 'Windows + macOS desktop app' pill under the hero image
    if hero_style:
        p_top, p_bot = y+6, y+86   # 80 tall, same as hero pill
        p_rad = 34
        pil_s = 28
        lbl_font = F['small_b']
        sh_y = p_top - 8
        sh_h = 80
    else:
        p_top, p_bot = y+12, y+60  # 48 tall
        p_rad = 25
        pil_s = 24
        lbl_font = F['tiny_b']
        sh_y = y + 10
        sh_h = 34
    px0, px1 = cx - pill_w//2, cx + pill_w//2
    _psh = Image.new('RGBA', (pill_w+50, sh_h+40), (0,0,0,0))
    ImageDraw.Draw(_psh).rounded_rectangle([25,20,pill_w+25,20+sh_h], radius=25, fill=(18,50,90,42))
    page.alpha_composite(_psh.filter(ImageFilter.GaussianBlur(14)), (px0-25, sh_y))
    rect(d2, [px0, p_top, px1, p_bot], fill=pill_bg, outline=(171,232,238), radius=p_rad)
    pil = _load_icon(icon_name).resize((pil_s, pil_s), Image.LANCZOS)
    if icon_tint:
        tinted = Image.new('RGBA', pil.size, icon_tint + (0,))
        tinted.putalpha(pil.split()[3])
        pil = tinted
    lw = d2.textbbox((0,0), label, font=lbl_font)[2]
    lh = d2.textbbox((0,0), label, font=lbl_font)[3] - d2.textbbox((0,0), label, font=lbl_font)[1]
    total = pil_s + 6 + lw
    tart_x = cx - total//2
    cy = (p_top + p_bot)//2
    _bold_off = [(-1,0),(1,0),(0,-1),(0,1)]   # offset-blink the icon to make it bolder
    for (ox, oy) in _bold_off:
        page.alpha_composite(pil, (tart_x + ox, cy - pil_s//2 + oy))
    page.alpha_composite(pil, (tart_x, cy - pil_s//2))
    d2.text((tart_x+pil_s+6, cy - lh//2 - 4), label, font=lbl_font, fill=icon_color)
    # title (optional — pill can carry the heading alone)
    ey = y + 80 + 56
    if show_title:
        tw = d2.textbbox((0,0), title, font=font(52, True))[2]
        d2.text((cx-tw//2, y+80), title, font=font(52, True), fill=INK)
        ey = y + 80 + 56
    else:
        ey = p_bot + 12
    if intro:
        iw = intro_width
        iw2 = d2.textbbox((0,0), intro, font=F['body'])[2]
        ix = cx - min(iw2, iw)//2
        iy = ey + 10
        ey = draw_wrapped(d2, intro, (ix, iy), F['body'], MUTED, iw, line_gap=8)
    return ey + 22

# ═══════════════════════════════════════════════════════════════════
#  PAGE 1  (UNCHANGED)
# ═══════════════════════════════════════════════════════════════════
def build_page1():
    page = Image.new('RGBA', (W,H), WHITE)
    d = ImageDraw.Draw(page)
    _page_background(page, d)

    # header
    logo = Image.open(LOGO).convert('RGBA')
    logo_w = round(460 * 1.15)
    logo_h = int(logo.height * logo_w / logo.width)
    page.alpha_composite(logo.resize((logo_w, logo_h), Image.LANCZOS), (M, 110))
    _pb_label = 'Product Brief'
    _pb_lw = d.textbbox((0,0), _pb_label, font=F['tiny_b'])[2]
    _pb_pad = 42
    _pb_x0 = W - M - _pb_lw - 2*_pb_pad
    _pbsh = Image.new('RGBA', (_pb_lw + 2*_pb_pad + 60, 100), (0,0,0,0))
    ImageDraw.Draw(_pbsh).rounded_rectangle([30, 22, 30 + _pb_lw + 2*_pb_pad, 22 + 79], radius=40, fill=(14, 24, 42, 42))
    page.alpha_composite(_pbsh.filter(ImageFilter.GaussianBlur(10)), (_pb_x0 - 30, 126 - 22 + 12))
    rect(d, [_pb_x0, 126, W-M, 205], fill=(232,249,252), outline=(171,232,238), radius=40)
    d.text((_pb_x0+_pb_pad, 148), _pb_label, font=F['tiny_b'], fill=(0,105,126))

    # hero text
    y = 285
    h1a = 'The Best One-Click Link'
    h1b = 'Launcher for Windows & Mac'
    d.text((M, y), h1a, font=font(62, black=True), fill=INK)
    d.text((M, y+66), h1b, font=font(62, black=True), fill=INK)
    desc = ('JumpKit organizes your navigation links in one place — web links, local directories, shared resources — '
            'saved in categories and launched in a single click. No more clicking through folders. No more lost tabs. '
            'No more bookmarks. Just jump. Save time, save money, and track the savings automatically in a built-in ROI calculator and statistics page. '
            'Available for single users and shareable among teams. Getting started takes minutes, works on both Windows '
            'and macOS, and keeps your data local — fast, private, and always yours. ')
    desc = desc + ('Stop searching for navigation links, start jumping with JumpKit.')
    y2 = draw_wrapped(d, desc, (M, y+188), F['body'], (58,78,99), 1040, line_gap=12)

    # hero image right
    hero_img = contain_on_bg(HERO, (1100, 484), bg=(255,255,255))
    _hx0, _hy0, _hx1, _hy1 = 1290, 285, 2390, 769
    hsh = Image.new('RGBA', (1100+40, 484+40), (0,0,0,0))
    ImageDraw.Draw(hsh).rounded_rectangle([16, 12, 16+1100, 12+484], radius=58, fill=(14, 24, 42, 60))
    page.alpha_composite(hsh.filter(ImageFilter.GaussianBlur(10)), (_hx0-16, _hy0-12+14))
    paste_rounded(page, hero_img, (_hx0, _hy0, _hx1, _hy1), radius=58, shadow=False)
    _bx0, _by0, _bx1, _by1 = 1543, 800, 2138, 880
    _bsh = Image.new('RGBA', (595+60, 100), (0,0,0,0))
    ImageDraw.Draw(_bsh).rounded_rectangle([30, 22, 30+595, 22+80], radius=34, fill=(14, 24, 42, 42))
    page.alpha_composite(_bsh.filter(ImageFilter.GaussianBlur(10)), (_bx0-30, _by0-22+12))
    rect(d, [_bx0, _by0, _bx1, _by1], fill=(232,249,252), radius=34)
    _wi = _load_icon('brand-windows').resize((28, 28), Image.LANCZOS)
    _ai = _load_icon('brand-apple').resize((28, 28), Image.LANCZOS)
    _ptxt = 'Windows + macOS desktop app'
    _gap = 6
    _ww = d.textbbox((0,0), 'Windows', font=F['small_b'])[2]
    _pw = d.textbbox((0,0), '+', font=F['small_b'])[2]
    _mw = d.textbbox((0,0), 'macOS', font=F['small_b'])[2]
    _tw = d.textbbox((0,0), ' desktop app', font=F['small_b'])[2]
    _btotal = 28 + _gap + _ww + _gap + _pw + _gap + 28 + _gap + _mw + _tw
    _bstart = _bx0 + (595 - _btotal)//2
    _cx = _bstart
    page.alpha_composite(_wi, (_cx, _by0 + 26)); _cx += 28 + _gap
    d.text((_cx, _by0 + 21), 'Windows', font=F['small_b'], fill=(0,105,126)); _cx += _ww + _gap
    d.text((_cx, _by0 + 21), '+', font=F['small_b'], fill=(0,105,126)); _cx += _pw + _gap
    page.alpha_composite(_ai, (_cx, _by0 + 26)); _cx += 28 + _gap
    d.text((_cx, _by0 + 21), 'macOS', font=F['small_b'], fill=(0,105,126)); _cx += _mw
    d.text((_cx, _by0 + 21), ' desktop app', font=F['small_b'], fill=(0,105,126))

    # Problem → Solution
    ps_y = 1056
    col_w = (W - 2*M - 40)//2
    PROB_ICON = (224, 85, 85)
    PROB_BG   = (254, 242, 242)
    SOL_ICON  = (34, 197, 94)
    SOL_BG    = (240, 253, 244)

    PROBLEM_ITEMS = [
        ('mood-sad-dizzy', 'They get disorganized', 'Bookmarks and shortcuts drift out of sync.'),
        ('folder', 'Can\'t launch directories', 'No way to open local folders or shared drives.'),
        ('share', 'Can\'t be shared with teammates', 'No easy way to pass resources to your team.'),
        ('database', 'Difficult to back up or migrate', 'Hard to move to a new machine or browser.'),
        ('search', 'Hard to search or filter', 'Finding a link means scrolling and hunting.'),
        ('browser', 'Locked to one browser', 'Your links don\'t follow you everywhere.'),
        ('refresh-alert', 'Browser updates break layout', 'Your carefully organized bar keeps breaking.'),
        ('chart-bar', 'No usage stats or notes', 'No visibility into what actually saves time.'),
    ]
    SOLUTION_ITEMS = [
        ('layout-grid', 'Organized by categories', 'Clean columns by department, client, or workflow.'),
        ('folder-check', 'Launch directories', 'Open links, folders, and shared drives instantly.'),
        ('users', 'Shared instantly across your team', 'Team collections anyone can use — no tribal knowledge.'),
        ('database-export', 'Easy backup and migration', 'Move your setup to any machine in one step.'),
        ('zoom-check', 'Instant search and filter', 'Type-and-go search across every jump.'),
        ('device-desktop', 'Browser independent', 'A dedicated desktop app that works everywhere.'),
        ('shield-check', 'No UI changes ever', 'Your layout never breaks on an update.'),
        ('chart-dots', 'ROI tracking and notes', 'Automatically track the time and money you save.'),
    ]
    PROB_BORDER = (245, 178, 178)
    SOL_BORDER = (172, 228, 184)

    def _draw_ps_card(x0, x1, label, title, ic, ibg, border, pill_icon, items, chip_shadow):
        card_top = ps_y
        cx_center = (x0 + x1)//2
        sub_w = (col_w - 60 - 24)//2
        TITLE_H = 30
        ROW_START = card_top + 188
        col_h = [ROW_START, ROW_START]
        for idx, (icon, t, b) in enumerate(items):
            c = idx // 4
            lines = _wrap_count(d, b, F['tiny'], sub_w - 72)
            block_h = TITLE_H + lines*(F['tiny'].size + 2)
            col_h[c] += block_h + 18
        card_bot = max(col_h) - 18 + 34
        shw, shh = x1-x0, card_bot-card_top
        sh = Image.new('RGBA', (shw+80, shh+70), (0,0,0,0))
        ImageDraw.Draw(sh).rounded_rectangle([40,30,shw+40,shh+30], radius=45, fill=(14,24,42,58))
        page.alpha_composite(sh.filter(ImageFilter.GaussianBlur(3)), (x0-40, card_top-30))
        rect(d, [x0, card_top, x1, card_bot], fill=PS_BG, outline=border, radius=45, width=3)
        pill_w = 300
        pill_x0, pill_x1 = cx_center-pill_w//2, cx_center+pill_w//2
        pill_cy = card_top + 66
        psh = Image.new('RGBA', (pill_w+50, 74), (0,0,0,0))
        ImageDraw.Draw(psh).rounded_rectangle([25,20,pill_w+25,54], radius=25, fill=(18,50,90,42))
        page.alpha_composite(psh.filter(ImageFilter.GaussianBlur(14)), (pill_x0-25, card_top+40))
        d.rounded_rectangle([pill_x0, card_top+42, pill_x1, card_top+90], radius=25, fill=ibg)
        pil_s = round(22 * 1.10)
        pil = _load_icon(pill_icon).resize((pil_s, pil_s), Image.LANCZOS)
        lw = d.textbbox((0,0), label, font=F['tiny_b'])[2]
        lh = d.textbbox((0,0), label, font=F['tiny_b'])[3] - d.textbbox((0,0), label, font=F['tiny_b'])[1]
        total = pil_s + 6 + lw
        tart_x = cx_center - total//2
        _bold_off = [(-1,0),(1,0),(0,-1),(0,1)]
        for (ox, oy) in _bold_off:
            page.alpha_composite(pil, (tart_x + ox, pill_cy - pil_s//2 + oy))
        page.alpha_composite(pil, (tart_x, pill_cy - pil_s//2))
        d.text((tart_x+pil_s+6, pill_cy - lh//2 - 4), label, font=F['tiny_b'], fill=ic)
        tw = d.textbbox((0,0), title, font=font(44, True))[2]
        d.text((cx_center-tw//2, card_top+104), title, font=font(44, True), fill=INK)
        col_y = [ROW_START, ROW_START]
        for idx, (icon, t, b) in enumerate(items):
            c = idx // 4
            cx = x0 + 45 + c*(sub_w+24)
            cy = col_y[c]
            _chip_icon(page, cx, cy, 54, ibg, icon, shadow=chip_shadow)
            d.text((cx+66, cy+2), t, font=font(25, True), fill=INK)
            desc_y = cy + TITLE_H
            end_y = draw_wrapped(d, b, (cx+66, desc_y), F['tiny'], MUTED, sub_w-72, line_gap=2)
            col_y[c] = end_y + 18
        return card_bot

    ps_b1 = _draw_ps_card(M, M+col_w, 'THE PROBLEM', "Bookmarks Stink", PROB_ICON, PROB_BG, PROB_BORDER, 'alert-circle', PROBLEM_ITEMS, (200, 60, 60, 70))
    ps_b2 = _draw_ps_card(M+col_w+40, W-M, 'THE SOLUTION', 'JumpKit — Your Clean Launchpad', SOL_ICON, SOL_BG, SOL_BORDER, 'bulb', SOLUTION_ITEMS, (22, 160, 80, 70))
    ps_bot = max(ps_b1, ps_b2)

    # ── Dashboard section — copy + weekly stats, replicated from the landing page ──
    yh = ps_bot + 32
    yh = _section_header(page, d, yh, 'AUTOMATIC STATISTICS', 'chart-bar-teal', M, 'Automatic Statistics',
        'JumpKit counts every jump launched and shows you exactly how much time and money you\'re saving. All data stays local in an automatic dashboard. Time saved is calculated automatically — every jump carries a time-per-jump value, so each launch adds to your running total in real time. ROI is calculated from that same data: your time saved is multiplied by the hourly rate you set, turning minutes back into dollars you can actually see. No spreadsheets, no guesswork.', icon_color=(0,105,126), intro_width=W-2*M, show_title=False, pill_w=523, hero_style=True, icon_tint=(0,194,199))
    # 4 weekly stat cards (same values/labels as the landing page weekly view)
    scw = (W - 2*M - 3*36)//4
    scH = 268   # bottom whitespace cut ~35% (was 280)
    stats = [
        ('activity', '59.0', TURQ, 'Avg Jumps / Week', 'Average launches per week over the last 4 weeks.'),
        ('chart-bar-teal', '236', TURQ, 'Total Jumps · Last 4 Weeks', 'All launches counted across your workspace.'),
        ('clock', '0.7 hrs', TURQ, 'Time Saved · Last 4 Weeks', '~10s saved per jump — tracked automatically.'),
        ('coins', '$32.78', TURQ, 'Dollars Saved · Last 4 Weeks', 'Recovered time valued at $50 per hour.'),
    ]
    for i,(icon,big,bc,lab,sub) in enumerate(stats):
        x = M + i*(scw+36)
        _stat_card(page, d, [x, yh, x+scw, yh+scH], icon, big, bc, lab, sub)
    yh += scH + 36
    # row 2: Top 10 card (under card 1) + weekly bar chart (under cards 2-4)
    top10_w = scw
    chart_x0 = M + scw + 36          # aligns with card 2's left edge
    chart_w = (W - M) - chart_x0     # spans to the right margin (under cards 2-4)
    chart_img = Image.open(WEEKLY_CHART).convert('RGBA')
    # recolor the screenshot's white panel bg to the doc's card gray (PS_BG)
    _data = list(chart_img.getdata())
    _data = [PS_BG + (a,) if (r > 245 and g > 245 and b > 245) else (r, g, b, a) for (r, g, b, a) in _data]
    chart_img.putdata(_data)
    chart_img = chart_img.convert('RGB')
    cw, ch = chart_img.size
    disp_w = chart_w
    disp_h = round(disp_w * ch / cw)
    row2_h = disp_h
    box = [M, yh, M+top10_w, yh+row2_h]
    _soft_card(page, d, box, radius=45, fill=PS_BG, outline=LINE, sh_alpha=58, sh_y=30)
    d.text((M+45, yh+36), 'Top 10 Jumps', font=font(40, True), fill=INK)
    TOP10 = [
        ('Outlook Mail', 46), ('ERP Portal', 38), ('Confluence', 23), ('Salesforce', 21),
        ('Jira', 20), ('SharePoint', 19), ('Team Drive', 16), ('Design Assets', 15),
        ('HR Portal', 14), ('Time Tracking', 10),
    ]
    ry = yh + 96
    for i,(name,ct) in enumerate(TOP10):
        d.text((M+45, ry), str(i+1), font=font(26, True), fill=TURQ)
        draw_wrapped(d, name, (M+95, ry), font(26), INK, top10_w-95-100, line_gap=2)
        tw = d.textbbox((0,0), str(ct), font=font(26, True))[2]
        d.text((M+top10_w-45-tw, ry), str(ct), font=font(26, True), fill=INK)
        ry += 30
    # weekly bar chart — same shadow style as the doc's cards (tight 3px blur)
    dx = chart_x0
    dy = yh
    shw2, shh2 = disp_w, disp_h
    sh = Image.new('RGBA', (disp_w+80, disp_h+70), (0,0,0,0))
    ImageDraw.Draw(sh).rounded_rectangle([40, 30, disp_w+40, disp_h+30], radius=45, fill=(14,24,42,58))
    page.alpha_composite(sh.filter(ImageFilter.GaussianBlur(3)), (dx-40, dy-30))
    paste_rounded(page, chart_img, (dx, dy, dx+disp_w, dy+disp_h), radius=45, shadow=False)

    # ── Section: Testimonials (fills the page-1 bottom, matching the landing page) ──
    yh = dy + disp_h + 20
    yh = _section_header(page, d, yh, 'WHAT OUR USERS SAY', 'users', M, 'What Our Users Say', icon_color=(0,105,126), show_title=False, pill_w=523, hero_style=True, icon_tint=(0,194,199))
    TW = (W - 2*M - 2*36)//3
    TH = 244
    def _star(draw, cx, cy, r, fill):
        pts = []
        for i in range(10):
            ang = -math.pi/2 + i*math.pi/5
            rad = r if i % 2 == 0 else r*0.45
            pts.append((cx + rad*math.cos(ang), cy + rad*math.sin(ang)))
        draw.polygon(pts, fill=fill)
    FONT_ITAL = '/System/Library/Fonts/Supplemental/Arial Italic.ttf'
    TESTS = [
        ('Dana K.', 'IT Manager, MSP', 'We rolled JumpKit out to our whole client base in under a week. Onboarding new users went from hours to minutes.'),
        ('Andrew D.', 'IT Consultant', 'JumpKit is the tool that makes my clients happy. It\u2019s easy and it works.'),
        ('Chris R.', 'Operations Lead', 'I used to hunt through five different tools just to start my day. Now everything I need is one click away.'),
    ]
    for i,(nm, role, qt) in enumerate(TESTS):
        x = M + i*(TW+36)
        box = [x, yh, x+TW, yh+TH]
        _soft_card(page, d, box, radius=45, fill=PS_BG, outline=LINE, sh_alpha=58, sh_y=30)
        for s in range(5):
            _star(d, x+58 + s*31, yh+36, 11, (245,158,11))
        draw_wrapped(d, '\u201c' + qt + '\u201d', (x+58, yh+74), ImageFont.truetype(FONT_ITAL, 20), MUTED, TW-116, line_gap=8)
        d.text((x+58, yh+176), nm, font=font(24, True), fill=INK)
        d.text((x+58, yh+208), role, font=font(18), fill=MUTED)

    # footer
    fy=3198
    d.line([M,fy,W-M,fy],fill=LINE,width=2)
    _ft = 'Stop Searching. Start Jumping.'
    _fw = d.textbbox((0,0), _ft, font=font(44, True))[2]
    d.text(((W-_fw)//2, fy+24), _ft, font=font(44, True), fill=(55,64,78))
    return page

# ═══════════════════════════════════════════════════════════════════
#  PAGE 2 — Dashboard/Stats, Teams, IT Use Cases
# ═══════════════════════════════════════════════════════════════════
def _stat_card(page, d2, box, icon, big, big_color, label, sub):
    x1,y1,x2,y2 = box
    _soft_card(page, d2, box, radius=45, fill=PS_BG, outline=LINE, sh_alpha=58, sh_y=30)
    # big number (tile icon removed per Jeff; teal value per Jeff)
    d2.text((x1+40, y1+30), big, font=font(58, black=True), fill=big_color)
    big_bottom = d2.textbbox((0,0), big, font=font(58, black=True))[3]
    label_y = y1 + 30 + big_bottom + 42   # 48px visual margin below the teal stat text (16 + 32 added; label glyphs start 6px below origin)
    draw_wrapped(d2, label, (x1+40, label_y), font(32, True), INK, (x2-x1)-80, line_gap=4)
    draw_wrapped(d2, sub, (x1+40, label_y+48), F['tiny'], MUTED, (x2-x1)-80, line_gap=4)

def build_page2():
    page = Image.new('RGBA', (W,H), WHITE)
    d = ImageDraw.Draw(page)
    _page_background(page, d)
    _header(page, d, 'Product Overview')

    # ── Section: Weekly View (dashboard cards now live on page 1) ──
    yh = _section_header(page, d, 285, 'WEEKLY VIEW', 'chart-bar-teal', M, 'Weekly View — Last 4 Weeks at a Glance', icon_color=(0,105,126))
    WEEKLY_STATS = [
        ('activity', '59.0', TURQ, 'Avg Jumps / Week', 'Average launches per week over the last 4 weeks.'),
        ('chart-bar-teal', '236', ROYAL, 'Total Jumps · Last 4 Weeks', 'All launches counted across your workspace.'),
        ('clock', '0.7 hrs', (16,142,120), 'Time Saved · Last 4 Weeks', '~10s saved per jump — tracked automatically.'),
        ('coins', '$32.78', INK, 'Dollars Saved · Last 4 Weeks', 'Recovered time valued at $50 per hour.'),
    ]
    # left: real weekly-view chart from the JumpKit dashboard (light mode)
    chart_w, chart_h = 1250, 360
    paste_rounded(page, Image.open(WEEKLY_CHART).convert('RGB'), (M, yh, M+chart_w, yh+chart_h), radius=34, sh_alpha=60, sh_blur=18, sh_dx=14, sh_dy=16)
    # right: 2x2 mini stat cards
    rx0 = M + chart_w + 40
    rx1 = W - M
    mcw = (rx1 - rx0 - 30)//2
    mcH = 150
    for i,(icon,big,bc,lab,sub) in enumerate(WEEKLY_STATS):
        col = i % 2; row = i // 2
        x = rx0 + col*(mcw+30)
        yy = yh + row*(mcH+18)
        box = [x, yy, x+mcw, yy+mcH]
        _soft_card(page, d, box, radius=30, fill=WHITE, outline=LINE, sh_alpha=38, sh_y=16)
        _chip_icon(page, x+22, yy+14, 40, (232,249,252), icon, shadow=(18,50,90,28))
        d.text((x+76, yy+14), big, font=font(40, black=True), fill=bc)
        d.text((x+76, yy+62), lab, font=font(24, True), fill=INK)
        draw_wrapped(d, sub, (x+76, yy+90), font(21), MUTED, mcw-90, line_gap=3)
    yh += 2*mcH + 18 + 56

    # ── Section: Teams ────────────────────────────────────────
    yh = _section_header(page, d, yh, 'TEAMS', 'users', M, 'One Team. One Layout. Everyone Jumps.',
        'Create teams, add members, and share jumps so everyone starts from the same page.', icon_color=(0,105,126))
    team_cards = [
        ('users', 'Shared team jumps', 'Define jumps to share with your teams. Everyone uses one consistent resource set.'),
        ('share', 'Instant sharing', 'Pass a full layout to a new member — no tribal knowledge, no DM chains.'),
        ('user-plus', 'Fast onboarding', 'Hand a new hire the JumpKit layout and all key info is there in one step.'),
        ('building-community', '100% local', 'Your data never leaves the team\'s machines — private and secure.'),
    ]
    tcw = (W - 2*M - 3*36)//4
    tcH = 360
    for i,(icon,title,body) in enumerate(team_cards):
        x = M + i*(tcw+36)
        box = [x, yh, x+tcw, yh+tcH]
        _soft_card(page, d, box, radius=45, fill=WHITE, outline=LINE, sh_alpha=50, sh_y=26)
        _chip_icon(page, x+40, yh+32, 70, (232,249,252), icon, shadow=(18,50,90,40))
        d.text((x+40, yh+130), title, font=F['h3'], fill=INK)
        draw_wrapped(d, body, (x+40, yh+205), F['tiny'], MUTED, tcw-80, line_gap=6)
    yh += tcH + 56

    # ── Section: IT & Helpdesk Use Cases ──────────────────────
    yh = _section_header(page, d, yh, 'IT & HELPDESK', 'briefcase', M, 'Built for Teams, IT, Sales & Engineering',
        'An IT tech supports countless internal tools, admin consoles, KB pages, and shared drives every day.', icon_color=(0,105,126))
    it_cards = [
        ('settings', 'Launch admin consoles & KB pages', 'Every internal tool, KB article, and admin page is one jump away — tickets resolve faster and browser-juggling disappears.'),
        ('database-teal', 'Jump to network shares & drives', 'Shared drives and local folders or repos open instantly, alongside docs, CI dashboards, and issue trackers.'),
        ('users', 'Team jumps, same resources', 'A shared, consistent set of resources across the whole helpdesk — no more one-off "here\'s the link" DMs.'),
        ('chart-bar-teal', 'Faster resolution time', 'Less hunting through the wiki and one source of truth for every tool — measured automatically as saved time.'),
    ]
    icw = (W - 2*M - 36)//2
    icH = 360
    for i,(icon,title,body) in enumerate(it_cards):
        col = i % 2; row = i // 2
        x = M + col*(icw+36)
        yy = yh + row*(icH+36)
        box = [x, yy, x+icw, yy+icH]
        _soft_card(page, d, box, radius=45, fill=WHITE, outline=LINE, sh_alpha=50, sh_y=26)
        _chip_icon(page, x+45, yy+50, 84, (232,249,252), icon, shadow=(18,50,90,40))
        d.text((x+165, yy+66), title, font=F['h3'], fill=INK)
        draw_wrapped(d, body, (x+165, yy+142), F['small'], MUTED, icw-210, line_gap=7)
    yh += 2*(icH+36) - 36

    _footer(page, d)
    return page

# ═══════════════════════════════════════════════════════════════════
#  PAGE 3 — Quick Start, Pricing (redesigned), Affiliate
# ═══════════════════════════════════════════════════════════════════
def build_page3():
    page = Image.new('RGBA', (W,H), WHITE)
    d = ImageDraw.Draw(page)
    _page_background(page, d)
    _header(page, d, 'Get Started & Pricing')

    # ── Section: Quick Start ───────────────────────────────────
    yh = _section_header(page, d, 285, 'QUICK START', 'layout-grid', M, 'Up and running in minutes',
        'Download, install, and start jumping — no training, no setup fees.', icon_color=(0,105,126))
    qs_steps = [
        ('01', 'Define Your Categories', 'Download, install, and define your column category names and set their order.'),
        ('02', 'Add Your Jumps', 'Use the add jump button to create a new jump. Choose its name and category. Paste in a web URL, local folder path, or file location. Save.'),
        ('03', 'Jump!', 'Click any jump and you are there instantly. Watch your time savings and ROI add up in your personal dashboard.'),
    ]
    qw = (W - 2*M - 2*44)//3
    qH = 420
    for i,(num,title,body) in enumerate(qs_steps):
        x = M + i*(qw+44)
        _soft_card(page, d, [x, yh, x+qw, yh+qH], radius=45, fill=SOFT, outline=LINE, sh_alpha=45, sh_y=26)
        d.ellipse([x+45, yh+40, x+45+84, yh+124], fill=ROYAL if i==0 else TURQ)
        d.text((x+45+24, yh+57), num, font=F['h3'], fill=WHITE)
        d.text((x+45, yh+160), title, font=F['h3'], fill=INK)
        draw_wrapped(d, body, (x+45, yh+240), F['body'], MUTED, qw-90, line_gap=8)
    yh += qH + 52

    # ── Section: Pricing (3 tiers + Jet AI) ────────────────────
    yh = _section_header(page, d, yh, 'PRICING', 'coins', M, 'Simple, per-user pricing',
        'Start free with core features, or upgrade to JumpKit Unlimited for unlimited jumps and team sharing.', icon_color=(0,105,126))
    pw = (W - 2*M - 2*36)//3
    priceH = 600
    plans = [
        ('JumpKit Free', '$0', 'Free', ['Web links & local folders', '250 jump launches', '2 teams · 5 members · 10 jumps/team', 'Personal ROI dashboard', 'Hotkey launcher', 'Filters & search', ''], 'START FREE', INK, LINE, False),
        ('JumpKit Unlimited', '$10', '/ user / mo', ['Unlimited jump launches', 'Unlimited teams, members & jumps', 'Personal & team ROI dashboard', 'Auto-archive', 'Auto-backup', 'Early access to new features', ''], 'BEST FOR TEAMS', (255,255,255), (150,231,238), True),
        ('JumpKit + Jet AI', '$39', '/ user / mo', ['Everything in Unlimited +', 'Locally-run AI (no cloud)', 'Personal Agentic Assistant', 'Shareable agent workflows', 'MS Office automation', 'Audit logging', ''], 'COMING SOON', INK, LINE, False),
    ]
    for i,(name,price,per,feats,badge,fcol,border,is_feat) in enumerate(plans):
        x = M + i*(pw+36)
        box = [x, yh, x+pw, yh+priceH]
        _soft_card(page, d, box, radius=45, fill=(SOFT if not is_feat else (236,249,255)), outline=border, sh_alpha=(60 if is_feat else 45), sh_y=26)
        # badge
        rect(d, [x+40, yh+32, x+pw-40, yh+84], fill=(232,249,252) if not is_feat else ROYAL, radius=26, width=0)
        bw = d.textbbox((0,0), badge, font=F['tiny_b'])[2]
        d.text((x + (pw-80)//2 - bw//2, yh+45), badge, font=F['tiny_b'], fill=(0,105,126) if not is_feat else WHITE)
        d.text((x+45, yh+104), name, font=F['h3'], fill=INK)
        d.text((x+45, yh+172), price, font=font(58, black=True), fill=ROYAL)
        d.text((x+45 + (118 if len(price)<4 else 140), yh+222), per, font=F['tiny'], fill=MUTED)
        # divider
        d.line([x+45, yh+266, x+pw-45, yh+266], fill=LINE, width=2)
        fy = yh + 286
        for ft in feats:
            if not ft:
                fy += 46; continue
            check_item(d, x+45, fy, ft, pw-70, fill=INK, check_fill=(229,250,252) if not is_feat else (214,239,255))
            fy += 46
    yh += priceH + 52

    # Jet AI deep-dive strip
    strip = [M, yh, W-M, yh+230]
    _soft_card(page, d, strip, radius=45, fill=(236,249,255), outline=(150,231,238), sh_alpha=50, sh_y=26)
    d.text((M+55, yh+30), 'Coming Soon — Meet Jet, your Personal AI Agent', font=F['h3'], fill=ROYAL)
    draw_wrapped(d, 'Enterprise AI without the data risk. Jet runs entirely on your machine locally — no API queries, no data leaks.',
                 (M+55, yh+90), F['small'], MUTED, W-2*M-110, line_gap=6)
    jet_items = [('shield', 'Zero Data Leakage'), ('device-desktop', 'Agentic AI, Locally Run'), ('browser', 'Office Automation'), ('database-teal', 'Logging for Audits')]
    jw = (W - 2*M - 110 - 3*28)//4
    jy = yh + 168
    for i,(ic,jt) in enumerate(jet_items):
        jx = M + 55 + i*(jw+28)
        _chip_icon(page, jx, jy, 50, (214,239,255), ic, shadow=(18,50,90,35))
        d.text((jx+64, jy+12), jt, font=F['tiny_b'], fill=INK)
    yh += 230 + 48

    # ── Section: Affiliate ─────────────────────────────────────
    yh = _section_header(page, d, yh, 'AFFILIATES', 'coins', M, 'Earn 35% for Life',
        'On every user you refer — no caps, no expiry. Passive income that compounds.', icon_color=(0,105,126))
    # highlight banner
    ban = [M, yh, W-M, yh+140]
    _soft_card(page, d, ban, radius=45, fill=ROYAL, sh_alpha=70, sh_y=28)
    d.text((M+55, yh+42), 'Earn 35% for Life. On Every User You Refer.', font=F['h3'], fill=WHITE)
    d.text((M+55, yh+96), '$0 cost to join · 35% commission per sale · Lifetime while subscribed', font=F['small'], fill=(235,250,255))
    yh += 140 + 44
    af_steps = [
        ('01', 'Apply by Email', 'Send a quick intro to affiliates@jumpkit.app — who you are and how you\'ll promote JumpKit.'),
        ('02', 'Get Your Affiliate Link', 'A unique link tracked through LemonSqueezy — every click and purchase attributed to you.'),
        ('03', 'Share & Earn Forever', 'Every Unlimited user you bring earns 35% of their subscription — monthly, while subscribed.'),
    ]
    aw = (W - 2*M - 2*44)//3
    aH = 440
    for i,(num,title,body) in enumerate(af_steps):
        x = M + i*(aw+44)
        box = [x, yh, x+aw, yh+aH]
        _soft_card(page, d, box, radius=45, fill=WHITE, outline=LINE, sh_alpha=50, sh_y=26)
        d.ellipse([x+45, yh+36, x+45+84, yh+120], fill=ROYAL if i==1 else TURQ)
        d.text((x+45+24, yh+53), num, font=F['h3'], fill=WHITE)
        d.text((x+45, yh+152), title, font=F['h3'], fill=INK)
        draw_wrapped(d, body, (x+45, yh+230), F['body'], MUTED, aw-90, line_gap=8)
    # closing CTA
    cy = yh + aH + 40
    rect(d, [M, cy, W-M, cy+140], fill=ROYAL, outline=None, radius=48)
    over = gradient((W-2*M,140), ROYAL, TURQ, True).convert('RGBA'); over.putalpha(255); over.putalpha(rounded_mask((W-2*M,140),48)); page.alpha_composite(over,(M,cy))
    d.text((M+55, cy+38), 'Ready to partner?  Apply to Become an Affiliate', font=F['h3'], fill=WHITE)
    draw_wrapped(d, 'Send a quick email introducing yourself. We review applications within 1–2 business days.  affiliates@jumpkit.app', (M+55, cy+96), F['small'], (235,250,255), W-2*M-110, line_gap=6)
    cy2 = cy + 140

    _footer(page, d)
    return page

# ═══════════════════════════════════════════════════════════════════
#  BUILD + SAVE ALL PAGES
# ═══════════════════════════════════════════════════════════════════
pages = [build_page1(), build_page2(), build_page3()]
rgb_list = [p.convert('RGB') for p in pages]

# preview PNG = page 1 (keeps existing preview contract)
rgb_list[0].save(OUT_PNG, quality=95)

# multi-page PDF
rgb_list[0].save(OUT_PDF, 'PDF', resolution=300.0, save_all=True, append_images=rgb_list[1:])
print(OUT_PDF)
print(OUT_PNG)
print(OUT_PDF.stat().st_size)
print('pages:', len(rgb_list))
