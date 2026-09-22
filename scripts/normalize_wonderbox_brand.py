from pathlib import Path
logo = '/manus-storage/wonderbox-logo-clean_4a0b7be4.png'
path = Path('/home/ubuntu/streambox-iptv/client/src/pages/StreamingScreens.tsx')
text = path.read_text()
text = text.replace(f'<span className="brand-mark logo-mark"><img src="{logo}" alt="WONDERBOX" /></span><span>WONDERBOX</span>', f'<span className="brand-lockup"><img src="{logo}" alt="WONDERBOX" /></span>')
text = text.replace(f'<span className="brand-mark logo-mark"><img src="{logo}" alt="WONDERBOX" /></span><b>WONDERBOX</b>', f'<span className="profile-logo"><img src="{logo}" alt="WONDERBOX" /></span>')
path.write_text(text)
path = Path('/home/ubuntu/streambox-iptv/client/src/pages/Home.tsx')
text = path.read_text()
text = text.replace(f'<span className="brand-mark logo-mark"><img src="{logo}" alt="WONDERBOX" /></span><span className="font-display text-xl font-bold tracking-[-0.03em]">WONDERBOX<span className="text-[#536a86]"> IPTV</span></span>', f'<span className="legacy-logo"><img src="{logo}" alt="WONDERBOX" /></span>')
path.write_text(text)
print('Brand markup normalized')
