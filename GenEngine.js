/**
 * @zakkster/lite-gen — A Generative Art Toolkit
 *
 * Deterministic, color-correct, small. Built for real-time generative art.
 *
 * Composes:
 *   @zakkster/lite-random     (seeded RNG)
 *   @zakkster/lite-color      (OKLCH gradients)
 *   @zakkster/lite-lerp       (math primitives)
 *
 * Modules:
 *   SimplexNoise  — Seeded 2D/3D simplex noise + FBM
 *   FlowField     — Noise-driven vector field
 *   Shape         — Procedural generators (polygon, star, spiral, poissonDisk, etc.)
 *   ArtCanvas     — DPR-aware canvas with OKLCH drawing helpers + PNG export
 *   GenEngine     — Unified engine with draw loop, seed management, resize
 *   Pattern       — Pre-built generative art patterns
 */

import Random from '@zakkster/lite-random';
import { createGradient, toCssOklch } from '@zakkster/lite-color';
import { lerp, clamp, mapRange } from '@zakkster/lite-lerp';


// ═══════════════════════════════════════════════════════════
//  SIMPLEX NOISE (2D & 3D)
// ═══════════════════════════════════════════════════════════

export class SimplexNoise {
    constructor(seedOrRng) {
        const rng = seedOrRng instanceof Random
            ? seedOrRng
            : new Random(seedOrRng ?? 42);

        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rng.next() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }

        this._perm = new Uint8Array(512);
        this._permMod12 = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            this._perm[i] = p[i & 255];
            this._permMod12[i] = this._perm[i] % 12;
        }
    }

    static _GRAD2 = [
        [1, 1], [-1, 1], [1, -1], [-1, -1],
        [1, 0], [-1, 0], [0, 1], [0, -1],
    ];

    static _GRAD3 = [
        [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
        [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
        [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
    ];

    noise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const G2 = (3 - Math.sqrt(3)) / 6;
        const perm = this._perm;
        const pm12 = this._permMod12;
        const grad2 = SimplexNoise._GRAD2;

        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;
        const x0 = x - (i - t);
        const y0 = y - (j - t);
        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = i & 255;
        const jj = j & 255;
        let n0 = 0, n1 = 0, n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) { t0 *= t0; const gi = pm12[ii + perm[jj]] % 8; n0 = t0 * t0 * (grad2[gi][0] * x0 + grad2[gi][1] * y0); }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) { t1 *= t1; const gi = pm12[ii + i1 + perm[jj + j1]] % 8; n1 = t1 * t1 * (grad2[gi][0] * x1 + grad2[gi][1] * y1); }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) { t2 *= t2; const gi = pm12[ii + 1 + perm[jj + 1]] % 8; n2 = t2 * t2 * (grad2[gi][0] * x2 + grad2[gi][1] * y2); }

        return 70 * (n0 + n1 + n2);
    }

    noise3D(x, y, z) {
        const F3 = 1 / 3;
        const G3 = 1 / 6;
        const perm = this._perm;
        const pm12 = this._permMod12;
        const grad3 = SimplexNoise._GRAD3;

        const s = (x + y + z) * F3;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        const t = (i + j + k) * G3;
        const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);

        let i1, j1, k1, i2, j2, k2;
        if (x0 >= y0) {
            if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
            else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
            else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
        } else {
            if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
            else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
            else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
        }

        const x1 = x0-i1+G3, y1 = y0-j1+G3, z1 = z0-k1+G3;
        const x2 = x0-i2+2*G3, y2 = y0-j2+2*G3, z2 = z0-k2+2*G3;
        const x3 = x0-1+3*G3, y3 = y0-1+3*G3, z3 = z0-1+3*G3;
        const ii = i & 255, jj = j & 255, kk = k & 255;
        let n0=0, n1=0, n2=0, n3=0;
        const dot3 = (g, a, b, c) => g[0]*a + g[1]*b + g[2]*c;

        let t0 = 0.6-x0*x0-y0*y0-z0*z0;
        if (t0>=0) { t0*=t0; n0=t0*t0*dot3(grad3[pm12[ii+perm[jj+perm[kk]]]],x0,y0,z0); }
        let t1 = 0.6-x1*x1-y1*y1-z1*z1;
        if (t1>=0) { t1*=t1; n1=t1*t1*dot3(grad3[pm12[ii+i1+perm[jj+j1+perm[kk+k1]]]],x1,y1,z1); }
        let t2 = 0.6-x2*x2-y2*y2-z2*z2;
        if (t2>=0) { t2*=t2; n2=t2*t2*dot3(grad3[pm12[ii+i2+perm[jj+j2+perm[kk+k2]]]],x2,y2,z2); }
        let t3 = 0.6-x3*x3-y3*y3-z3*z3;
        if (t3>=0) { t3*=t3; n3=t3*t3*dot3(grad3[pm12[ii+1+perm[jj+1+perm[kk+1]]]],x3,y3,z3); }

        return 32 * (n0 + n1 + n2 + n3);
    }

    fbm(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
        let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;
        for (let i = 0; i < octaves; i++) {
            value += this.noise2D(x * frequency, y * frequency) * amplitude;
            maxAmp += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return value / maxAmp;
    }
}


