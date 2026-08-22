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

def paste_rounded(base, img, box, radius=48, shadow=True):
    x1,y1,x2,y2 = box
    img = img.resize((x2-x1, y2-y1), Image.LANCZOS).convert('RGBA')
    mask = rounded_mask(img.size, radius)
    if shadow:
        sh = Image.new('RGBA', img.size, (0,0,0,80))
        sh.putalpha(mask.filter(ImageFilter.GaussianBlur(24)))
        base.alpha_composite(sh, (x1+18, y1+22))
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
        'Available for single users and shareable among teams.')
y2 = draw_wrapped(d, desc, (M, y+160), F['body'], (58,78,99), 1040, line_gap=12)

# hero image right
hero_img = contain_on_bg(HERO, (1100, 560), bg=(255,255,255))
paste_rounded(page, hero_img, (1290, 315, 2390, 875), radius=58, shadow=True)
# image badge (light theme: soft turquoise bg, dark teal text)
rect(d, [1355, 770, 1950, 850], fill=(232,249,252), radius=34)
d.text((1390, 792), 'Windows + macOS desktop app', font=F['small_b'], fill=(0,105,126))

# ── Light-theme icon glyphs (Problem red / Solution green) ───────────
def _chip(d, x, y, s, bg, color, glyph):
    d.rounded_rectangle([x, y, x+s, y+s], radius=18, fill=bg)
    glyph(d, x+s*0.22, y+s*0.22, s*0.56, color)

def _g_mess(d, x, y, s, c):
    q = s*0.30
    d.rounded_rectangle([x, y, x+q, y+q], radius=5, fill=c)
    d.rounded_rectangle([x+s*0.42, y+s*0.10, x+s*0.72, y+s*0.40], radius=5, fill=c)
    d.rounded_rectangle([x+s*0.06, y+s*0.52, x+s*0.36, y+s*0.82], radius=5, fill=c)
    d.rounded_rectangle([x+s*0.50, y+s*0.58, x+s*0.80, y+s*0.88], radius=5, fill=c)

def _g_grid(d, x, y, s, c):
    q = s*0.36
    d.rounded_rectangle([x, y, x+q, y+q], radius=5, fill=c)
    d.rounded_rectangle([x+s*0.5, y, x+s*0.5+q, y+q], radius=5, fill=c)
    d.rounded_rectangle([x, y+s*0.5, x+q, y+s*0.5+q], radius=5, fill=c)
    d.rounded_rectangle([x+s*0.5, y+s*0.5, x+s*0.5+q, y+s*0.5+q], radius=5, fill=c)

def _g_folder(d, x, y, s, c):
    w, h = s*0.86, s*0.56
    fx, fy = x+(s-w)/2, y+(s-h)/2
    d.rounded_rectangle([fx, fy+h*0.30, fx+w, fy+h], radius=5, fill=c)
    d.rounded_rectangle([fx, fy+h*0.30, fx+w*0.48, fy+h*0.52], radius=4, fill=c)

def _g_folder_launch(d, x, y, s, c):
    _g_folder(d, x, y+s*0.10, s*0.78, c)
    ax, ay = x+s*0.42, y+s*0.04
    lw = max(4, int(s*0.14))
    d.line([ax, ay+s*0.36, ax+s*0.36, ay], fill=c, width=lw)
    d.line([ax, ay, ax+s*0.36, ay], fill=c, width=lw)
    d.line([ax+s*0.36, ay, ax+s*0.36, ay+s*0.36], fill=c, width=lw)

def _g_person(d, x, y, s, c, off=0):
    cx = x + s/2 + off
    r = s*0.17
    d.ellipse([cx-r, y+s*0.04, cx+r, y+s*0.04+2*r], fill=c)
    d.pieslice([cx-s*0.24, y+s*0.32, cx+s*0.24, y+s*0.94], 180, 360, fill=c)

def _g_users(d, x, y, s, c):
    _g_person(d, x, y, s, c, off=-s*0.17)
    _g_person(d, x, y, s, c, off=s*0.17)

