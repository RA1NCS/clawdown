// stamps cream background, border clawds, and page numbers onto a raw PDF
// creates a new PDF: cream rect → embedded original page → clawds → page numbers
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getRotatedClawd } from './clawd';

// same CLAWD_SPOTS array as app.js — 3 clawds per page, cycles every 3 pages
const CLAWD_SPOTS = [
    { edge: 'right' as const, along: 0.15, rot: 275 },
    { edge: 'left' as const, along: 0.45, rot: 95 },
    { edge: 'right' as const, along: 0.78, rot: 260 },
    { edge: 'left' as const, along: 0.22, rot: 80 },
    { edge: 'right' as const, along: 0.55, rot: 285 },
    { edge: 'left' as const, along: 0.82, rot: 105 },
    { edge: 'right' as const, along: 0.32, rot: 270 },
    { edge: 'left' as const, along: 0.62, rot: 90 },
    { edge: 'right' as const, along: 0.88, rot: 255 },
];

// unit conversions
const MM_TO_PT = 72 / 25.4;
const PX_TO_MM = 25.4 / 96;

// clawd dimensions in mm (from app.js, scaled 20% smaller for API output)
const CLAWD_SIZE = 39; // px
const CLAWD_RATIO = 14 / 17;
const BORDER_SCALE = 0.8;
const CLAWD_W_MM = CLAWD_SIZE * PX_TO_MM * BORDER_SCALE;
const CLAWD_H_MM = CLAWD_W_MM * CLAWD_RATIO;
const DIAG_MM = Math.sqrt(CLAWD_W_MM * CLAWD_W_MM + CLAWD_H_MM * CLAWD_H_MM);
const DIAG_PT = DIAG_MM * MM_TO_PT;

// #FAF9F5 as 0-1 RGB
const CREAM = rgb(0xfa / 255, 0xf9 / 255, 0xf5 / 255);

// load Lora font once
const loraBytes = readFileSync(
    join(import.meta.dir, '..', 'assets', 'Lora-Regular.ttf'),
);

// #6b6560 as 0-1 RGB
const PAGE_NUM_COLOR = rgb(0x6b / 255, 0x65 / 255, 0x60 / 255);

export async function stampPdf(
    rawPdf: ArrayBuffer,
    clawds: boolean,
): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(rawPdf);
    const srcPages = srcDoc.getPages();
    const totalPages = srcPages.length;

    // create a new PDF — each page gets cream bg → original content → decorations
    const doc = await PDFDocument.create();

    // embed all source pages at once
    const embeddedPages = await doc.embedPages(srcPages);

    // embed rotated clawd PNGs if needed
    let embeddedClawds: Map<
        number,
        Awaited<ReturnType<typeof doc.embedPng>>
    > | null = null;
    if (clawds) {
        embeddedClawds = new Map();
        const uniqueRots = [...new Set(CLAWD_SPOTS.map((s) => s.rot))];
        for (const rot of uniqueRots) {
            const png = getRotatedClawd(rot);
            embeddedClawds.set(rot, await doc.embedPng(png));
        }
    }

    // embed Lora font for page numbers
    let loraFont: Awaited<ReturnType<typeof doc.embedFont>> | null = null;
    if (totalPages > 1) {
        doc.registerFontkit(fontkit);
        loraFont = await doc.embedFont(loraBytes, { subset: true });
    }

    for (let pg = 0; pg < totalPages; pg++) {
        const embedded = embeddedPages[pg]!;
        const { width, height } = embedded.size();

        // new page with cream background covering full sheet (including margin areas)
        const page = doc.addPage([width, height]);
        page.drawRectangle({ x: 0, y: 0, width, height, color: CREAM });

        // draw original page content on top (margin areas are transparent, cream shows through)
        page.drawPage(embedded);

        // border clawds
        if (clawds && embeddedClawds) {
            const pageWMm = width / MM_TO_PT;
            const pageHMm = height / MM_TO_PT;

            for (let j = 0; j < 3; j++) {
                const spot = CLAWD_SPOTS[(pg * 3 + j) % CLAWD_SPOTS.length]!;
                const img = embeddedClawds.get(spot.rot)!;

                // jsPDF coords (mm, top-left origin) → pdf-lib (points, bottom-left origin)
                const yJspdf = spot.along * pageHMm - DIAG_MM / 2;
                const xJspdf =
                    spot.edge === 'left' ? -DIAG_MM * 0.4 : pageWMm - DIAG_MM * 0.6;
                const x = xJspdf * MM_TO_PT;
                const y = height - (yJspdf + DIAG_MM) * MM_TO_PT;

                page.drawImage(img, { x, y, width: DIAG_PT, height: DIAG_PT });
            }
        }

        // page numbers — only for multi-page docs
        if (totalPages > 1 && loraFont) {
            const text = `${pg + 1}`;
            const fontSize = 9;
            const textWidth = loraFont.widthOfTextAtSize(text, fontSize);
            const x = width - 36 * PX_TO_MM * MM_TO_PT - textWidth;
            const y = 40 * PX_TO_MM * MM_TO_PT;

            page.drawText(text, {
                x,
                y,
                size: fontSize,
                font: loraFont,
                color: PAGE_NUM_COLOR,
                opacity: 0.5,
            });
        }
    }

    return doc.save();
}