// ═══════════════════════════════════════════════════════════
//  FLOW FIELD
// ═══════════════════════════════════════════════════════════

export class FlowField {
    constructor({ noise, scale = 0.005, strength = 2, zSpeed = 0.3 }) {
        this.noise = noise;
        this.scale = scale;
        this.strength = strength;
        this.zSpeed = zSpeed;
        this._time = 0;
    }

    sample(x, y) {
        const angle = this.noise.noise3D(x * this.scale, y * this.scale, this._time) * Math.PI * 2;
        return { vx: Math.cos(angle) * this.strength, vy: Math.sin(angle) * this.strength };
    }

    update(dt) { this._time += dt * this.zSpeed; }

    /** Apply field force to a lite-particles particle (mutates in place). */
    applyTo(particle, dt) {
        const { vx, vy } = this.sample(particle.x, particle.y);
        particle.vx += vx * dt;
        particle.vy += vy * dt;
    }
}


// ═══════════════════════════════════════════════════════════
//  PROCEDURAL SHAPES
// ═══════════════════════════════════════════════════════════

export const Shape = {
    polygon(cx, cy, radius, sides, rotation = 0) {
        const points = [];
        const step = (Math.PI * 2) / sides;
        for (let i = 0; i < sides; i++) {
            const a = i * step + rotation;
            points.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
        }
        return points;
    },

    star(cx, cy, outerRadius, innerRadius, points, rotation = 0) {
        const result = [];
        const step = Math.PI / points;
        for (let i = 0; i < points * 2; i++) {
            const a = i * step + rotation;
            const r = i % 2 === 0 ? outerRadius : innerRadius;
            result.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        return result;
    },

    spiral(cx, cy, maxRadius, turns, pointCount) {
        const points = [];
        for (let i = 0; i < pointCount; i++) {
            const t = i / (pointCount - 1);
            const a = t * turns * Math.PI * 2;
            const r = t * maxRadius;
            points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        return points;
    },

    wave(x, y, width, amplitude, frequency, pointCount) {
        const points = [];
        for (let i = 0; i < pointCount; i++) {
            const t = i / (pointCount - 1);
            points.push({ x: x + t * width, y: y + Math.sin(t * frequency * Math.PI * 2) * amplitude });
        }
        return points;
    },

    lissajous(cx, cy, a, b, radiusX, radiusY, pointCount, delta = Math.PI / 2) {
        const points = [];
        for (let i = 0; i < pointCount; i++) {
            const t = (i / pointCount) * Math.PI * 2;
            points.push({ x: cx + Math.sin(a * t + delta) * radiusX, y: cy + Math.sin(b * t) * radiusY });
        }
        return points;
    },

    grid(x, y, cols, rows, spacing) {
        const points = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                points.push({ x: x + col * spacing, y: y + row * spacing, col, row });
            }
        }
        return points;
    },

    poissonDisk(width, height, minDist, rng, maxAttempts = 30) {
        const cellSize = minDist / Math.SQRT2;
        const gridW = Math.ceil(width / cellSize);
        const gridH = Math.ceil(height / cellSize);
        const grid = new Array(gridW * gridH).fill(-1);
        const points = [];
        const active = [];

        const sx = rng.range(0, width), sy = rng.range(0, height);
        points.push({ x: sx, y: sy });
        grid[Math.floor(sy / cellSize) * gridW + Math.floor(sx / cellSize)] = 0;
        active.push(0);

        while (active.length > 0) {
            const ri = Math.floor(rng.next() * active.length);
            const parent = points[active[ri]];
            let found = false;

            for (let att = 0; att < maxAttempts; att++) {
                const angle = rng.next() * Math.PI * 2;
                const dist = minDist + rng.next() * minDist;
                const nx = parent.x + Math.cos(angle) * dist;
                const ny = parent.y + Math.sin(angle) * dist;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                const gx = Math.floor(nx / cellSize), gy = Math.floor(ny / cellSize);
                let tooClose = false;
                for (let dy = -2; dy <= 2 && !tooClose; dy++) {
                    for (let dx = -2; dx <= 2 && !tooClose; dx++) {
                        const cx2 = gx + dx, cy2 = gy + dy;
                        if (cx2 < 0 || cx2 >= gridW || cy2 < 0 || cy2 >= gridH) continue;
                        const idx = grid[cy2 * gridW + cx2];
                        if (idx === -1) continue;
                        const ddx = points[idx].x - nx, ddy = points[idx].y - ny;
                        if (ddx * ddx + ddy * ddy < minDist * minDist) tooClose = true;
                    }
                }

                if (!tooClose) {
                    const ni = points.length;
                    points.push({ x: nx, y: ny });
                    grid[gy * gridW + gx] = ni;
                    active.push(ni);
                    found = true;
                    break;
                }
            }

            if (!found) active.splice(ri, 1);
        }

        return points;
    },
};


