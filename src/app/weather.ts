/**
 * Meteo attuale su Fondi da Open-Meteo (gratuito, senza chiave).
 * Se la richiesta fallisce il cielo resta sereno.
 */

export interface Weather {
  /** Copertura nuvolosa, da 0 a 1. */
  clouds: number;
  /** Intensità della pioggia, da 0 a 1. */
  rain: number;
  snow: boolean;
  storm: boolean;
  fog: boolean;
  /** Descrizione breve in italiano. */
  label: string;
  temperature: number | null;
}

export const CLEAR: Weather = { clouds: 0, rain: 0, snow: false, storm: false, fog: false, label: 'Sereno', temperature: null };

/** Codici WMO usati da Open-Meteo. */
export function fromWmo(code: number, cloudCover: number, precipitation: number, temperature: number | null): Weather {
  const clouds = Math.min(1, Math.max(0, cloudCover / 100));
  const base = { ...CLEAR, clouds, temperature };
  const rainFrom = (min: number) => Math.min(1, Math.max(min, precipitation / 6));

  if (code >= 95) return { ...base, clouds: Math.max(clouds, 0.95), rain: rainFrom(0.8), storm: true, label: 'Temporale' };
  if (code >= 85 || (code >= 71 && code <= 77)) return { ...base, clouds: Math.max(clouds, 0.9), rain: rainFrom(0.4), snow: true, label: 'Neve' };
  if (code >= 80) return { ...base, clouds: Math.max(clouds, 0.8), rain: rainFrom(code === 82 ? 0.9 : 0.5), label: 'Rovesci' };
  if (code >= 61) return { ...base, clouds: Math.max(clouds, 0.9), rain: rainFrom(code >= 65 ? 0.85 : code >= 63 ? 0.6 : 0.35), label: 'Pioggia' };
  if (code >= 51) return { ...base, clouds: Math.max(clouds, 0.85), rain: rainFrom(0.2), label: 'Pioviggine' };
  if (code === 45 || code === 48) return { ...base, clouds: Math.max(clouds, 0.6), fog: true, label: 'Nebbia' };
  if (code === 3) return { ...base, label: 'Coperto' };
  if (code === 2) return { ...base, label: 'Nuvoloso' };
  if (code === 1) return { ...base, label: 'Poco nuvoloso' };
  return { ...base, label: 'Sereno' };
}

/** Meteo forzato dall'indirizzo, per provare: ?meteo=sereno|nuvole|pioggia|temporale|nebbia|neve */
export function weatherOverride(param: string | null): Weather | null {
  switch (param) {
    case 'sereno':
      return CLEAR;
    case 'nuvole':
      return fromWmo(3, 85, 0, null);
    case 'pioggia':
      return fromWmo(63, 100, 3, null);
    case 'temporale':
      return fromWmo(95, 100, 8, null);
    case 'nebbia':
      return fromWmo(45, 70, 0, null);
    case 'neve':
      return fromWmo(73, 100, 2, null);
    default:
      return null;
  }
}

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Weather> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=weather_code,cloud_cover,precipitation,temperature_2m';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Meteo non disponibile (${res.status})`);
  const json = (await res.json()) as {
    current?: { weather_code?: number; cloud_cover?: number; precipitation?: number; temperature_2m?: number };
  };
  const c = json.current ?? {};
  return fromWmo(c.weather_code ?? 0, c.cloud_cover ?? 0, c.precipitation ?? 0, c.temperature_2m ?? null);
}
