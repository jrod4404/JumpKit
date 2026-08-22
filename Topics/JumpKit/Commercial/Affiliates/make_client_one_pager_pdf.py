from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import textwrap, math

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'Commercial' / 'affiliates'
OUT_PDF = OUT_DIR / 'JumpKit_Client_Facing_One_Pager.pdf'
OUT_PNG = OUT_DIR / 'JumpKit_Client_Facing_One_Pager_preview.png'
LOGO = ROOT / 'landing' / 'logo-light.png'
HERO = ROOT / 'landing' / 'assets' / 'hero-mac-light.jpg'
WIN = ROOT / 'landing' / 'assets' / 'hero-windows-light.jpg'
ICON = ROOT / 'landing' / 'icon-512.png'

W, H = 2550, 3300  # Letter at 300dpi-ish ratio; saved as one-page PDF image
M = 150
ROYAL = (26, 79, 214)
TURQ = (0, 194, 199)
INK = (16, 32, 51)
MUTED = (86, 105, 126)
LINE = (214, 229, 242)
SOFT = (246, 250, 254)
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

# canvas
page = Image.new('RGBA', (W,H), WHITE)
d = ImageDraw.Draw(page)

# subtle background
bg = Image.new('RGBA',(W,H),(255,255,255,255))
# left accent
g = gradient((38,H), ROYAL, TURQ, horizontal=False).convert('RGBA')
page.alpha_composite(g,(0,0))
# soft blobs
for cx,cy,r,col in [(300,250,430,(0,194,199,32)), (2260,300,360,(26,79,214,25)), (2120,3000,520,(0,194,199,22))]:
    blob = Image.new('RGBA',(r*2,r*2),(0,0,0,0)); bd=ImageDraw.Draw(blob)
    bd.ellipse([0,0,r*2,r*2], fill=col)
    blob = blob.filter(ImageFilter.GaussianBlur(24))
    page.alpha_composite(blob,(cx-r,cy-r))

# header
logo = Image.open(LOGO).convert('RGBA')
logo_w = 460
logo_h = int(logo.height * logo_w / logo.width)
page.alpha_composite(logo.resize((logo_w, logo_h), Image.LANCZOS), (M, 110))
rect(d, [W-820, 126, W-M, 205], fill=(232,249,252), outline=(171,232,238), radius=40)
d.text((W-780, 148), 'CLIENT PRODUCTIVITY BRIEF', font=F['tiny_b'], fill=(0,105,126))

# hero text (landing page H1 + description, verbatim)
y = 275
h1a = 'Your One-Click Link Launcher'
h1b = 'for Windows & Mac'
d.text((M, y), h1a, font=font(62, black=True), fill=INK)
d.text((M, y+66), h1b, font=font(62, black=True), fill=ROYAL)
desc = ('JumpKit displays your navigation links in one place — web links, local directories, shared resources — '
        'organized in categories and launched in a single click. No more clicking through folders. No more lost tabs. '
        'No more bookmarks. Just jump. Save time, save money, and track the savings automatically. '
        'Available for single users and shareable among teams. Getting started takes minutes, works on both Windows '
        'and macOS, and keeps your data local — fast, private, and always yours.')
y2 = draw_wrapped(d, desc, (M, y+160), F['body'], (58,78,99), 1040, line_gap=12)

# hero image right (no dark shadow — clean light card, thin light divider only)
hero_img = contain_on_bg(HERO, (1100, 560), bg=(255,255,255))
paste_rounded(page, hero_img, (1290, 315, 2390, 875), radius=58, shadow=False)
# image badge (light theme: soft turquoise bg, dark teal text)
rect(d, [1355, 770, 1950, 850], fill=(232,249,252), radius=34)
d.text((1390, 792), 'Windows + macOS desktop app', font=F['small_b'], fill=(0,105,126))

# ── Real Tabler icons (same as landing page, pre-rendered to PNG) ───
import os as _os
_ICON_DIR = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '_icons')
_icon_cache = {}
def _load_icon(name):
    if name not in _icon_cache:
        _icon_cache[name] = Image.open(_os.path.join(_ICON_DIR, name + '.png')).convert('RGBA')
    return _icon_cache[name]

def _chip_icon(target, x, y, s, bg, icon_name):
    d.rounded_rectangle([x, y, x+s, y+s], radius=20, fill=bg)
    im = _load_icon(icon_name).resize((int(s*0.62), int(s*0.62)), Image.LANCZOS)
    ix = x + int((s - int(s*0.62))/2)
    iy = y + int((s - int(s*0.62))/2)
    target.alpha_composite(im, (ix, iy))

# Problem → Solution section (light theme, matches landing page)
ps_y = 955
col_w = (W - 2*M - 40)//2
PROB_ICON = (224, 85, 85)    # red #e05555
PROB_BG   = (254, 242, 242)  # soft red
SOL_ICON  = (34, 197, 94)    # green #22c55e
SOL_BG    = (240, 253, 244)  # soft green

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

# subtle tinted card borders
PROB_BORDER = (252, 224, 224)   # soft red
SOL_BORDER = (220, 245, 226)   # soft green

