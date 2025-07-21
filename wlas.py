import json

with open("dzialki.geojson", encoding="utf-8") as f:
    data = json.load(f)

# Pierwszy feature
f0 = data["features"][0]

print("Dostępne klucze w 'properties':")
for key in f0["properties"].keys():
    print("-", key)
