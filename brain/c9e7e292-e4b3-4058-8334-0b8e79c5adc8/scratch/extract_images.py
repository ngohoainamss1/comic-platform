import httpx, re
from bs4 import BeautifulSoup

url = 'https://vinahentai.best/truyen-hentai/chi-gai-cua-ban-toi-la-nguoi-dau-tien-cua-toi-2/chap-1'
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
res = httpx.get(url, headers=headers, follow_redirects=True)
soup = BeautifulSoup(res.text, 'html.parser')

script_imgs = []
url_pattern = re.compile(
    r"""["']((?:https?:)?//[^"'\s<>\\]+/(?:manga-images|story-images|uploads|images)/[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s<>\\]*)?)["']""",
    re.IGNORECASE,
)
for script in soup.find_all('script'):
    text = script.string or script.get_text() or ''
    if text:
        cleaned = text.replace('\\/', '/')
        for m in url_pattern.finditer(cleaned):
            u = m.group(1)
            if u not in script_imgs:
                script_imgs.append(u)

print('Script imgs extracted count:', len(script_imgs))
print('First 3:', script_imgs[:3])
print('Last 3:', script_imgs[-3:])
