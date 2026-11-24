import { FONDI, PlanetName, daysSinceJ2000, localSiderealTime, moonDistance, moonPhase, norm180, planetData, planetLongitude, sunHorizontal, sunLongitude, sunTimes, toHorizontal } from './sky';

/** Differenza angolare assoluta in gradi. */
const gap = (a: number, b: number) => Math.abs(norm180(a - b));

describe('sky', () => {
  it('trova la luna nuova dell’eclissi solare del 8 aprile 2024', () => {
    const phase = moonPhase(new Date('2024-04-08T18:21:00Z'));
    expect(gap(phase.elongation, 0)).toBeLessThan(2);
    expect(phase.illumination).toBeLessThan(0.01);
    expect(phase.name).toBe('Luna nuova');
  });

  it('trova la luna piena del 23 aprile 2024', () => {
    const phase = moonPhase(new Date('2024-04-23T23:49:00Z'));
    expect(gap(phase.elongation, 180)).toBeLessThan(2);
    expect(phase.illumination).toBeGreaterThan(0.99);
    expect(phase.name).toBe('Luna piena');
  });

  it('riconosce il primo quarto del 15 aprile 2024', () => {
    const phase = moonPhase(new Date('2024-04-15T19:13:00Z'));
    expect(gap(phase.elongation, 90)).toBeLessThan(2);
    expect(phase.waxing).toBe(true);
  });

  // All'opposizione un pianeta è esattamente dalla parte opposta del Sole.
  const oppositions: Array<[name: PlanetName, iso: string]> = [
    ['jupiter', '2024-12-07T21:00:00Z'],
    ['mars', '2025-01-16T02:00:00Z'],
    ['saturn', '2025-09-21T04:00:00Z'],
    ['neptune', '2024-09-21T00:00:00Z'],
    ['uranus', '2024-11-17T02:00:00Z'],
    ['pluto', '2024-07-23T12:00:00Z'],
  ];

  for (const [name, iso] of oppositions) {
    it(`mette ${name} in opposizione al Sole il ${iso.slice(0, 10)}`, () => {
      const date = new Date(iso);
      const sun = sunLongitude(daysSinceJ2000(date));
      expect(gap(planetLongitude(name, date), sun + 180)).toBeLessThan(1.5);
    });
  }

  it('mette Venere tra la Terra e il Sole alla congiunzione del 23 marzo 2025', () => {
    const venus = planetData('venus', new Date('2025-03-23T01:00:00Z'));
    expect(Math.abs(venus.elongation)).toBeLessThan(2);
    expect(venus.distanceAU).toBeCloseTo(0.28, 1);
  });

  it('stima la luminosità di Giove all’opposizione', () => {
    const jupiter = planetData('jupiter', new Date('2024-12-07T21:00:00Z'));
    expect(jupiter.magnitude).toBeCloseTo(-2.8, 0);
    expect(jupiter.angularDiameter).toBeGreaterThan(47);
  });

  it('stima Plutone debolissimo, intorno alla magnitudine 14,4', () => {
    const pluto = planetData('pluto', new Date('2024-07-23T12:00:00Z'));
    expect(Math.abs(pluto.magnitude - 14.4)).toBeLessThan(0.4);
  });

  it('trova la Luna al perigeo del 17 ottobre 2024', () => {
    const km = moonDistance(daysSinceJ2000(new Date('2024-10-17T00:51:00Z')));
    expect(Math.abs(km - 357175)).toBeLessThan(1500);
  });

  it('vede la Stella Polare all’altezza della latitudine di Fondi', () => {
    for (const iso of ['2026-11-24T20:00:00Z', '2026-06-01T03:00:00Z']) {
      const date = new Date(iso);
      const polaris = toHorizontal(2.53 * 15, 89.264, localSiderealTime(date));
      expect(Math.abs(polaris.alt - FONDI.lat)).toBeLessThan(1);
      expect(Math.abs(norm180(polaris.az))).toBeLessThan(1.5);
    }
  });

  it('mette Sirio a sud quando passa al meridiano', () => {
    const sirius = toHorizontal(6.752 * 15, -16.716, 6.752 * 15);
    expect(sirius.az).toBeCloseTo(180, 0);
    expect(sirius.alt).toBeCloseTo(90 - FONDI.lat - 16.716, 1);
  });

  it('mette il Sole a sud, alto 90° meno la latitudine, a mezzogiorno dell’equinozio', () => {
    const sun = sunHorizontal(new Date('2026-03-20T11:13:00Z'));
    expect(Math.abs(sun.az - 180)).toBeLessThan(3);
    expect(Math.abs(sun.alt - (90 - FONDI.lat))).toBeLessThan(1);
  });

  it('trova alba e tramonto del solstizio d’estate', () => {
    const { rise, set } = sunTimes(new Date('2026-06-21T12:00:00Z'));
    const minutesUtc = (d: Date | null) => (d ? d.getUTCHours() * 60 + d.getUTCMinutes() : NaN);
    expect(Math.abs(minutesUtc(rise) - (3 * 60 + 33))).toBeLessThan(8);
    expect(Math.abs(minutesUtc(set) - (18 * 60 + 47))).toBeLessThan(8);
  });
});
