// ── CodeMirror imports ───────────────────────────────
import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
    dropCursor,
    rectangularSelection,
    crosshairCursor,
    placeholder,
} from 'https://esm.sh/@codemirror/view@6';
import { Compartment } from 'https://esm.sh/@codemirror/state@6';
import {
    syntaxHighlighting,
    HighlightStyle,
    bracketMatching,
    indentOnInput,
} from 'https://esm.sh/@codemirror/language@6';
import {
    markdown,
    markdownLanguage,
} from 'https://esm.sh/@codemirror/lang-markdown@6';
import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
} from 'https://esm.sh/@codemirror/commands@6';
import {
    searchKeymap,
    highlightSelectionMatches,
} from 'https://esm.sh/@codemirror/search@6';
import {
    closeBrackets,
    closeBracketsKeymap,
} from 'https://esm.sh/@codemirror/autocomplete@6';
import { tags } from 'https://esm.sh/@lezer/highlight@1';

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
const PAPER_PX = 215.9 * PX_PER_MM;
const MIN_SCALE = 0.5;
const MIN_EDITOR_W = 200;
const PREVIEW_PAD = 40;
const MIN_PREVIEW_W = PAPER_PX * MIN_SCALE + PREVIEW_PAD;
const MOBILE_BP = 768;