def _draw_ps_card(x0, x1, label, title, ic, ibg, border, items):
    # taller card to fit 8 rows in a 2x4 grid
    card_top = ps_y
    card_bot = ps_y + 560
    cx_center = (x0 + x1)//2
    rect(d, [x0, card_top, x1, card_bot], fill=WHITE, outline=border, radius=45, width=3)
    # centered label pill
    pill_w = 272
    d.rounded_rectangle([cx_center-pill_w//2, card_top+42, cx_center+pill_w//2, card_top+90], radius=25, fill=ibg)
    lw = d.textbbox((0,0), label, font=F['tiny_b'])[2]
    d.text((cx_center-lw//2, card_top+53), label, font=F['tiny_b'], fill=ic)
    # centered title
    tw = d.textbbox((0,0), title, font=font(44, black=True))[2]
    d.text((cx_center-tw//2, card_top+104), title, font=font(44, black=True), fill=INK)
    # 2 columns x 4 rows
    sub_w = (col_w - 60 - 24)//2  # two cols inside card
    for idx, (icon, t, b) in enumerate(items):
        c = idx // 4   # 0=left col, 1=right col
        r = idx % 4
        cx = x0 + 45 + c*(sub_w+24)
        cy = card_top + 155 + r*100
        _chip_icon(page, cx, cy, 54, ibg, icon)
        # chip + title next to it; description below title (8px line spacing)
        d.text((cx+66, cy+2), t, font=font(25, True), fill=INK)
        draw_wrapped(d, b, (cx+66, cy+30), F['tiny'], MUTED, sub_w-72, line_gap=8)
    return card_bot

ps_bot = _draw_ps_card(M, M+col_w, 'THE PROBLEM', "Bookmarks Stink", PROB_ICON, PROB_BG, PROB_BORDER, PROBLEM_ITEMS)
_draw_ps_card(M+col_w+40, W-M, 'THE SOLUTION', 'JumpKit — Your Clean Launchpad', SOL_ICON, SOL_BG, SOL_BORDER, SOLUTION_ITEMS)

# rollout/pricing row
row_y=1915
rect(d,[M,row_y,W-M,row_y+560],fill=SOFT,outline=LINE,radius=45)
d.text((M+55,row_y+45),'Recommended starter rollout',font=F['h2'],fill=INK)
steps=[('1','Pick resource sets','Identify the top links, folders, portals, and drives users open repeatedly.'),('2','Create starter columns','Group by department, client, project, workflow, or onboarding role.'),('3','Share and improve','Roll out, track launches, and adjust what saves the most time.')] 
sw=(W-2*M-130)//3
for i,(num,title,body) in enumerate(steps):
    x=M+55+i*(sw+40); y=row_y+140
    d.ellipse([x,y,x+72,y+72], fill=ROYAL if i==0 else TURQ)
    d.text((x+24,y+15),num,font=F['h3'],fill=WHITE)
    d.text((x,y+95),title,font=F['h3'],fill=INK)
    draw_wrapped(d,body,(x,y+155),F['small'],MUTED,sw,line_gap=5)

# pricing and CTA
price_y=2535
pw=(W-2*M-36)//2
for i,(name,price,desc,badge) in enumerate([
    ('JumpKit Free','$0','Web links/local folders, 250 launches, limited teams, ROI dashboard, hotkey launcher, search/filter.','START HERE'),
    ('JumpKit Unlimited','$10 / user / month','Unlimited launches, teams, members, jumps, team ROI, auto-backup, auto-archive.','BEST FOR TEAMS')]):
    x=M+i*(pw+36)
    rect(d,[x,price_y,x+pw,price_y+325],fill=WHITE,outline=(150,231,238) if i else LINE,radius=42,width=5 if i else 2)
    d.text((x+45,price_y+42),name,font=F['h3'],fill=INK)
    rect(d,[x+pw-300,price_y+40,x+pw-45,price_y+92],fill=(232,249,252),outline=None,radius=26)
    tw=d.textbbox((0,0),badge,font=F['tiny_b'])[2]
    d.text((x+pw-172-tw/2,price_y+53),badge,font=F['tiny_b'],fill=(0,105,126))
    d.text((x+45,price_y+118),price,font=F['price'],fill=ROYAL if i else INK)
    draw_wrapped(d,desc,(x+45,price_y+212),F['small'],MUTED,pw-90,line_gap=5)

cta_y=2905
rect(d,[M,cta_y,W-M,cta_y+210],fill=ROYAL,outline=None,radius=48)
# overlay gradient
over=gradient((W-2*M,210),ROYAL,TURQ,True).convert('RGBA'); over.putalpha(255); over.putalpha(rounded_mask((W-2*M,210),48)); page.alpha_composite(over,(M,cta_y))
d.text((M+55,cta_y+42),'Suggested next step',font=F['h2'],fill=WHITE)
draw_wrapped(d,'Ask your MSP or IT partner to set up a pilot JumpKit workspace with your top 20 recurring destinations.',(M+55,cta_y+112),F['body'],(235,250,255),1390,line_gap=8)
rect(d,[W-M-545,cta_y+55,W-M-55,cta_y+155],fill=(255,255,255,235),outline=(255,255,255,255),radius=30)
d.text((W-M-465,cta_y+83),'jumpkit.app',font=F['h3'],fill=ROYAL)

# footer
fy=3198
d.line([M,fy,W-M,fy],fill=LINE,width=2)
d.text((M,fy+30),'JumpKit Client-Facing One-Pager',font=F['tiny'],fill=(126,144,162))
d.text((W-M-495,fy+30),'Stop searching. Start jumping.',font=F['tiny_b'],fill=(126,144,162))

# save
rgb = page.convert('RGB')
rgb.save(OUT_PNG, quality=95)
rgb.save(OUT_PDF, 'PDF', resolution=300.0)
print(OUT_PDF)
print(OUT_PNG)
print(OUT_PDF.stat().st_size)
