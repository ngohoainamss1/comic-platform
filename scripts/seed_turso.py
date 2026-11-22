import json
import urllib.request
import os

# Load .env
env_path = r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\.env'
env = {}
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            if '=' in line and not line.strip().startswith('#'):
                k, v = line.strip().split('=', 1)
                env[k.strip()] = v.strip()

url = env.get('TURSO_DATABASE_URL', 'libsql://comic-db-ngohoainamss1.aws-ap-southeast-1.turso.io')
token = env.get('TURSO_AUTH_TOKEN', '')

# Convert libsql:// to https://
if url.startswith('libsql://'):
    http_url = 'https://' + url[len('libsql://'):] + '/v2/pipeline'
else:
    http_url = url.rstrip('/') + '/v2/pipeline'

with open(r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\scripts\vina_genres.json', 'r', encoding='utf-8') as f:
    genres = json.load(f)

print(f'Loaded {len(genres)} genres. Connecting to Turso HTTP endpoint: {http_url}')

requests_payload = [
    {
        "type": "execute",
        "stmt": {
            "sql": "CREATE TABLE IF NOT EXISTS genres (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', comic_count INTEGER DEFAULT 0)"
        }
    }
]

for g in genres:
    requests_payload.append({
        "type": "execute",
        "stmt": {
            "sql": "INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES (?, ?, ?, ?)",
            "args": [
                {"type": "text", "value": g['slug']},
                {"type": "text", "value": g['name']},
                {"type": "text", "value": g.get('description', '')},
                {"type": "integer", "value": str(g.get('comic_count', 0))}
            ]
        }
    })

data = json.dumps({"requests": requests_payload}).encode('utf-8')
req = urllib.request.Request(
    http_url,
    data=data,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        print("Turso seed response:", json.dumps(res_data, indent=2)[:500])
        print("Successfully seeded all 224 genres directly to Turso database!")
except Exception as e:
    print("Error seeding Turso:", e)
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