function isMobile() {
    return window.innerWidth <= MOBILE_BP;
}

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

        // forced page break — fill remaining page space
        if (child.classList.contains('page-break')) {
            child.style.height = `${nextPageStart + PAGE_PAD_TOP - top}px`;
            continue;
        }

        // element straddles page boundary — push to next page
        if (bottom > safeEnd && top < safeEnd && rect.height < PAGE_H * 0.8) {
            const spacerH = nextPageStart + PAGE_PAD_TOP - top;
            if (spacerH > 0 && spacerH < PAGE_H) {
                const spacer = document.createElement('div');
                spacer.className = 'page-spacer';
                spacer.style.height = `${spacerH}px`;
                child.before(spacer);
            }
            continue;
        }

        // heading orphan protection — if a heading sits in the bottom 15%
        // of the page, push it to the next page so it stays with its content
        const isHeading = /^H[1-6]$/.test(child.tagName);
        if (isHeading && top > safeEnd - PAGE_H * 0.15 && top < safeEnd) {
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

    // snap container height to full page multiples so partial pages fill out
    const fullHeight = pages === 1 ? PAGE_H : (pages - 1) * PAGE_UNIT + PAGE_H;
    previewContent.style.minHeight = `${fullHeight}px`;

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

// ── CodeMirror theme — warm cream to match Clawdown ───
const clawdownTheme = EditorView.theme({
    '&': {
        backgroundColor: BG_CREAM,
        color: '#1c1917',
        height: '100%',
    },
    '.cm-content': {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '13px',
        lineHeight: '1.65',
        padding: '20px 24px 25vh',
        caretColor: '#c15f3c',
    },
    '&.cm-focused': {
        outline: 'none',
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#c15f3c',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'rgba(215, 119, 87, 0.15) !important',
    },
    '.cm-activeLine': {
        backgroundColor: 'rgba(0, 0, 0, 0.025)',
    },
    '.cm-selectionMatch': {
        backgroundColor: 'rgba(215, 119, 87, 0.18)',
    },
    '.cm-gutters': {
        backgroundColor: BG_CREAM,
        color: '#c4b8ae',
        border: 'none',
        borderRight: '1px solid rgba(0, 0, 0, 0.06)',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'rgba(0, 0, 0, 0.025)',
        color: '#6b6560',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
    '.cm-placeholder': {
        color: '#6b6560',
    },
    // search panel styling
    '.cm-panels': {
        backgroundColor: '#f2efe9',
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
    },
    '.cm-panels input, .cm-panels button': {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12px',
    },
});

// syntax highlight style — bold/italic render visually in editor
const clawdownHighlight = HighlightStyle.define([
    { tag: tags.heading1, fontWeight: '700', fontSize: '1.3em', color: '#c15f3c' },
    { tag: tags.heading2, fontWeight: '600', fontSize: '1.15em', color: '#c15f3c' },
    { tag: tags.heading3, fontWeight: '600', fontSize: '1.05em', color: '#a64e30' },
    { tag: tags.heading4, fontWeight: '600', color: '#a64e30' },
    { tag: tags.heading5, fontWeight: '600', color: '#a64e30' },
    { tag: tags.heading6, fontWeight: '600', color: '#6b6560' },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: '#6b6560' },
    { tag: tags.link, color: '#c15f3c', textDecoration: 'underline' },
    { tag: tags.url, color: '#5c7a3e' },
    { tag: tags.monospace, backgroundColor: '#f0ede6', borderRadius: '2px' },
    { tag: tags.quote, fontStyle: 'italic', color: '#6b6560' },
    { tag: tags.meta, color: '#9a8e84' },
    { tag: tags.comment, color: '#9a8e84', fontStyle: 'italic' },
    { tag: tags.processingInstruction, color: '#9a8e84' },
    { tag: tags.keyword, color: '#a64e30', fontWeight: '600' },
    { tag: tags.string, color: '#5c7a3e' },
    { tag: tags.number, color: '#7a5c2e' },
    { tag: tags.variableName, color: '#3a6e8c' },
    { tag: tags.definition(tags.variableName), color: '#3a6e8c' },
]);

// ── Markdown editor commands ─────────────────────────
// wraps selection with symmetric markers (** for bold, _ for italic)
function wrapWith(view, marker) {
    const { state } = view;
    const { from, to } = state.selection.main;

    // no selection — insert markers and place cursor between
    if (from === to) {
        view.dispatch({
            changes: { from, to, insert: `${marker}${marker}` },
            selection: { anchor: from + marker.length },
        });
        return true;
    }

    const selected = state.sliceDoc(from, to);

    // already wrapped inside selection — unwrap
    if (
        selected.startsWith(marker) &&
        selected.endsWith(marker) &&
        selected.length > marker.length * 2
    ) {
        const unwrapped = selected.slice(marker.length, -marker.length);
        view.dispatch({
            changes: { from, to, insert: unwrapped },
            selection: { anchor: from, head: from + unwrapped.length },
        });
        return true;
    }

    // check if markers are outside selection — unwrap
    const before = state.sliceDoc(from - marker.length, from);
    const after = state.sliceDoc(to, to + marker.length);
    if (before === marker && after === marker) {
        view.dispatch({
            changes: [
                { from: from - marker.length, to: from, insert: '' },
                { from: to, to: to + marker.length, insert: '' },
            ],
            selection: { anchor: from - marker.length, head: to - marker.length },
        });
        return true;
    }

    // wrap
    view.dispatch({
        changes: { from, to, insert: `${marker}${selected}${marker}` },
        selection: { anchor: from + marker.length, head: to + marker.length },
    });
    return true;
}

// wraps selection with asymmetric tags (<u></u>)
function wrapWithTag(view, open, close) {
    const { state } = view;
    const { from, to } = state.selection.main;

    if (from === to) {
        view.dispatch({
            changes: { from, to, insert: `${open}${close}` },
            selection: { anchor: from + open.length },
        });
        return true;
    }

    const selected = state.sliceDoc(from, to);
    if (selected.startsWith(open) && selected.endsWith(close)) {
        const unwrapped = selected.slice(open.length, -close.length);
        view.dispatch({
            changes: { from, to, insert: unwrapped },
            selection: { anchor: from, head: from + unwrapped.length },
        });
        return true;
    }

    view.dispatch({
        changes: { from, to, insert: `${open}${selected}${close}` },
        selection: { anchor: from + open.length, head: to + open.length },
    });
    return true;
}

// inserts a markdown link
function insertLink(view) {
    const { state } = view;
    const { from, to } = state.selection.main;
    const selected = state.sliceDoc(from, to);
    const insert = selected ? `[${selected}](url)` : `[text](url)`;
    const urlStart = from + (selected ? selected.length + 2 : 6);
    view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: urlStart, head: urlStart + 3 },
    });
    return true;
}

