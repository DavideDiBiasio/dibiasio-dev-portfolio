import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('disegna la luna al primo quarto con la metà destra illuminata', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-04-15T19:13:00Z'));
    try {
      const fixture = TestBed.createComponent(App);
      const moon = (fixture.componentInstance as unknown as { moon: () => { w: number; pixels: Array<{ x: number; tone: string }> } }).moon();
      const half = moon.w / 2;
      const dark = moon.pixels.filter((p) => p.tone === 'moon-dark');
      const darkOnLeft = dark.filter((p) => p.x < half).length;
      expect(dark.length).toBeGreaterThan(moon.pixels.length * 0.35);
      expect(darkOnLeft / dark.length).toBeGreaterThan(0.95);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should render the name', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const name = compiled.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(name).toBe('Davide Di Biasio');
  });
});
