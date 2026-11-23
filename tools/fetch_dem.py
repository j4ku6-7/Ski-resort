#!/usr/bin/env python3
"""Download real elevation data (AWS Terrain Tiles, Terrarium encoding) for each
resort and bake it into a small JS data file the game loads with a <script> tag.

Usage:  python3 tools/fetch_dem.py            (writes data/<resort>.js)
"""
import base64, io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image

ZOOM = 14
CELL = 20.0  # metres between grid samples
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.environ.get("DEM_CACHE", os.path.join(ROOT, ".dem-cache"))

# Place coordinates are approximate; peaks get snapped to the summit in the DEM.
# "real" = official elevation shown on labels (the 20 m DEM smooths sharp peaks).
RESORTS = {
    "jasna": {
        "name": "Jasná – Chopok",
        "region": "Nízke Tatry, Slovakia",
        "bbox": [48.925, 19.548, 48.992, 19.660],  # south, west, north, east
        "places": [
            {"name": "Chopok", "real": 2024, "lat": 48.9436, "lon": 19.5925, "kind": "peak"},
            {"name": "Dereše", "real": 2004, "lat": 48.9360, "lon": 19.6400, "kind": "peak"},
            {"name": "Priehyba", "lat": 48.9545, "lon": 19.5870, "kind": "spot"},
            {"name": "Vrbické pleso", "real": 1113, "lat": 48.9760, "lon": 19.5900, "kind": "lake"},
            {"name": "Biela Púť", "lat": 48.9775, "lon": 19.5840, "kind": "base"},
            {"name": "Záhradky", "lat": 48.9660, "lon": 19.5690, "kind": "base"},
            {"name": "Lúčky", "lat": 48.9650, "lon": 19.6050, "kind": "base"},
        ],
    },
    "lomnica": {
        "name": "Tatranská Lomnica",
        "region": "Vysoké Tatry, Slovakia",
        "bbox": [49.152, 20.170, 49.212, 20.292],
        "places": [
            {"name": "Lomnický štít", "real": 2634, "lat": 49.1953, "lon": 20.2133, "kind": "peak"},
            {"name": "Kežmarský štít", "real": 2558, "lat": 49.1985, "lon": 20.2230, "kind": "peak"},
            {"name": "Slavkovský štít", "real": 2452, "lat": 49.1658, "lon": 20.1836, "kind": "peak"},
            {"name": "Skalnaté pleso", "real": 1751, "lat": 49.1897, "lon": 20.2342, "kind": "lake"},
            {"name": "Štart", "lat": 49.1760, "lon": 20.2610, "kind": "base"},
            {"name": "Tatranská Lomnica", "lat": 49.1650, "lon": 20.2790, "kind": "base"},
        ],
    },
    # Austria. Coordinates of stations/peaks from OpenStreetMap (© OpenStreetMap contributors, ODbL).
    "hintertux": {
        "name": "Hintertuxer Gletscher",
        "region": "Zillertal, Tirol, Austria",
        "bbox": [47.040, 11.632, 47.112, 11.722],
        "treeline": 2000, "glacier": 2700,
        "places": [
            {"name": "Olperer", "real": 3476, "lat": 47.05331, "lon": 11.65872, "kind": "peak", "snap": 120},
            {"name": "Gefrorene-Wand-Spitzen", "real": 3288, "lat": 47.06495, "lon": 11.67889, "kind": "peak", "snap": 120},
            {"name": "Großer Kaserer", "real": 3263, "lat": 47.0603, "lon": 11.65748, "kind": "peak", "snap": 80},
            {"name": "Hoher Riffler", "real": 3231, "lat": 47.08132, "lon": 11.70434, "kind": "peak", "snap": 120},
            {"name": "Fußstein", "real": 3380, "lat": 47.04706, "lon": 11.64947, "kind": "peak", "snap": 120},
            {"name": "Sommerbergalm", "real": 2100, "lat": 47.0975, "lon": 11.66364, "kind": "spot"},
            {"name": "Tuxer Fernerhaus", "real": 2660, "lat": 47.0774, "lon": 11.6709, "kind": "spot"},
            {"name": "Gletscherbus 3 Bergstation", "real": 3250, "lat": 47.06267, "lon": 11.68053, "kind": "spot"},
            {"name": "Hintertux Talstation", "lat": 47.10683, "lon": 11.67498, "kind": "base"},
        ],
    },
    "ankogel": {
        "name": "Ankogel – Mallnitz",
        "region": "Hohe Tauern, Austria",
        "bbox": [47.005, 13.168, 47.062, 13.262],
        "treeline": 1950, "glacier": 2750,
        "places": [
            {"name": "Ankogel", "real": 3249, "lat": 47.05115, "lon": 13.24868, "kind": "peak", "snap": 120},
            {"name": "Grauleitenspitze", "real": 2891, "lat": 47.04698, "lon": 13.2281, "kind": "peak", "snap": 120},
            {"name": "Schönbretterkogel", "real": 2732, "lat": 47.04269, "lon": 13.19072, "kind": "peak", "snap": 120},
            {"name": "Maresenspitz", "real": 2915, "lat": 47.00452, "lon": 13.2296, "kind": "peak", "snap": 120},
            {"name": "Ankogelbahn Mittelstation", "real": 1941, "lat": 47.02782, "lon": 13.19409, "kind": "spot"},
            {"name": "Ankogelbahn Bergstation", "real": 2630, "lat": 47.04251, "lon": 13.21544, "kind": "spot"},
            {"name": "Ankogelbahn Talstation", "lat": 47.01379, "lon": 13.18627, "kind": "base"},
        ],
    },
    "moelltal": {
        "name": "Mölltaler Gletscher",
        "region": "Hohe Tauern, Austria",
        "bbox": [46.995, 12.972, 47.056, 13.062],
        "treeline": 1950, "glacier": 2650,
        "places": [
            {"name": "Schareck", "real": 3123, "lat": 47.04155, "lon": 13.01774, "kind": "peak", "snap": 120},
            {"name": "Baumbachspitze", "real": 3105, "lat": 47.03879, "lon": 13.02113, "kind": "peak", "snap": 80},
            {"name": "Schlapperebenspitzen", "real": 3021, "lat": 47.02786, "lon": 13.02887, "kind": "peak", "snap": 120},
            {"name": "Alteck", "real": 2942, "lat": 47.03561, "lon": 12.98535, "kind": "peak", "snap": 120},
            {"name": "Weißseekopf", "real": 2910, "lat": 47.0155, "lon": 12.99537, "kind": "peak", "snap": 120},
            {"name": "Mittlerer Murauerkopf", "real": 2988, "lat": 47.02238, "lon": 13.04912, "kind": "peak", "snap": 120},
            # skiers arrive by the underground Gletscher Express funicular from Innerfragant
            {"name": "Gletscher Express (from Innerfragant)", "lat": 47.01601, "lon": 13.01571, "kind": "base"},
        ],
    },
}


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def get_tile(z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{z}_{x}_{y}.png")
    if not os.path.exists(path):
        url = TILE_URL.format(z=z, x=x, y=y)
        req = urllib.request.Request(url, headers={"User-Agent": "ski-resort-dem-fetch"})
        with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
            f.write(r.read())
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def build(key, cfg):
    s, w, n, e = cfg["bbox"]
    x0, y0 = tile_xy(n, w, ZOOM)
    x1, y1 = tile_xy(s, e, ZOOM)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    rows = []
    for ty in range(ty0, ty1 + 1):
        rows.append(np.hstack([get_tile(ZOOM, tx, ty) for tx in range(tx0, tx1 + 1)]))
    mosaic = np.vstack(rows)

    lat_c = math.radians((s + n) / 2)
    m_per_deg_lat = 111132.0
    m_per_deg_lon = 111320.0 * math.cos(lat_c)
    width_m = (e - w) * m_per_deg_lon
    depth_m = (n - s) * m_per_deg_lat
    gw = int(width_m // CELL) + 1
    gh = int(depth_m // CELL) + 1

    def sample(lat, lon):
        px, py = tile_xy(lat, lon, ZOOM)
        px = (px - tx0) * 256 - 0.5
        py = (py - ty0) * 256 - 0.5
        ix, iy = int(math.floor(px)), int(math.floor(py))
        fx, fy = px - ix, py - iy
        q = mosaic[iy:iy + 2, ix:ix + 2]
        return (q[0, 0] * (1 - fx) * (1 - fy) + q[0, 1] * fx * (1 - fy)
                + q[1, 0] * (1 - fx) * fy + q[1, 1] * fx * fy)

    grid = np.zeros((gh, gw))
    for j in range(gh):  # j=0 is the north edge
        lat = n - j * CELL / m_per_deg_lat
        for i in range(gw):
            grid[j, i] = sample(lat, w + i * CELL / m_per_deg_lon)

    min_h = float(np.floor(grid.min()))
    enc = np.clip(np.round((grid - min_h) * 10), 0, 65535).astype("<u2")

    def to_xz(lat, lon):  # metres from the NW corner: x east, z south
        return (lon - w) * m_per_deg_lon, (n - lat) * m_per_deg_lat

    places = []
    for p in cfg["places"]:
        x, z = to_xz(p["lat"], p["lon"])
        i, j = int(round(x / CELL)), int(round(z / CELL))
        if p["kind"] == "peak":  # snap to the highest cell nearby (OSM-sourced points use a small radius)
            r = int(p.get("snap", 400) / CELL)
            sub = grid[max(0, j - r):j + r + 1, max(0, i - r):i + r + 1]
            dj, di = np.unravel_index(np.argmax(sub), sub.shape)
            j, i = max(0, j - r) + dj, max(0, i - r) + di
            x, z = i * CELL, j * CELL
        places.append({"name": p["name"], "kind": p["kind"], "x": round(x, 1), "z": round(z, 1),
                       "elev": p.get("real") or round(float(grid[min(j, gh - 1), min(i, gw - 1)]))})

    out = {
        "key": key, "name": cfg["name"], "region": cfg["region"],
        "w": gw, "h": gh, "cell": CELL, "minH": min_h, "scale": 0.1,
        "treeline": cfg.get("treeline", 1550), "glacier": cfg.get("glacier"),
        "places": places,
        "heights": base64.b64encode(enc.tobytes()).decode(),
    }
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    path = os.path.join(ROOT, "data", f"{key}.js")
    with open(path, "w") as f:
        f.write("window.SKI_MAPS = window.SKI_MAPS || {};\n")
        f.write(f"window.SKI_MAPS[{json.dumps(key)}] = {json.dumps(out)};\n")
    print(f"{key}: {gw}x{gh} cells, {width_m:.0f}x{depth_m:.0f} m, "
          f"elev {grid.min():.0f}-{grid.max():.0f} m")
    for p in places:
        print(f"   {p['name']:<20} {p['elev']} m")


if __name__ == "__main__":
    for k in (sys.argv[1:] or RESORTS):
        build(k, RESORTS[k])
