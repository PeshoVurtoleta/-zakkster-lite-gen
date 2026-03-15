import type Random from '@zakkster/lite-random';
import type { OklchColor } from '@zakkster/lite-color';

export declare class SimplexNoise {
    constructor(seedOrRng?: number | Random);
    noise2D(x: number, y: number): number;
    noise3D(x: number, y: number, z: number): number;
    fbm(x: number, y: number, octaves?: number, lacunarity?: number, persistence?: number): number;
}

export declare class FlowField {
    constructor(options: { noise: SimplexNoise; scale?: number; strength?: number; zSpeed?: number });
    sample(x: number, y: number): { vx: number; vy: number };
    update(dt: number): void;
    applyTo(particle: { x: number; y: number; vx: number; vy: number }, dt: number): void;
}

export declare const Shape: {
    polygon(cx: number, cy: number, radius: number, sides: number, rotation?: number): Array<{ x: number; y: number }>;
    star(cx: number, cy: number, outerRadius: number, innerRadius: number, points: number, rotation?: number): Array<{ x: number; y: number }>;
    spiral(cx: number, cy: number, maxRadius: number, turns: number, pointCount: number): Array<{ x: number; y: number }>;
    wave(x: number, y: number, width: number, amplitude: number, frequency: number, pointCount: number): Array<{ x: number; y: number }>;
    lissajous(cx: number, cy: number, a: number, b: number, radiusX: number, radiusY: number, pointCount: number, delta?: number): Array<{ x: number; y: number }>;
    grid(x: number, y: number, cols: number, rows: number, spacing: number): Array<{ x: number; y: number; col: number; row: number }>;
    poissonDisk(width: number, height: number, minDist: number, rng: Random, maxAttempts?: number): Array<{ x: number; y: number }>;
};

export declare class ArtCanvas {
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    width: number; height: number; dpr: number;
    constructor(canvas: HTMLCanvasElement, options?: { width?: number; height?: number; dpr?: boolean });
    resize(width: number, height: number): void;
    background(color: OklchColor): void;
    clear(): void;
    dot(x: number, y: number, radius: number, color: OklchColor | string): void;
    line(x1: number, y1: number, x2: number, y2: number, color: OklchColor | string, lineWidth?: number): void;
    path(points: Array<{ x: number; y: number }>, color: OklchColor | string, options?: { lineWidth?: number; close?: boolean; fill?: boolean }): void;
    toDataURL(): string;
    save(filename?: string): void;
}

export interface DrawContext { art: ArtCanvas; ctx: CanvasRenderingContext2D; rng: Random; noise: SimplexNoise; width: number; height: number; time: number; dt: number; }

export declare class GenEngine {
    readonly art: ArtCanvas;
    readonly rng: Random;
    readonly noise: SimplexNoise;
    width: number; height: number;
    constructor(canvas: HTMLCanvasElement, options?: { width?: number; height?: number; seed?: number; animate?: boolean });
    draw(fn: (ctx: DrawContext) => void): this;
    render(): void;
    start(): void; stop(): void;
    seed(newSeed: number): void;
    resize(width: number, height: number): void;
    clear(): void;
    save(filename?: string): void;
    destroy(): void;
}

export declare const Pattern: {
    noiseDots(art: ArtCanvas, options: { noise: SimplexNoise; spacing?: number; minRadius?: number; maxRadius?: number; colorFn?: (n: number) => OklchColor; noiseScale?: number }): void;
    flowLines(art: ArtCanvas, options: { field: FlowField; spacing?: number; lineLength?: number; color?: OklchColor | string; lineWidth?: number }): void;
    flowTrace(art: ArtCanvas, options: { field: FlowField; rng: Random; particleCount?: number; steps?: number; stepSize?: number; colorFn?: (index: number, t: number) => OklchColor; lineWidth?: number; alpha?: number }): void;
};
