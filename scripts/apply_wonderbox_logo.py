from pathlib import Path
logo = '/manus-storage/wonderbox-logo_5074397f.png'
for raw_path in ['client/src/pages/StreamingScreens.tsx', 'client/src/pages/Home.tsx']:
    path = Path('/home/ubuntu/streambox-iptv') / raw_path
    text = path.read_text()
    text = text.replace('<span className="brand-mark"><Tv size={18} /></span>', f'<span className="brand-mark logo-mark"><img src="{logo}" alt="WONDERBOX" /></span>')
    text = text.replace('<span className="brand-mark"><Tv size={21} /></span>', f'<span className="brand-mark logo-mark"><img src="{logo}" alt="WONDERBOX" /></span>')
    text = text.replace('<span className="brand-mark"><Tv size={19} /></span>', f'<span className="brand-mark logo-mark"><img src="{logo}" alt="WONDERBOX" /></span>')
    text = text.replace('<span className="brand-mark small"><Tv size={13} /></span>', f'<span className="brand-mark small logo-mark"><img src="{logo}" alt="WONDERBOX" /></span>')
    path.write_text(text)
print('Logo asset wired into brand marks')
