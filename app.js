// ── Clawd pixel art SVG ──────────────────────────────
// 17×14 grid, scale 3px/pixel (viewBox 51×42)
// 15px body with 1px side ears, thick > < eyes, 4 legs
const CLAWD_P = 3;
const CLAWD_BODY_COLOR = '#D77757';
const CLAWD_EYE_COLOR = '#2D2016';
const CLAWD_RATIO = 14 / 17;
const BG_CREAM = '#FAF9F5';

// static pixel arrays — computed once
const CLAWD_BODY = [
    ...[0, 1, 2, 6, 7, 8, 9, 10].flatMap((r) =>
        Array.from({ length: 15 }, (_, c) => [c + 1, r]),
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
    ...[11, 12, 13].flatMap((r) => [
        [1, r],
        [2, r],
        [4, r],
        [5, r],
        [11, r],
        [12, r],
        [14, r],
        [15, r],
    ]),
];

const CLAWD_EYES = [
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

// pre-render the SVG rect strings (never changes)
const CLAWD_BODY_RECTS = CLAWD_BODY.map(
    ([c, r]) =>
        `<rect x="${c * CLAWD_P}" y="${r * CLAWD_P}" width="${CLAWD_P}" height="${CLAWD_P}"/>`,
).join('');
const CLAWD_EYE_RECTS = CLAWD_EYES.map(
    ([c, r]) =>
        `<rect x="${c * CLAWD_P}" y="${r * CLAWD_P}" width="${CLAWD_P}" height="${CLAWD_P}" fill="${CLAWD_EYE_COLOR}"/>`,
).join('');

// generates SVG at a given width, height derived from ratio
const _svgCache = {};
function clawdSVG(size) {
    if (_svgCache[size]) return _svgCache[size];
    const h = Math.round(size * CLAWD_RATIO);
    const vw = 17 * CLAWD_P;
    const vh = 14 * CLAWD_P;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${size}" height="${h}" style="image-rendering:pixelated" aria-label="Clawd" role="img"><g fill="${CLAWD_BODY_COLOR}">${CLAWD_BODY_RECTS}</g>${CLAWD_EYE_RECTS}</svg>`;
    _svgCache[size] = svg;
    return svg;
}

// ── Starter content ──────────────────────────────────
const STARTER = `# Getting Started

Welcome to **Clawdown** — write markdown on the left, get a styled PDF on the right.

## What you can do

- Toggle decorative Clawds along the page borders
- Click **Download PDF** whenever you're ready
- Everything renders client-side, no data leaves your browser

## Code blocks

\`\`\`js
const greet = (name) => \`Hello, \${name}!\`
console.log(greet('world'))
\`\`\`

## Tables

| Shortcut     | Action          |
|--------------|-----------------|
| Markdown     | Live preview    |
| Code blocks  | Syntax colored  |
| Tables       | Auto-formatted  |
| Blockquotes  | Accent-styled   |

## Formatting

Write _italic_, **bold**, ~~strikethrough~~, and \`inline code\`.

> Blockquotes render with a warm accent bar on the left.

---

Start editing above to make this document yours.
`;

// ── Helpers ───────────────────────────────────────────
function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// removes all elements matching a selector within a container
function clearElements(container, selector) {
    container.querySelectorAll(selector).forEach((el) => el.remove());
}

// ── Page geometry ────────────────────────────────────
const PX_PER_MM = 96 / 25.4;
const PAGE_H = 279.4 * PX_PER_MM;
const GAP = 28;
const PAGE_UNIT = PAGE_H + GAP;
const CLAWD_SIZE = 39;
const PAGE_PAD_BOTTOM = 6;
const PAGE_PAD_TOP = 58;

function getPageCount(scrollHeight) {
    return Math.max(1, Math.ceil(scrollHeight / PAGE_UNIT));
}

// ── Decorative Clawds along page borders ─────────────
// 3 per page, cycles every 3 pages
const CLAWD_SPOTS = [
    { edge: 'right', along: 0.15, rot: 275 },
    { edge: 'left', along: 0.45, rot: 95 },
    { edge: 'right', along: 0.78, rot: 260 },
    { edge: 'left', along: 0.22, rot: 80 },
    { edge: 'right', along: 0.55, rot: 285 },
    { edge: 'left', along: 0.82, rot: 105 },
    { edge: 'right', along: 0.32, rot: 270 },
    { edge: 'left', along: 0.62, rot: 90 },
    { edge: 'right', along: 0.88, rot: 255 },
];

// cached clawd SVG for border decorations
const CLAWD_BORDER_SVG = clawdSVG(CLAWD_SIZE);

// renders a rotated clawd to PNG data URL for PDF stamping
const _rotatedClawdCache = {};
function renderRotatedClawd(deg) {
    if (_rotatedClawdCache[deg]) return Promise.resolve(_rotatedClawdCache[deg]);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const w = CLAWD_SIZE;
            const h = Math.round(CLAWD_SIZE * CLAWD_RATIO);
            const diag = Math.ceil(Math.sqrt(w * w + h * h));
            const scale = 4;
            const canvas = document.createElement('canvas');
            canvas.width = diag * scale;
            canvas.height = diag * scale;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.scale(scale, scale);
            ctx.translate(diag / 2, diag / 2);
            ctx.rotate((deg * Math.PI) / 180);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            _rotatedClawdCache[deg] = canvas.toDataURL('image/png');
            resolve(_rotatedClawdCache[deg]);
        };
        img.src = 'data:image/svg+xml,' + encodeURIComponent(clawdSVG(CLAWD_SIZE));
    });
}

