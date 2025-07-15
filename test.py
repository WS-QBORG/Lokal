import pandas as pd
import requests
import time
import geojson
from tqdm import tqdm

# Wczytaj dane
df = pd.read_csv("wnioski — kopia.csv", dtype=str).fillna("")

# Przygotuj listy wynikowe
features = []
log = []

def get_coords_from_geoportal(teryt, obreb, dzialka):
    try:
        parcel_id = f"{teryt}_{int(float(obreb)):04d}.{dzialka.replace(' ', '')}"
        url = f"https://services.gugik.gov.pl/uug/centroid/{parcel_id}"
        response = requests.get(url, timeout=5)
        if response.ok:
            data = response.json()
            if "X" in data and "Y" in data:
                return float(data["X"]), float(data["Y"])
    except Exception as e:
        pass
    return None, None

def get_coords_from_nominatim(adres):
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": adres,
            "format": "json",
            "limit": 1
        }
        headers = {
            "User-Agent": "QGBORG_MAPA/1.0 (kontakt@twojemail.pl)"
        }
        response = requests.get(url, params=params, headers=headers, timeout=10)
        if response.ok and response.json():
            data = response.json()[0]
            return float(data["lon"]), float(data["lat"])
    except Exception as e:
        pass
    return None, None

for _, row in tqdm(df.iterrows(), total=len(df), desc="Przetwarzanie"):
    teryt = row["jednosta_numer_ew"]
    obreb = row["obreb_numer"]
    dzialka = row["numer_dzialki"]
    miasto = row["miasto"]
    ulica = row["ulica"]
    nr_domu = row["nr_domu"]

    # popup z nazwą inwestycji, projektantem i działką
    popup = f"<b>Inwestycja:</b> {row['nazwa_zamierzenia_bud']}<br>" \
            f"<b>Projektant:</b> {row['projektant_imie']} {row['projektant_nazwisko']}<br>" \
            f"<b>Adres:</b> {miasto}, {ulica} {nr_domu}".strip().rstrip(',') + "<br>" \
            f"<b>Działka:</b> obręb {obreb}, nr {dzialka}<br>" \
            f"<a href='?assign={row['projektant_imie'].upper()}_{row['projektant_nazwisko'].upper()}'>➕ ADD</a>"

    lon, lat = None, None

    if teryt and obreb and dzialka:
        lon, lat = get_coords_from_geoportal(teryt, obreb, dzialka)

    if not lon and (ulica or miasto):
        adres = f"{ulica} {nr_domu} {miasto}".strip()
        lon, lat = get_coords_from_nominatim(adres)
        time.sleep(1)  # wymagane przez Nominatim

    if lon and lat:
        geometry = geojson.Point((lon, lat))
    else:
        geometry = None
        log.append(f"❌ Brak współrzędnych: dzialka={teryt}/{obreb}/{dzialka}, adres={ulica} {nr_domu} {miasto}")

    feature = geojson.Feature(
        geometry=geometry,
        properties={
            "popup": popup,
            "projektant": f"{row['projektant_imie']} {row['projektant_nazwisko']}",
            "rok": pd.to_datetime(row["data_wplywu_wniosku"], errors="coerce").year if row["data_wplywu_wniosku"] else ""
        }
    )
    features.append(feature)

# Zapisz GeoJSON
with open("dzialki_HYBRYDA.geojson", "w", encoding="utf-8") as f:
    geojson.dump(geojson.FeatureCollection(features), f, ensure_ascii=False)

# Zapisz log błędów
with open("log.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(log))

print(f"✅ Gotowe! Zapisano {len(features)} obiektów do dzialki_HYBRYDA.geojson")
print(f"❌ Braki: {len(log)} – zapisano do log.txt")