// ═══════════════════════════════════════════════════════════
//  ART CANVAS — DPR-aware drawing surface with helpers
// ═══════════════════════════════════════════════════════════

export class ArtCanvas {
    constructor(canvas, { width, height, dpr = true } = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        const w = width || canvas.clientWidth || 800;
        const h = height || canvas.clientHeight || 600;
        this.dpr = dpr ? (window.devicePixelRatio || 1) : 1;
        this.width = w;
        this.height = h;
        this._applySize();
    }

    /** @private */
    _applySize() {
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(this.dpr, this.dpr);
    }

    /** Resize the canvas. Clears content. */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this._applySize();
    }

    background(oklchColor) {
        this.ctx.fillStyle = toCssOklch(oklchColor);
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    clear() { this.ctx.clearRect(0, 0, this.width, this.height); }

    dot(x, y, radius, color) {
        this.ctx.fillStyle = typeof color === 'string' ? color : toCssOklch(color);
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    line(x1, y1, x2, y2, color, lineWidth = 1) {
        this.ctx.strokeStyle = typeof color === 'string' ? color : toCssOklch(color);
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    path(points, color, { lineWidth = 1, close = false, fill = false } = {}) {
        if (points.length < 2) return;
        const css = typeof color === 'string' ? color : toCssOklch(color);
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
        if (close) this.ctx.closePath();
        if (fill) { this.ctx.fillStyle = css; this.ctx.fill(); }
        else { this.ctx.strokeStyle = css; this.ctx.lineWidth = lineWidth; this.ctx.stroke(); }
    }

    toDataURL() { return this.canvas.toDataURL('image/png'); }

    save(filename = 'artwork.png') {
        const a = document.createElement('a');
        a.href = this.toDataURL();
        a.download = filename;
        a.click();
    }
}


// ═══════════════════════════════════════════════════════════
//  GEN ENGINE — Unified generative art engine
// ═══════════════════════════════════════════════════════════

export class GenEngine {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} [options]
     * @param {number} [options.width]
     * @param {number} [options.height]
     * @param {number} [options.seed=42]
     * @param {boolean} [options.animate=false]  If true, runs a draw loop
     */
    constructor(canvas, { width, height, seed = 42, animate = false } = {}) {
        this.art = new ArtCanvas(canvas, { width, height });
        this.rng = new Random(seed);
        this.noise = new SimplexNoise(new Random(seed));

        this.width = this.art.width;
        this.height = this.art.height;

        this._seed = seed;
        this._animate = animate;
        this._drawFn = null;
        this._rafId = null;
        this._lastTime = 0;
        this._time = 0;
        this._destroyed = false;
    }

    /** Register the draw callback. Called once (static) or per-frame (animated). */
    draw(fn) {
        this._drawFn = fn;
        return this;
    }

    /** Execute the draw function once (for static art). */
    render() {
        if (this._destroyed || !this._drawFn) return;
        this._drawFn({
            art: this.art, ctx: this.art.ctx, rng: this.rng, noise: this.noise,
            width: this.width, height: this.height, time: 0, dt: 0,
        });
    }

    /** Start the animation loop. */
    start() {
        if (this._destroyed || this._rafId) return;
        this._lastTime = performance.now();
        const loop = (now) => {
            if (this._destroyed) return;
            let dt = (now - this._lastTime) / 1000;
            this._lastTime = now;
            if (dt > 0.1) dt = 0.016;
            this._time += dt;

            this._drawFn?.({
                art: this.art, ctx: this.art.ctx, rng: this.rng, noise: this.noise,
                width: this.width, height: this.height, time: this._time, dt,
            });

            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    /** Stop the animation loop. */
    stop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    /** Re-seed and re-render. Creates fresh noise from the new seed. */
    seed(newSeed) {
        this._seed = newSeed;
        this.rng.reset(newSeed);
        this.noise = new SimplexNoise(new Random(newSeed));
    }

    /** Resize the canvas. */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.art.resize(width, height);
    }

    /** Clear the canvas. */
    clear() { this.art.clear(); }

    /** Save as PNG. */
    save(filename) { this.art.save(filename); }

    /** Destroy everything. Idempotent. */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.stop();
        this._drawFn = null;
    }
}


// ═══════════════════════════════════════════════════════════
//  PATTERN HELPERS — Pre-built generative art patterns
// ═══════════════════════════════════════════════════════════

export const Pattern = {
    noiseDots(art, { noise, spacing = 20, minRadius = 1, maxRadius = 8, colorFn, noiseScale = 0.01 }) {
        const cols = Math.ceil(art.width / spacing);
        const rows = Math.ceil(art.height / spacing);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * spacing + spacing / 2;
                const y = row * spacing + spacing / 2;
                const n = (noise.noise2D(x * noiseScale, y * noiseScale) + 1) / 2;
                art.dot(x, y, lerp(minRadius, maxRadius, n), colorFn ? colorFn(n) : { l: n, c: 0.1, h: 200 });
            }
        }
    },

    flowLines(art, { field, spacing = 15, lineLength = 12, color, lineWidth = 1 }) {
        const cols = Math.ceil(art.width / spacing);
        const rows = Math.ceil(art.height / spacing);
        const c = color || { l: 0.5, c: 0.05, h: 0 };
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * spacing + spacing / 2;
                const y = row * spacing + spacing / 2;
                const { vx, vy } = field.sample(x, y);
                const a = Math.atan2(vy, vx);
                art.line(x, y, x + Math.cos(a) * lineLength, y + Math.sin(a) * lineLength, c, lineWidth);
            }
        }
    },

    flowTrace(art, {
        field, rng, particleCount = 500, steps = 200, stepSize = 1,
        colorFn, lineWidth = 0.5, alpha = 0.3,
    }) {
        const ctx = art.ctx;
        ctx.lineWidth = lineWidth;
        for (let p = 0; p < particleCount; p++) {
            let px = rng.range(0, art.width), py = rng.range(0, art.height);
            ctx.beginPath();
            ctx.moveTo(px, py);
            for (let s = 0; s < steps; s++) {
                const { vx, vy } = field.sample(px, py);
                px += vx * stepSize;
                py += vy * stepSize;
                if (px < 0 || px > art.width || py < 0 || py > art.height) break;
                ctx.lineTo(px, py);
            }
            const c = colorFn ? colorFn(p, p / particleCount)
                : { l: 0.6, c: 0.15, h: mapRange(p, 0, particleCount, 0, 360) };
            ctx.strokeStyle = toCssOklch({ ...c, a: alpha });
            ctx.stroke();
        }
    },
};