def _g_search(d, x, y, s, c):
    cx, cy, r = x+s*0.40, y+s*0.38, s*0.27
    lw = max(3, int(s*0.09))
    d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=c, width=lw)
    d.line([cx+r*0.7, cy+r*0.7, x+s*0.82, y+s*0.82], fill=c, width=lw)

def _g_search_check(d, x, y, s, c):
    _g_search(d, x, y, s, c)
    cx, cy, r = x+s*0.62, y+s*0.70, s*0.20
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=c)
    lw = max(2, int(s*0.05))
    d.line([cx-r*0.42, cy, cx-r*0.02, cy+r*0.38], fill=(255,255,255), width=lw)
    d.line([cx-r*0.02, cy+r*0.38, cx+r*0.5, cy-r*0.42], fill=(255,255,255), width=lw)

def _g_chart(d, x, y, s, c, up=False):
    bw = s*0.18
    base = y+s*0.92
    d.rounded_rectangle([x, base-s*0.30, x+bw, base], radius=3, fill=c)
    d.rounded_rectangle([x+s*0.34, base-s*0.52, x+s*0.34+bw, base], radius=3, fill=c)
    d.rounded_rectangle([x+s*0.68, base-s*0.76, x+s*0.68+bw, base], radius=3, fill=c)
    if up:
        ax, ay = x+s*0.10, y+s*0.02
        lw = max(4, int(s*0.14))
        d.line([ax, ay+s*0.30, ax+s*0.30, ay], fill=c, width=lw)
        d.line([ax, ay, ax+s*0.30, ay], fill=c, width=lw)
        d.line([ax+s*0.30, ay, ax+s*0.30, ay+s*0.30], fill=c, width=lw)

# Problem → Solution section (light theme, matches landing page)
ps_y = 960
col_w = (W - 2*M - 40)//2
PROB_ICON = (224, 85, 85)    # red
PROB_BG   = (254, 242, 242)  # soft red
SOL_ICON  = (34, 197, 94)    # green
SOL_BG    = (240, 253, 244)  # soft green
cols = [
    ('THE PROBLEM', "Bookmarks Don't Cut It", PROB_ICON, PROB_BG, [
        ('They get disorganized', 'Scattered bookmarks and shortcuts drift out of sync.', _g_mess),
        ('Can\'t launch directories', 'No way to open local folders or shared drives.', _g_folder),
        ('Can\'t be shared with teammates', 'No easy way to pass resources to your team.', _g_person),
        ('Hard to search or filter', 'Finding a link means scrolling and hunting.', _g_search),
        ('No usage stats or notes', 'No visibility into what actually saves time.', _g_chart),
    ]),
    ('THE SOLUTION', 'Meet JumpKit — Your Launchpad', SOL_ICON, SOL_BG, [
        ('Organized by categories', 'Clean columns by department, client, or workflow.', _g_grid),
        ('Launch directories in one click', 'Open links, folders, and shared drives instantly.', _g_folder_launch),
        ('Shared instantly across your team', 'Team collections anyone can use — no tribal knowledge.', _g_users),
        ('Instant search and filter', 'Type-and-go search across every jump.', _g_search_check),
        ('ROI tracking and notes', 'Automatically track the time and money you save.', _g_chart),
    ]),
]
for ci, (label, title, ic, ibg, rows) in enumerate(cols):
    x0 = M + ci*(col_w+40)
    x1 = x0 + col_w
    rect(d, [x0, ps_y, x1, ps_y+660], fill=WHITE, outline=LINE, radius=45)
    # section label pill
    d.rounded_rectangle([x0+55, ps_y+50, x0+55+290, ps_y+100], radius=25, fill=ibg)
    d.text((x0+70, ps_y+61), label, font=F['tiny_b'], fill=ic)
    d.text((x0+55, ps_y+118), title, font=font(50, black=True), fill=INK)
    ry = ps_y+185
    for (t, b, glyph) in rows:
        _chip(d, x0+55, ry, 64, ibg, ic, glyph)
        d.text((x0+140, ry+2), t, font=F['small_b'], fill=INK)
        draw_wrapped(d, b, (x0+140, ry+44), F['tiny'], MUTED, col_w-215, line_gap=4)
        ry += 96

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
