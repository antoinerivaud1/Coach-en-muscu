# Génère les assets source (icône + splash) — encre + haltère vert acide.
# Lancer: python3 scripts/gen-icons.py  (puis: npx capacitor-assets generate)
from PIL import Image, ImageDraw
INK=(11,11,15,255); LIME=(204,255,2,255); TRANSP=(0,0,0,0)
def dumbbell(d,cx,cy,scale,color=LIME):
    s=scale; barw=int(400*s); barh=int(46*s)
    d.rounded_rectangle([cx-barw//2,cy-barh//2,cx+barw//2,cy+barh//2],radius=int(14*s),fill=color)
    for sign in (-1,1):
        x=cx+sign*int(150*s); iw=int(54*s); ih=int(170*s)
        d.rounded_rectangle([x-iw//2,cy-ih//2,x+iw//2,cy+ih//2],radius=int(16*s),fill=color)
    for sign in (-1,1):
        x=cx+sign*int(210*s); ow=int(54*s); oh=int(250*s)
        d.rounded_rectangle([x-ow//2,cy-oh//2,x+ow//2,cy+oh//2],radius=int(16*s),fill=color)
    for sign in (-1,1):
        x=cx+sign*int(250*s); ew=int(34*s); eh=int(120*s)
        d.rounded_rectangle([x-ew//2,cy-eh//2,x+ew//2,cy+eh//2],radius=int(12*s),fill=color)
def icon(path,bg,scale,size=1024):
    img=Image.new("RGBA",(size,size),bg); dumbbell(ImageDraw.Draw(img),size//2,size//2,scale*size/1024); img.save(path)
icon("assets/icon-only.png",INK,1.0)
Image.new("RGBA",(1024,1024),INK).save("assets/icon-background.png")
icon("assets/icon-foreground.png",TRANSP,0.62)
for n in ("assets/splash.png","assets/splash-dark.png"):
    img=Image.new("RGBA",(2732,2732),INK); dumbbell(ImageDraw.Draw(img),1366,1366,1.5); img.save(n)
print("ok")
