import json

with open(r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\scripts\vina_genres.json', 'r', encoding='utf-8') as f:
    genres = json.load(f)

lines = []
for g in genres:
    name = g['name']
    slug = g['slug']
    desc = g['description']
    count = g['comic_count']
    # Use JSON.stringify-like escaping in python for safety
    name_js = json.dumps(name)
    slug_js = json.dumps(slug)
    desc_js = json.dumps(desc)
    lines.append(f"    await db.execute(`INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES (${slug_js}, ${name_js}, ${desc_js}, ${count})`);")

seed_code = "\n".join(lines)

migrate_path = r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\apps\worker\src\db\migrate.ts'
with open(migrate_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace genre seeding section between comments or markers
start_marker = "// Seed all VinaHentai genres with exact descriptions and comic counts"
end_marker = "migrated = true;"

if start_marker in content:
    parts = content.split(start_marker)
    prefix = parts[0] + start_marker + "\n"
    suffix = "\n    " + parts[1].split(end_marker)[1]
    new_content = prefix + seed_code + "\n    " + end_marker + suffix
else:
    # Fallback replacement
    new_content = content.replace(end_marker, f"    // Seed all VinaHentai genres with exact descriptions and comic counts\n{seed_code}\n    {end_marker}")

with open(migrate_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully updated migrate.ts using template literals and JSON.stringify escaping!")