function placeClawds(previewContent) {
    clearElements(previewContent, '.page-clawd');
    const pages = getPageCount(previewContent.scrollHeight);

    for (let pg = 0; pg < pages; pg++) {
        const pageTop = pg * PAGE_UNIT;
        for (let j = 0; j < 3; j++) {
            const spot = CLAWD_SPOTS[(pg * 3 + j) % CLAWD_SPOTS.length];
            const el = document.createElement('div');
            el.className = 'page-clawd';
            el.innerHTML = CLAWD_BORDER_SVG;
            el.style.top = `${pageTop + spot.along * PAGE_H}px`;
            el.style.transform = `rotate(${spot.rot}deg)`;
            // peeking from page edge, clipped by overflow:hidden
            el.style[spot.edge === 'left' ? 'left' : 'right'] =
                `${-CLAWD_SIZE / 2 + 4}px`;
            previewContent.appendChild(el);
        }
    }
}

// ── Page spacers — push content past page break zones ─
function insertPageSpacers(previewContent, mdOutput) {
    clearElements(mdOutput, '.page-spacer');
    const containerTop = previewContent.getBoundingClientRect().top;

    for (const child of [...mdOutput.children]) {
        if (
            child.classList.contains('page-spacer') ||
            child.classList.contains('top-clawd') ||
            child.classList.contains('doc-header')
        )
            continue;

        const rect = child.getBoundingClientRect();
        const top = rect.top - containerTop;
        const bottom = top + rect.height;

        const page = Math.floor(top / PAGE_UNIT);
        const pageEnd = (page + 1) * PAGE_H + page * GAP;
        const safeEnd = pageEnd - PAGE_PAD_BOTTOM;
        const nextPageStart = pageEnd + GAP;

        if (bottom > safeEnd && top < safeEnd && rect.height < PAGE_H * 0.8) {
            const spacerH = nextPageStart + PAGE_PAD_TOP - top;
            if (spacerH > 0 && spacerH < PAGE_H) {
                const spacer = document.createElement('div');
                spacer.className = 'page-spacer';
                spacer.style.height = `${spacerH}px`;
                child.before(spacer);
            }
        }
    }
}