// auto-continue lists on Enter
function continueList(view) {
    const { state } = view;
    const range = state.selection.main;
    if (range.from !== range.to) return false;

    const line = state.doc.lineAt(range.from);
    const text = line.text;

    // match list patterns: - , * , + , 1. , - [ ] , - [x]
    const match = text.match(/^(\s*)([-*+](?:\s\[[ x]\])?\s|(\d+)\.\s)/);
    if (!match) return false;

    const [fullMatch, indent, marker, num] = match;
    const content = text.slice(fullMatch.length);

    // empty item — remove the marker
    if (!content.trim()) {
        view.dispatch({ changes: { from: line.from, to: line.to, insert: '' } });
        return true;
    }

    // build next marker
    let nextMarker = marker;
    if (num) nextMarker = `${parseInt(num) + 1}. `;
    else if (marker.includes('[')) nextMarker = marker.replace(/\[[ x]\]/, '[ ]');

    const pos = range.from;
    const after = line.text.slice(pos - line.from);
    const insert = `\n${indent}${nextMarker}${after}`;
    const cursorPos = pos + 1 + indent.length + nextMarker.length;

    view.dispatch({
        changes: { from: pos, to: line.to, insert },
        selection: { anchor: cursorPos },
    });
    return true;
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // inject toolbar Clawd
    document.getElementById('clawd-toolbar').innerHTML = clawdSVG(32);
    document.getElementById('clawd-btn-icon').innerHTML = clawdSVG(22);
    document.getElementById('fab-clawd').innerHTML = clawdSVG(22);

    const mdOutput = document.getElementById('md-output');
    const previewContent = document.getElementById('preview-content');
    const previewPane = document.getElementById('preview-pane');
    const downloadBtn = document.getElementById('download-btn');
    const downloadMdBtn = document.getElementById('download-md-btn');
    const mainEl = document.querySelector('main');
    const resizeHandle = document.getElementById('resize-handle');

    // zoom state for preview scaling
    let currentScale = 1;
    function applyZoom() {
        if (isMobile()) return;
        previewContent.style.zoom = currentScale === 1 ? '' : currentScale;
    }
    function updateScale() {
        const available = previewPane.clientWidth - PREVIEW_PAD;
        const newScale =
            available >= PAPER_PX ? 1 : Math.max(available / PAPER_PX, MIN_SCALE);
        if (newScale !== currentScale) {
            currentScale = newScale;
            applyZoom();
        }
    }

    // scale paper to fit mobile viewport via zoom
    function scaleMobilePreview() {
        if (!isMobile()) return;
        const available = previewPane.clientWidth - 16;
        const scale = Math.min(1, available / PAPER_PX);
        previewContent.style.zoom = scale;
    }

    // ko-fi modal — open/close
    const kofiModal = document.getElementById('kofi-modal');
    document.getElementById('kofi-trigger').addEventListener('click', (e) => {
        e.preventDefault();
        kofiModal.hidden = false;
    });
    document.getElementById('kofi-close').addEventListener('click', () => {
        kofiModal.hidden = true;
    });
    document.getElementById('kofi-backdrop').addEventListener('click', () => {
        kofiModal.hidden = true;
    });

    // favicon from clawd SVG
    const favLink = document.createElement('link');
    favLink.rel = 'icon';
    favLink.href = 'data:image/svg+xml,' + encodeURIComponent(clawdSVG(32));
    document.head.appendChild(favLink);

    // cached header clawd SVG
    const headerClawdSVG = clawdSVG(88);

    // auto-hide FAB during typing/scrolling, show after 2s idle
    const fab = document.getElementById('clawd-fab');
    let fabTimer = null;
    function hideOnActivity() {
        fab.classList.add('fab-hidden');
        clearTimeout(fabTimer);
        fabTimer = setTimeout(() => fab.classList.remove('fab-hidden'), 2000);
    }
    previewPane.addEventListener('scroll', hideOnActivity);

    // editor content helper — reads from CM view
    let view;
    function getDoc() {
        return view.state.doc.toString();
    }

    // auto-save setup
    const STORAGE_KEY = 'clawdown-editor';
    const saved = localStorage.getItem(STORAGE_KEY);
    const initialDoc = saved !== null ? saved : STARTER;
    let lastSaved = initialDoc;
    const saveToStorage = debounce(() => {
        localStorage.setItem(STORAGE_KEY, getDoc());
        lastSaved = getDoc();
    }, 500);

    // full preview pipeline
    function updatePreview() {
        // reset zoom and min-height so layout reflects actual content
        previewContent.style.zoom = '';
        previewContent.style.minHeight = '';

        mdOutput.innerHTML = marked.parse(getDoc());
        mdOutput
            .querySelectorAll('pre code')
            .forEach((el) => hljs.highlightElement(el));

        // convert ---break--- markers to page-break divs
        mdOutput.querySelectorAll('p').forEach((p) => {
            if (p.textContent.trim() === '---break---') {
                const pb = document.createElement('div');
                pb.className = 'page-break';
                p.replaceWith(pb);
            }
        });

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

        // clear ALL old decorations before computing layout —
        // stale absolute-positioned clawds inflate scrollHeight
        clearElements(previewContent, '.page-clawd, .page-sep, .page-num');

        insertPageSpacers(previewContent, mdOutput);
        placePageDecorations(previewContent);
        placeClawds(previewContent);

        // restore zoom after all layout math is done
        if (isMobile()) scaleMobilePreview();
        else applyZoom();
    }

    const debouncedPreview = debounce(updatePreview, 150);

    // ── CodeMirror editor ─────────────────────────────
    const lineNumCompartment = new Compartment();

    // markdown keybindings
    const markdownKeymap = keymap.of([
        { key: 'Mod-b', run: (v) => wrapWith(v, '**') },
        { key: 'Mod-i', run: (v) => wrapWith(v, '_') },
        { key: 'Mod-u', run: (v) => wrapWithTag(v, '<u>', '</u>') },
        { key: 'Mod-k', run: insertLink },
        { key: 'Enter', run: continueList },
    ]);

    view = new EditorView({
        doc: initialDoc,
        extensions: [
            clawdownTheme,
            syntaxHighlighting(clawdownHighlight),
            lineNumCompartment.of(lineNumbers()),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            drawSelection(),
            dropCursor(),
            rectangularSelection(),
            crosshairCursor(),
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            highlightSelectionMatches(),
            history(),
            markdown({ base: markdownLanguage }),
            EditorView.lineWrapping,
            placeholder('Write your markdown here...'),
            EditorView.contentAttributes.of({
                spellcheck: 'false',
                autocorrect: 'off',
                autocapitalize: 'off',
            }),
            // markdown shortcuts before defaults so they take priority
            markdownKeymap,
            keymap.of([
                indentWithTab,
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
            ]),
            // file drop handler
            EditorView.domEventHandlers({
                drop(event) {
                    const file = event.dataTransfer?.files[0];
                    if (!file) return false;
                    event.preventDefault();
                    file.text().then((text) => {
                        view.dispatch({
                            changes: {
                                from: 0,
                                to: view.state.doc.length,
                                insert: text,
                            },
                        });
                        updatePreview();
                        saveToStorage();
                    });
                    return true;
                },
            }),
            // trigger preview + save on content changes
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    debouncedPreview();
                    saveToStorage();
                    hideOnActivity();
                }
            }),
        ],
        parent: document.getElementById('editor'),
    });

    // initial render
    updatePreview();

    // warn before closing with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (getDoc() !== lastSaved) e.preventDefault();
    });

    // ── Settings panel ─────────────────────────────────
    const settingsWrap = document.getElementById('settings-wrap');
    const settingsBtn = document.getElementById('settings-btn');
    const clawdToggle = document.getElementById('clawd-toggle');
    const lineNumToggle = document.getElementById('line-num-toggle');

    // open/close settings dropdown
    settingsBtn.addEventListener('click', () => {
        const open = settingsWrap.classList.toggle('open');
        settingsBtn.setAttribute('aria-expanded', String(open));
    });
    // close on click outside
    document.addEventListener('click', (e) => {
        if (!settingsWrap.contains(e.target)) {
            settingsWrap.classList.remove('open');
            settingsBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // clawd toggle
    let clawdOn = true;
    clawdToggle.addEventListener('click', () => {
        clawdOn = !clawdOn;
        previewContent.classList.toggle('clawds-hidden', !clawdOn);
        clawdToggle.dataset.active = String(clawdOn);
    });

    // line numbers toggle
    let lineNumsOn = true;
    lineNumToggle.addEventListener('click', () => {
        lineNumsOn = !lineNumsOn;
        lineNumToggle.dataset.active = String(lineNumsOn);
        view.dispatch({
            effects: lineNumCompartment.reconfigure(lineNumsOn ? lineNumbers() : []),
        });
    });

    // reset editor — custom confirm modal
    const resetModal = document.getElementById('reset-modal');
    document.getElementById('reset-btn').addEventListener('click', () => {
        settingsWrap.classList.remove('open');
        resetModal.hidden = false;
    });
    document.getElementById('reset-cancel').addEventListener('click', () => {
        resetModal.hidden = true;
    });
    document.getElementById('reset-backdrop').addEventListener('click', () => {
        resetModal.hidden = true;
    });
    document.getElementById('reset-confirm').addEventListener('click', () => {
        resetModal.hidden = true;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: STARTER },
        });
        updatePreview();
        saveToStorage();
    });

    // ── Mobile tab switching ────────────────────────────
    const mobileTabs = document.querySelectorAll('.mobile-tab');
    const editorPane = document.getElementById('editor-pane');

    function initMobileState() {
        if (isMobile()) {
            previewPane.classList.add('mobile-hidden');
            editorPane.classList.remove('mobile-hidden');
        } else {
            previewPane.classList.remove('mobile-hidden');
            editorPane.classList.remove('mobile-hidden');
            previewContent.style.zoom = currentScale === 1 ? '' : currentScale;
        }
    }
    initMobileState();

    mobileTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            mobileTabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.tab === 'editor') {
                editorPane.classList.remove('mobile-hidden');
                previewPane.classList.add('mobile-hidden');
            } else {
                previewPane.classList.remove('mobile-hidden');
                editorPane.classList.add('mobile-hidden');
                updatePreview();
            }
        });
    });

    // unified resize handler: mobile zoom or desktop scale
    window.addEventListener('resize', () => {
        initMobileState();
        if (isMobile()) scaleMobilePreview();
        else updateScale();
    });

    // ── Resizable editor/preview split ─────────────────
    let dragging = false;
    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = true;
        document.body.classList.add('resizing');
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const totalW = mainEl.clientWidth;
        const editorW = Math.max(
            MIN_EDITOR_W,
            Math.min(e.clientX, totalW - MIN_PREVIEW_W - 6),
        );
        mainEl.style.gridTemplateColumns = `${editorW}px 6px 1fr`;
        updateScale();
    });
    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('resizing');
    });
    // double-click resets to 50/50
    resizeHandle.addEventListener('dblclick', () => {
        mainEl.style.gridTemplateColumns = '';
        updateScale();
    });

    // ── Markdown download ──────────────────────────────
    downloadMdBtn.addEventListener('click', () => {
        if (typeof umami !== 'undefined') umami.track('download-md');
        const h1 = mdOutput.querySelector('h1');
        const filename = h1
            ? h1.textContent
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '') + '.md'
            : 'clawdown-export.md';
        const blob = new Blob([getDoc()], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    });

    // ── PDF download ─────────────────────────────────
    downloadBtn.addEventListener('click', async () => {
        if (typeof umami !== 'undefined') umami.track('download-pdf');
        const original = downloadBtn.innerHTML;
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<span class="btn-label">Generating...</span><svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

        const h1 = mdOutput.querySelector('h1');
        const filename = h1
            ? h1.textContent
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '') + '.pdf'
            : 'clawdown-export.pdf';

        // on mobile, temporarily show preview pane so html2canvas can measure
        const previewWasHidden = previewPane.classList.contains('mobile-hidden');
        if (previewWasHidden) previewPane.classList.remove('mobile-hidden');

        // remove zoom and hide spacers for full-size PDF capture
        previewContent.style.zoom = '';
        mdOutput.classList.add('pdf-export');
        if (!clawdOn) mdOutput.classList.add('pdf-no-clawds');

        const restore = () => {
            mdOutput.classList.remove('pdf-export', 'pdf-no-clawds');
            if (previewWasHidden) previewPane.classList.add('mobile-hidden');
            if (isMobile()) scaleMobilePreview();
            else applyZoom();
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = original;
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
                image: { type: 'jpeg', quality: 0.92 },
                html2canvas: {
                    scale: 1.5,
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
