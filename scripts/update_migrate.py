import json

with open(r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\scripts\vina_genres.json', 'r', encoding='utf-8') as f:
    genres = json.load(f)

lines = []
for g in genres:
    name_esc = g['name'].replace("'", "''")
    slug_esc = g['slug'].replace("'", "''")
    desc_esc = g['description'].replace("'", "''")
    count = g['comic_count']
    lines.append(f"    await db.execute(\"INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('{slug_esc}', '{name_esc}', '{desc_esc}', {count})\");")

seed_code = "\n".join(lines)

migrate_path = r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\apps\worker\src\db\migrate.ts'
with open(migrate_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace genre seeding section
start_marker = "// Seed some popular genre descriptions"
end_marker = "migrated = true;"

new_section = f"""    // Seed all VinaHentai genres with exact descriptions and comic counts
{seed_code}
"""

if start_marker in content:
    parts = content.split(start_marker)
    new_content = parts[0] + new_section + "\n    " + parts[1].split(end_marker)[0] + end_marker + parts[1].split(end_marker)[1]
else:
    # Append before migrated = true
    new_content = content.replace(end_marker, new_section + "\n    " + end_marker)

with open(migrate_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully updated migrate.ts with all 224 genres!")
