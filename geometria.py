import pandas as pd
import requests
from shapely.geometry import shape
import geopandas as gpd
from tqdm import tqdm

# Wczytaj dane z pliku GeoJSON
gdf = gpd.read_file("dzialki.geojson")

# Przekształć do układu metrycznego (np. EPSG:2180) dla poprawnych centroidów
gdf = gdf.to_crs(epsg=2180)

# Oblicz centroidy i ogranicz do pierwszych 30 działek
centroids = gdf.geometry.centroid.head(30)

# Lista wyników
results = []

# Pobierz dane z ULDK dla każdego centroidu
for point in tqdm(centroids, desc="Zapytania do ULDK"):
    x, y = point.x, point.y
    url = f"https://uldk.gugik.gov.pl/?request=SnapToPoint&xy={x},{y}&result=geojson"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results.append({
            "x": x,
            "y": y,
            "teryt": data['features'][0]['properties'].get('teryt', None),
            "obreb": data['features'][0]['properties'].get('obreb', None),
            "numer": data['features'][0]['properties'].get('numer', None),
            "geometry": data['features'][0]['geometry']
        })
    except Exception as e:
        results.append({
            "x": x,
            "y": y,
            "error": str(e)
        })

# Zapisz wyniki do pliku CSV
df = pd.DataFrame(results)
df.to_csv("uldk_results_first30.csv", index=False)
