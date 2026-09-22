from pathlib import Path
from PIL import Image

source = Path('/home/ubuntu/upload/pasted_file_qo7rbE_image.png')
out = Path('/home/ubuntu/webdev-static-assets/wonderbox-logo-clean.png')
image = Image.open(source).convert('RGBA')
pixels = image.load()
for y in range(image.height):
    for x in range(image.width):
        r, g, b, a = pixels[x, y]
        neutral = max(r, g, b) - min(r, g, b) < 18
        if neutral and min(r, g, b) > 175:
            pixels[x, y] = (r, g, b, 0)
        elif neutral and min(r, g, b) > 145:
            alpha = max(0, int((min(r, g, b) - 145) * 3.4))
            pixels[x, y] = (r, g, b, min(a, 255 - alpha))
alpha = image.getchannel('A')
bbox = alpha.getbbox()
if bbox:
    image = image.crop(bbox)
image.save(out, optimize=True)
print(out)
