import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('@zakkster/lite-random', () => {
    class R {
        constructor(s) { this._s = s || 42; this._state = s || 42; }
        next() {
            let t = this._state += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        range(a, b) { return a + this.next() * (b - a); }
        reset(s) { this._s = s; this._state = s; }
    }
    return { default: R, Random: R };
});
vi.mock('@zakkster/lite-color', () => ({
    createGradient: (c) => (t) => c[0] || { l: 0.5, c: 0.1, h: 0 },
    toCssOklch: (c) => `oklch(${c.l} ${c.c} ${c.h}${c.a !== undefined ? ` / ${c.a}` : ''})`,
}));
vi.mock('@zakkster/lite-lerp', () => ({
    lerp: (a,b,t) => a+(b-a)*t, clamp: (v,a,b) => Math.max(a,Math.min(b,v)),
    mapRange: (v,a,b,c,d) => c+(d-c)*((v-a)/(b-a)),
}));

import { SimplexNoise, FlowField, Shape, ArtCanvas, GenEngine } from './GenEngine.js';

describe('🎨 LiteGen', () => {
    describe('SimplexNoise', () => {
        it('noise2D returns values in [-1, 1]', () => {
            const n = new SimplexNoise(42);
            for (let i = 0; i < 100; i++) {
                const v = n.noise2D(i * 0.1, i * 0.2);
                expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1);
            }
        });
        it('noise2D is deterministic', () => {
            const a = new SimplexNoise(42), b = new SimplexNoise(42);
            expect(a.noise2D(1, 2)).toBe(b.noise2D(1, 2));
        });
        it('noise3D returns values', () => {
            const n = new SimplexNoise(42);
            const v = n.noise3D(1, 2, 3);
            expect(typeof v).toBe('number'); expect(isFinite(v)).toBe(true);
        });
        it('fbm returns values', () => {
            const n = new SimplexNoise(42);
            const v = n.fbm(5, 5, 4, 2, 0.5);
            expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1);
        });
        it('different seeds produce different noise', () => {
            const a = new SimplexNoise(1), b = new SimplexNoise(999);
            // Test multiple points — at least one must differ
            let differs = false;
            for (let i = 0; i < 20; i++) {
                if (a.noise2D(i * 3.7, i * 2.3) !== b.noise2D(i * 3.7, i * 2.3)) {
                    differs = true;
                    break;
                }
            }
            expect(differs).toBe(true);
        });
    });

    describe('FlowField', () => {
        it('sample returns vx/vy', () => {
            const f = new FlowField({ noise: new SimplexNoise(42), scale: 0.01, strength: 2 });
            const { vx, vy } = f.sample(100, 100);
            expect(typeof vx).toBe('number'); expect(typeof vy).toBe('number');
        });
        it('update advances time', () => {
            const f = new FlowField({ noise: new SimplexNoise(42) });
            f.update(0.016);
            expect(f._time).toBeGreaterThan(0);
        });
        it('applyTo modifies particle velocity', () => {
            const f = new FlowField({ noise: new SimplexNoise(42), strength: 5 });
            const p = { x: 50, y: 50, vx: 0, vy: 0 };
            f.applyTo(p, 0.016);
            expect(p.vx !== 0 || p.vy !== 0).toBe(true);
        });
    });

    describe('Shape', () => {
        it('polygon returns correct number of points', () => {
            expect(Shape.polygon(0, 0, 100, 6).length).toBe(6);
        });
        it('star returns 2x points', () => {
            expect(Shape.star(0, 0, 100, 50, 5).length).toBe(10);
        });
        it('spiral returns requested count', () => {
            expect(Shape.spiral(0, 0, 100, 3, 50).length).toBe(50);
        });
        it('wave returns requested count', () => {
            expect(Shape.wave(0, 0, 400, 50, 2, 100).length).toBe(100);
        });
        it('lissajous returns requested count', () => {
            expect(Shape.lissajous(0, 0, 3, 4, 100, 100, 200).length).toBe(200);
        });
        it('grid returns cols * rows points', () => {
            const g = Shape.grid(0, 0, 5, 4, 10);
            expect(g.length).toBe(20);
            expect(g[0].col).toBe(0); expect(g[0].row).toBe(0);
        });
        it('poissonDisk returns points with minimum spacing', () => {
            // Inline Mulberry32 for the test
            let state = 42;
            const rng = {
                next() {
                    let t = state += 0x6D2B79F5;
                    t = Math.imul(t ^ (t >>> 15), t | 1);
                    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                },
                range(a, b) { return a + this.next() * (b - a); },
            };
            const pts = Shape.poissonDisk(200, 200, 20, rng);
            expect(pts.length).toBeGreaterThan(5);
            for (let i = 0; i < Math.min(pts.length, 20); i++) {
                for (let j = i + 1; j < Math.min(pts.length, 20); j++) {
                    const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
                    expect(Math.sqrt(dx*dx+dy*dy)).toBeGreaterThanOrEqual(19.9);
                }
            }
        });
    });

    describe('GenEngine', () => {
        let canvas;
        beforeAll(() => {
            // Mock canvas context for jsdom
            HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
                setTransform: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
                clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
                lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
                fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '',
            }));
            canvas = document.createElement('canvas');
            canvas.width = 100; canvas.height = 100;
        });

        it('creates with defaults', () => {
            const g = new GenEngine(canvas, { seed: 42 });
            expect(g.width).toBeGreaterThan(0); g.destroy();
        });
        it('draw + render calls the draw function', () => {
            const fn = vi.fn();
            const g = new GenEngine(canvas, { seed: 42 });
            g.draw(fn); g.render();
            expect(fn).toHaveBeenCalledWith(expect.objectContaining({ art: expect.any(Object), rng: expect.any(Object) }));
            g.destroy();
        });
        it('seed resets RNG and noise', () => {
            const g = new GenEngine(canvas, { seed: 1 });
            g.seed(999);
            expect(g.rng._s).toBe(999); g.destroy();
        });
        it('destroy is idempotent', () => {
            const g = new GenEngine(canvas); g.destroy();
            expect(() => g.destroy()).not.toThrow();
        });
        it('render is no-op after destroy', () => {
            const fn = vi.fn();
            const g = new GenEngine(canvas); g.draw(fn); g.destroy(); g.render();
            expect(fn).not.toHaveBeenCalled();
        });
    });
});