// ── Page decorations — separators and page numbers ────
function placePageDecorations(previewContent) {
    clearElements(previewContent, '.page-sep, .page-num');
    const pages = getPageCount(previewContent.scrollHeight);

    for (let pg = 0; pg < pages; pg++) {
        const pageBottom = pg * PAGE_UNIT + PAGE_H;

        // only show page numbers when there are multiple pages
        if (pages > 1) {
            const numEl = document.createElement('div');
            numEl.className = 'page-num';
            numEl.textContent = `${pg + 1}`;
            numEl.style.top = `${pageBottom - 40}px`;
            previewContent.appendChild(numEl);
        }

        // curved separator between pages
        if (pg < pages - 1) {
            const sep = document.createElement('div');
            sep.className = 'page-sep';
            sep.style.top = `${pageBottom - 12}px`;
            previewContent.appendChild(sep);
        }
    }
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // inject toolbar Clawd
    document.getElementById('clawd-toolbar').innerHTML = clawdSVG(32);
    document.getElementById('clawd-btn-icon').innerHTML = clawdSVG(22);
    document.getElementById('fab-clawd').innerHTML = clawdSVG(22);

    const editor = document.getElementById('editor');
    const mdOutput = document.getElementById('md-output');
    const clawdToggle = document.getElementById('clawd-toggle');
    const previewContent = document.getElementById('preview-content');
    const downloadBtn = document.getElementById('download-btn');

    // favicon from clawd SVG
    const favLink = document.createElement('link');
    favLink.rel = 'icon';
    favLink.href = 'data:image/svg+xml,' + encodeURIComponent(clawdSVG(32));
    document.head.appendChild(favLink);

    // cached header clawd SVG
    const headerClawdSVG = clawdSVG(88);

    // full preview pipeline
    function updatePreview() {
        mdOutput.innerHTML = marked.parse(editor.value);
        mdOutput
            .querySelectorAll('pre code')
            .forEach((el) => hljs.highlightElement(el));

        // build doc-header: clawd beside h1 + optional subtitle
        const h1 = mdOutput.querySelector('h1');
        const header = document.createElement('div');
        header.className = 'doc-header';

        const clawd = document.createElement('div');
        clawd.className = 'top-clawd';
        clawd.innerHTML = headerClawdSVG;
        header.appendChild(clawd);

        const headerText = document.createElement('div');
        headerText.className = 'header-text';

        if (h1) {
            const nextEl = h1.nextElementSibling;
            const subtitle =
                nextEl && nextEl.tagName === 'P' && nextEl.textContent.length < 144
                    ? nextEl
                    : null;
            headerText.appendChild(h1);
            if (subtitle) headerText.appendChild(subtitle);
        }

        header.appendChild(headerText);
        mdOutput.prepend(header);

        insertPageSpacers(previewContent, mdOutput);
        placePageDecorations(previewContent);
        placeClawds(previewContent);
    }

    // seed editor
    editor.value = STARTER;
    updatePreview();

    // clawd toggle — shows/hides decorative page clawds
    let clawdOn = true;
    clawdToggle.addEventListener('click', () => {
        clawdOn = !clawdOn;
        previewContent.classList.toggle('clawds-hidden', !clawdOn);
        clawdToggle.classList.toggle('active', clawdOn);
        clawdToggle.setAttribute('aria-pressed', String(clawdOn));
    });

    // live render
    editor.addEventListener('input', debounce(updatePreview, 150));

    // ── PDF download ─────────────────────────────────
    downloadBtn.addEventListener('click', async () => {
        const original = downloadBtn.textContent;
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Generating...';

        const h1 = mdOutput.querySelector('h1');
        const filename = h1
            ? h1.textContent
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '') + '.pdf'
            : 'document.pdf';

        // hide spacers via class toggle — let html2pdf handle page breaks
        mdOutput.classList.add('pdf-export');
        if (!clawdOn) mdOutput.classList.add('pdf-no-clawds');

        const restore = () => {
            mdOutput.classList.remove('pdf-export', 'pdf-no-clawds');
            downloadBtn.disabled = false;
            downloadBtn.textContent = original;
        };

        // pre-render rotated clawd images if toggle is on
        if (clawdOn) {
            const rots = [...new Set(CLAWD_SPOTS.map((s) => s.rot))];
            await Promise.all(rots.map((d) => renderRotatedClawd(d)));
        }

        // capture content, then stamp clawds onto each PDF page
        html2pdf()
            .set({
                margin: [13, 13, 13, 13],
                filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: BG_CREAM,
                    scrollY: 0,
                    scrollX: 0,
                },
                jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
            })
            .from(mdOutput)
            .toPdf()
            .get('pdf')
            .then((pdf) => {
                if (!clawdOn) return;
                const totalPages = pdf.internal.getNumberOfPages();
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();

                // clawd bounding box in mm
                const pxToMm = 25.4 / 96;
                const clawdW = CLAWD_SIZE * pxToMm;
                const clawdH = clawdW * CLAWD_RATIO;
                const diag = Math.sqrt(clawdW * clawdW + clawdH * clawdH);

                for (let pg = 0; pg < totalPages; pg++) {
                    pdf.setPage(pg + 1);
                    for (let j = 0; j < 3; j++) {
                        const spot = CLAWD_SPOTS[(pg * 3 + j) % CLAWD_SPOTS.length];
                        const y = spot.along * pageH - diag / 2;
                        // peek from page edge, matching preview proportion
                        const x =
                            spot.edge === 'left' ? -diag * 0.4 : pageW - diag * 0.6;
                        pdf.addImage(
                            _rotatedClawdCache[spot.rot],
                            'PNG',
                            x,
                            y,
                            diag,
                            diag,
                        );
                    }
                }
            })
            .save()
            .then(restore)
            .catch((err) => {
                console.error('PDF generation failed:', err);
                restore();
            });
    });
});
