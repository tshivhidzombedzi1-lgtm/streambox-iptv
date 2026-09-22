from pathlib import Path
files = [
    Path('/home/ubuntu/streambox-iptv/client/src/pages/Home.tsx'),
    Path('/home/ubuntu/streambox-iptv/client/src/pages/StreamingScreens.tsx'),
    Path('/home/ubuntu/streambox-iptv/client/index.html'),
]
for path in files:
    text = path.read_text()
    text = text.replace('NOVA IPTV', 'WONDERBOX').replace('NOVA', 'WONDERBOX')
    text = text.replace('StreamBox IPTV', 'WONDERBOX')
    path.write_text(text)
print('WONDERBOX rebrand applied')
