import json

with open("dzialki.geojson", encoding="utf-8") as f:
    data = json.load(f)

adresy = sorted(set(
    f["properties"].get("Adres", "").strip()
    for f in data["features"]
    if f["properties"].get("Adres", "").strip()
))

with open("adresy.txt", "w", encoding="utf-8") as f:
    for a in adresy:
        f.write(a + "\n")

print(f"Zapisano {len(adresy)} unikalnych miejscowości do adresy.txt")
