from __future__ import annotations
import json, time, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
BEACHES = json.loads((DATA / 'beaches_source.json').read_text(encoding='utf-8'))
LISBON = ZoneInfo('Europe/Lisbon')


def dl(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def save_json(rel, obj):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')


def save_text(rel, txt):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(txt, encoding='utf-8')


def fetch_ipma():
    urls = {
        'data/ipma/sea_day0.json': 'https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day0.json',
        'data/ipma/sea_day1.json': 'https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day1.json',
        'data/ipma/sea_day2.json': 'https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day2.json',
        'data/ipma/warnings.json': 'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json',
        'data/ipma/sea_locations.json': 'https://api.ipma.pt/open-data/sea-locations.json',
    }
    counts = {}
    for rel, url in urls.items():
        txt = dl(url)
        save_text(rel, txt)
        try:
            obj = json.loads(txt)
            if isinstance(obj, dict) and 'data' in obj and isinstance(obj['data'], list):
                counts[rel] = len(obj['data'])
            elif isinstance(obj, list):
                counts[rel] = len(obj)
            else:
                counts[rel] = None
        except Exception:
            counts[rel] = None
    return counts


def fetch_weather_and_forecast():
    weather_items = []
    forecast_items = []
    for b in BEACHES:
        params = urllib.parse.urlencode({
            'latitude': str(b['lat']),
            'longitude': str(b['lon']),
            'current': 'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code',
            'daily': 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max',
            'forecast_days': '3',
            'timezone': 'auto'
        })
        try:
            data = json.loads(dl(f'https://api.open-meteo.com/v1/forecast?{params}'))
            cur = data.get('current', {})
            daily = data.get('daily', {})
            weather_items.append({
                'name': b['name'],
                'temperature_2m': cur.get('temperature_2m'),
                'wind_speed_10m': cur.get('wind_speed_10m'),
                'wind_direction_10m': cur.get('wind_direction_10m'),
                'weather_code': cur.get('weather_code')
            })
            days = []
            for i, date in enumerate(daily.get('time', [])[:3]):
                days.append({
                    'date': date,
                    'temp_max': daily.get('temperature_2m_max', [None]*3)[i],
                    'temp_min': daily.get('temperature_2m_min', [None]*3)[i],
                    'wind_speed_10m_max': daily.get('wind_speed_10m_max', [None]*3)[i],
                    'weather_code': daily.get('weather_code', [None]*3)[i],
                })
            forecast_items.append({'name': b['name'], 'days': days})
        except Exception:
            weather_items.append({'name': b['name']})
            forecast_items.append({'name': b['name'], 'days': []})
        time.sleep(0.12)
    return weather_items, forecast_items


def update_history(now_local_iso: str, now_utc_iso: str, weather_items, forecast_items, ipma_counts):
    history_path = DATA / 'update_history.json'
    if history_path.exists():
        try:
            history = json.loads(history_path.read_text(encoding='utf-8'))
            entries = history.get('entries', []) if isinstance(history, dict) else []
        except Exception:
            entries = []
    else:
        entries = []
    entries.insert(0, {
        'generated_at_local': now_local_iso,
        'generated_at_utc': now_utc_iso,
        'beaches_count': len(BEACHES),
        'weather_items': len(weather_items),
        'forecast_items': len(forecast_items),
        'sea_points': ipma_counts.get('data/ipma/sea_day0.json'),
        'source': 'github-actions'
    })
    save_json('data/update_history.json', {'entries': entries[:20]})


def main():
    ipma_counts = fetch_ipma()
    weather_items, forecast_items = fetch_weather_and_forecast()
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(LISBON)
    now_utc_iso = now_utc.isoformat()
    now_local_iso = now_local.isoformat()
    save_json('data/weather_snapshot.json', {
        'generated_at_local': now_local_iso,
        'generated_at_utc': now_utc_iso,
        'items': weather_items
    })
    save_json('data/weather_forecast_3d.json', {
        'generated_at_local': now_local_iso,
        'generated_at_utc': now_utc_iso,
        'items': forecast_items
    })
    save_json('data/meta.json', {
        'generated_at_local': now_local_iso,
        'generated_at_utc': now_utc_iso,
        'source': 'github-actions',
        'expected_refresh_hours': 4
    })
    update_history(now_local_iso, now_utc_iso, weather_items, forecast_items, ipma_counts)


if __name__ == '__main__':
    main()
