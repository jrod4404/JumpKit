from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import textwrap, math

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'Commercial' / 'affiliates'
OUT_PDF = OUT_DIR / 'JumpKit_Client_Facing_One_Pager.pdf'
OUT_PNG = OUT_DIR / 'JumpKit_Client_Facing_One_Pager_preview.png'
LOGO = ROOT / 'landing' / 'logo-light.png'
HERO = ROOT / 'landing' / 'assets' / 'hero-mac-dark.jpg'
WIN = ROOT / 'landing' / 'assets' / 'hero-windows-dark.jpg'
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

# hero text
y = 290
d.text((M,y), 'Stop searching.', font=F['h1'], fill=INK)
d.text((M,y+110), 'Start jumping.', font=F['h1b'], fill=ROYAL)
lead = 'JumpKit gives your team one organized desktop launchpad for the web links, folders, shared drives, portals, and project resources they open every day.'
y2 = draw_wrapped(d, lead, (M, y+245), F['body'], (58,78,99), 1040, line_gap=12)

# hero image right
hero_img = contain_on_bg(HERO, (1100, 560))
paste_rounded(page, hero_img, (1290, 315, 2390, 875), radius=58, shadow=True)
# image badge
rect(d, [1355, 770, 1950, 850], fill=(7,22,38,235), radius=34)
d.text((1390, 792), 'Windows + macOS desktop app', font=F['small_b'], fill=WHITE)

# pain cards
card_y = 970
cards=[('Lost links','Bookmarks, shortcuts, and spreadsheets drift out of sync.'),('Buried folders','Shared drives and local paths take too many clicks.'),('Slow onboarding','New users ask where key resources live.')] 
cw=(W-2*M-36)//3
for i,(title,body) in enumerate(cards):
    x=M+i*(cw+18)
    rect(d,[x,card_y,x+cw,card_y+220],fill=WHITE,outline=LINE,radius=38)
    # icon circle
    d.ellipse([x+30, card_y+32, x+94, card_y+96], fill=(232,249,252))
    d.text((x+48, card_y+43), ['🔎','📁','⚡'][i], font=font(34), fill=INK)
    d.text((x+116, card_y+35), title, font=F['h3'], fill=INK)
    draw_wrapped(d, body, (x+116, card_y+95), F['small'], MUTED, cw-150, line_gap=5)

# panels
panel_y=1240
left=[M,panel_y,M+1085,panel_y+620]
right=[M+1125,panel_y,W-M,panel_y+620]
rect(d,left,fill=WHITE,outline=LINE,radius=45)
rect(d,right,fill=(9,30,51),outline=None,radius=45)
# right gradient overlay
rg=gradient((right[2]-right[0], right[3]-right[1]), (9,30,51), (20,60,96), horizontal=True).convert('RGBA')
rg.putalpha(245); mask=rounded_mask((right[2]-right[0], right[3]-right[1]),45); rg.putalpha(mask.point(lambda p: int(p*0.96)))
page.alpha_composite(rg,(right[0],right[1]))

d.text((left[0]+55,left[1]+50),'What JumpKit organizes',font=F['h2'],fill=INK)
items=['Web links, SaaS portals, internal sites, and customer resources','Local folders, shared drives, network paths, and project directories','Team collections for departments, clients, projects, or onboarding','Searchable jump categories with one-click launching']
yc=left[1]+145
for it in items:
    yc=check_item(d,left[0]+55,yc,it,950); yc+=13

d.text((right[0]+55,right[1]+50),'Why teams feel it',font=F['h2'],fill=WHITE)
items2=['Less time hunting for repeat destinations','Fewer “where is that?” interruptions','Faster employee setup and knowledge transfer','Built-in ROI tracking for time and money saved']
yc=right[1]+145
for it in items2:
    yc=check_item(d,right[0]+55,yc,it,920,fill=(205,220,235),check_fill=(26,79,214)); yc+=13

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
