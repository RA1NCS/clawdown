// clawd pixel art — generates rotated PNG buffers for PDF border stamps
// 17×14 grid, same pixel arrays as app.js
import sharp from 'sharp';
import { PNG } from 'pngjs';

const CLAWD_BODY_COLOR = [0xd7, 0x77, 0x57] as const;
const CLAWD_EYE_COLOR = [0x2d, 0x20, 0x16] as const;
const W = 17;
const H = 14;

// pixel coordinates — identical to app.js CLAWD_BODY / CLAWD_EYES
const CLAWD_BODY: [number, number][] = [
    ...[0, 1, 2, 6, 7, 8, 9, 10].flatMap((r) =>
        Array.from({ length: 15 }, (_, c) => [c + 1, r] as [number, number]),
    ),
    [0, 3],
    [0, 4],
    [0, 5],
    [0, 6],
    [16, 3],
    [16, 4],
    [16, 5],
    [16, 6],
    [1, 3],
    [2, 3],
    [5, 3],
    [6, 3],
    [7, 3],
    [8, 3],
    [9, 3],
    [10, 3],
    [11, 3],
    [14, 3],
    [15, 3],
    [1, 4],
    [2, 4],
    [3, 4],
    [6, 4],
    [7, 4],
    [8, 4],
    [9, 4],
    [10, 4],
    [13, 4],
    [14, 4],
    [15, 4],
    [1, 5],
    [2, 5],
    [5, 5],
    [6, 5],
    [7, 5],
    [8, 5],
    [9, 5],
    [10, 5],
    [11, 5],
    [14, 5],
    [15, 5],
    ...[11, 12, 13].flatMap(
        (r) =>
            [
                [1, r],
                [2, r],
                [4, r],
                [5, r],
                [11, r],
                [12, r],
                [14, r],
                [15, r],
            ] as [number, number][],
    ),
];

const CLAWD_EYES: [number, number][] = [
    [3, 3],
    [4, 3],
    [4, 4],
    [5, 4],
    [3, 5],
    [4, 5],
    [12, 3],
    [13, 3],
    [11, 4],
    [12, 4],
    [12, 5],
    [13, 5],
];

// builds a 17×14 raw PNG, upscaled 4x for crisp rotation
function buildBasePng(): Buffer {
    const scale = 4;
    const sw = W * scale;
    const sh = H * scale;
    const png = new PNG({ width: sw, height: sh });

    // transparent background
    png.data.fill(0);

    // fill a scaled pixel block
    const fillPixel = (
        x: number,
        y: number,
        [r, g, b]: readonly [number, number, number],
    ) => {
        for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
                const idx = ((y * scale + dy) * sw + (x * scale + dx)) * 4;
                png.data[idx] = r;
                png.data[idx + 1] = g;
                png.data[idx + 2] = b;
                png.data[idx + 3] = 255;
            }
        }
    };

    for (const [x, y] of CLAWD_BODY) fillPixel(x, y, CLAWD_BODY_COLOR);
    for (const [x, y] of CLAWD_EYES) fillPixel(x, y, CLAWD_EYE_COLOR);

    return PNG.sync.write(png);
}

// cache of rotation angle → PNG buffer
const rotatedCache = new Map<number, Buffer>();

// pre-renders all rotations needed for border clawds
export async function initClawdPngs(rotations: number[]): Promise<void> {
    const basePng = buildBasePng();
    await Promise.all(
        rotations.map(async (deg) => {
            if (rotatedCache.has(deg)) return;
            const buf = await sharp(basePng)
                .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();
            rotatedCache.set(deg, buf);
        }),
    );
}

// returns a pre-rendered rotated clawd PNG
export function getRotatedClawd(deg: number): Buffer {
    const buf = rotatedCache.get(deg);
    if (!buf) throw new Error(`clawd rotation ${deg} not initialized`);
    return buf;
}

// clawd SVG string for the doc-header (same as app.js clawdSVG)
export function clawdSVG(size: number): string {
    const P = 3;
    const ratio = 14 / 17;
    const h = Math.round(size * ratio);
    const vw = 17 * P;
    const vh = 14 * P;

    const bodyRects = CLAWD_BODY.map(
        ([c, r]) => `<rect x="${c * P}" y="${r * P}" width="${P}" height="${P}"/>`,
    ).join('');
    const eyeRects = CLAWD_EYES.map(
        ([c, r]) =>
            `<rect x="${c * P}" y="${r * P}" width="${P}" height="${P}" fill="#2D2016"/>`,
    ).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${size}" height="${h}" style="image-rendering:pixelated" aria-label="Clawd" role="img"><g fill="#D77757">${bodyRects}</g>${eyeRects}</svg>`;
}
