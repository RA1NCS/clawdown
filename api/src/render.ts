// converts markdown string into a full HTML page ready for Gotenberg
import { marked, type Token, type Tokens } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import { clawdSVG } from './clawd';
import { readFileSync } from 'fs';
import { join } from 'path';

// custom code renderer with highlight.js (marked v13 positional args)
const renderer = new marked.Renderer();
renderer.code = function (text: string, lang?: string) {
    if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(text, { language: lang }).value;
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    }
    const auto = hljs.highlightAuto(text);
    return `<pre><code class="hljs">${auto.value}</code></pre>`;
} as any;
marked.use({ renderer });

const projectRoot = join(import.meta.dir, '..', '..');
const mainCss = readFileSync(join(projectRoot, 'style.css'), 'utf-8');

// hljs github theme
const hljsCss = readFileSync(
    join(
        import.meta.dir,
        '..',
        'node_modules',
        'highlight.js',
        'styles',
        'github.css',
    ),
    'utf-8',
);

const katexFontsDir = join(
    import.meta.dir,
    '..',
    'node_modules',
    'katex',
    'dist',
    'fonts',
);

const katexCss = readFileSync(
    join(import.meta.dir, '..', 'node_modules', 'katex', 'dist', 'katex.min.css'),
    'utf-8',
).replace(/url\(fonts\/([^)]+\.woff2)\)/g, (_match, filename: string) => {
    const font = readFileSync(join(katexFontsDir, filename)).toString('base64');
    return `url(data:font/woff2;base64,${font})`;
});

const FONTS_URL =
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap';

const codeBlockPattern = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g;
const inlineCodePattern = /(`+)([^`\n]|`(?!\1))*?\1/g;
const displayMathPattern = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g;
const inlineMathPattern = /(?<![\\$])\$([^\s$][^\n$]*?)(?<!\\)\$(?!\$)/g;
const imagePattern =
    /!\[((?:\\.|[^\]\\\n])*)\]\(((?:<[^>\n]+>|(?:\\.|[^()\s\\]|\([^()\s]*\))+))(?:\s+"((?:\\.|[^"\\])*)")?\)(?:\{width=([^}\n]+)\})?/g;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
]);

export type ImageAttachment = {
    name: string;
    mime_type: string;
    data: string;
};

// derives a clean download filename from the first markdown h1
export function documentTitle(markdown: string, fallback = 'Document - ClawDown'): string {
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] ?? fallback;
    const clean = title
        .replace(/<[^>]*>/g, '')
        .replace(/[*_`~\[\]()]/g, '')
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return clean || fallback;
}

// quotes filenames safely for content-disposition
export function quoteFilename(filename: string): string {
    return filename.replace(/["\\\r\n]/g, '');
}

// replaces matched text with placeholders and stores originals
function protectSegments(
    markdown: string,
    pattern: RegExp,
    segments: string[],
): string {
    return markdown.replace(pattern, (match) => {
        const token = `@@CLAWDOWN_SEGMENT_${segments.length}@@`;
        segments.push(match);
        return token;
    });
}

// converts base64 image attachments into data URLs
function buildImageMap(images: ImageAttachment[]): Map<string, string> {
    const map = new Map<string, string>();
    let totalBytes = 0;

    for (const image of images) {
        if (
            typeof image.name !== 'string' ||
            typeof image.mime_type !== 'string' ||
            typeof image.data !== 'string' ||
            !image.name ||
            !image.mime_type ||
            !image.data
        ) {
            throw new Error('image attachments require name, mime_type, and data');
        }
        if (!ALLOWED_IMAGE_MIMES.has(image.mime_type)) {
            throw new Error(`unsupported image MIME type: ${image.mime_type}`);
        }

        const normalized = image.data.replace(/\s/g, '');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
            throw new Error(`invalid base64 image data: ${image.name}`);
        }

        const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
        const bytes = Math.floor((normalized.length * 3) / 4) - padding;
        totalBytes += bytes;
        if (totalBytes > MAX_IMAGE_BYTES) {
            throw new Error('image attachments exceed 20MB limit');
        }

        map.set(image.name, `data:${image.mime_type};base64,${normalized}`);
    }

    return map;
}

// normalizes image attachments and width syntax before markdown parsing
function renderImages(markdown: string, images: ImageAttachment[]): string {
    const imageMap = buildImageMap(images);
    const segments: string[] = [];
    let protectedMarkdown = protectSegments(markdown, codeBlockPattern, segments);
    protectedMarkdown = protectSegments(protectedMarkdown, inlineCodePattern, segments);

    const rendered = protectedMarkdown.replace(
        imagePattern,
        (
            _match,
            alt: string,
            rawSrc: string,
            title: string | undefined,
            rawWidth: string | undefined,
        ) => {
            const normalizedSrc = normalizeImageSource(rawSrc);
            const src = normalizedSrc.startsWith('attachment:')
                ? imageMap.get(normalizedSrc.slice('attachment:'.length))
                : normalizedSrc;
            if (!src) throw new Error(`missing image attachment: ${rawSrc}`);

            const width = normalizeImageWidth(rawWidth);
            const cleanAlt = unescapeMarkdownText(alt);
            const cleanTitle = title ? unescapeMarkdownText(title) : '';
            const titleAttr = cleanTitle
                ? ` title="${escapeHtmlAttribute(cleanTitle)}"`
                : '';
            const styleAttr = width
                ? ` style="width:${width};max-width:100%;height:auto;"`
                : '';
            return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(cleanAlt)}"${titleAttr}${styleAttr}>`;
        },
    );

    return rendered.replace(
        /@@CLAWDOWN_SEGMENT_(\d+)@@/g,
        (_match, i: string) => segments[Number(i)] ?? '',
    );
}

// strips markdown angle brackets and simple escapes from image URLs
function normalizeImageSource(source: string): string {
    const next =
        source.startsWith('<') && source.endsWith('>')
            ? source.slice(1, -1)
            : source;
    return next.replace(/\\([()\]\\])/g, '$1');
}

// keeps image width values to safe CSS lengths
function normalizeImageWidth(width?: string): string {
    if (!width) return '';
    const next = width.trim();
    return /^(100|[1-9]?\d)(\.\d+)?%$/.test(next) || /^(\d+(\.\d+)?)px$/.test(next)
        ? next
        : '';
}

// removes markdown escapes from text captured by the image parser
function unescapeMarkdownText(value: string): string {
    return value.replace(/\\(.)/g, '$1');
}

// escapes HTML attributes built outside marked
function escapeHtmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// renders LaTeX math while leaving markdown code intact
function renderLatex(markdown: string): string {
    const segments: string[] = [];
    let next = protectSegments(markdown, codeBlockPattern, segments);
    next = protectSegments(next, inlineCodePattern, segments);

    next = next.replace(displayMathPattern, (_match, source: string) => {
        const html = katex.renderToString(source.trim(), {
            displayMode: true,
            output: 'html',
            throwOnError: false,
        });
        return `\n\n<div class="math-display">${html}</div>\n\n`;
    });

    next = next.replace(inlineMathPattern, (_match, source: string) =>
        katex.renderToString(source.trim(), {
            displayMode: false,
            output: 'html',
            throwOnError: false,
        }),
    );

    return next.replace(
        /@@CLAWDOWN_SEGMENT_(\d+)@@/g,
        (_match, i: string) => segments[Number(i)] ?? '',
    );
}

// extracts h1 + optional subtitle from token list, returns doc-header HTML
function buildDocHeader(tokens: Token[], clawds: boolean): string {
    let h1Index = -1;
    let subtitleIndex = -1;
    let h1Text = '';
    let subtitleText = '';

    // find first h1
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t) continue;
        if (t.type === 'heading' && (t as Tokens.Heading).depth === 1) {
            h1Index = i;
            h1Text = (t as Tokens.Heading).text;
            break;
        }
    }

    // check if next token is a short paragraph (subtitle)
    if (h1Index >= 0 && h1Index + 1 < tokens.length) {
        const next = tokens[h1Index + 1];
        if (
            next &&
            next.type === 'paragraph' &&
            (next as Tokens.Paragraph).text.length < 144
        ) {
            subtitleIndex = h1Index + 1;
            subtitleText = (next as Tokens.Paragraph).text;
        }
    }

    // splice out h1 and subtitle (higher index first to avoid shifting)
    if (subtitleIndex >= 0) tokens.splice(subtitleIndex, 1);
    if (h1Index >= 0) tokens.splice(h1Index, 1);

    // render inline content
    const h1Html = h1Text ? marked.parseInline(h1Text) : '';
    const subtitleHtml = subtitleText ? marked.parseInline(subtitleText) : '';

    const clawdHtml = clawds ? `<div class="top-clawd">${clawdSVG(88)}</div>` : '';

    return `<div class="doc-header">${clawdHtml}<div class="header-text"><h1>${h1Html}</h1>${subtitleHtml ? `<p>${subtitleHtml}</p>` : ''}</div></div>`;
}

// renders markdown to a complete HTML page string
export function renderHtml(
    markdown: string,
    clawds: boolean,
    images: ImageAttachment[] = [],
): string {
    const tokens = marked.lexer(renderLatex(renderImages(markdown, images)));
    const docHeader = buildDocHeader(tokens, clawds);

    // convert ---break--- paragraphs to page-break divs (same as app.js)
    for (const token of tokens) {
        if (
            token.type === 'paragraph' &&
            (token as Tokens.Paragraph).text.trim() === '---break---'
        ) {
            (token as any).type = 'html';
            (token as any).raw = '<div class="page-break"></div>';
            (token as any).text = '<div class="page-break"></div>';
            (token as any).pre = false;
        }
    }

    const bodyHtml = marked.parser(tokens);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS_URL}" rel="stylesheet">
<style>${hljsCss}</style>
<style>${katexCss}</style>
<style>${mainCss}</style>
<style>
/* server-side overrides — cream bg painted over margin areas in pdf-lib post-processing */
html, body {
    height: auto;
    overflow: visible;
    display: block;
    background: #FAF9F5;
    margin: 0;
    padding: 0;
}
#preview-content {
    padding: 0 13mm;
    width: auto;
    min-width: 0;
    box-shadow: none;
    border-radius: 0;
    border: none;
    margin: 0;
    background: #FAF9F5;
    min-height: auto;
    overflow: visible;
}
/* page break support for Gotenberg's Chrome PDF */
.page-break {
    break-before: page;
    page-break-before: always;
    height: 0;
}
/* hide preview-only decorations */
.page-clawd, .page-sep, .page-num, .page-spacer { display: none; }
/* cleaner server-side math rendering */
.katex {
    color: var(--text-dark);
    font-size: 1.04em;
    line-height: 1.15;
}
.katex-display {
    margin: 0.65em 0;
    overflow-x: hidden;
    overflow-y: hidden;
}
td .katex {
    font-size: 0.98em;
}
td .katex-display {
    margin: 0;
}
.katex .katex-mathml {
    clip: rect(0, 0, 0, 0) !important;
    color: transparent !important;
    font-size: 0 !important;
    height: 0 !important;
    line-height: 0 !important;
    opacity: 0 !important;
    overflow: hidden !important;
    position: absolute !important;
    user-select: none !important;
    width: 0 !important;
}
.katex .katex-mathml * {
    color: transparent !important;
    font-size: 0 !important;
    line-height: 0 !important;
}
/* page break avoidance — no @page rule, Gotenberg form fields control margins */
pre, blockquote, table, img { break-inside: avoid; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; }
</style>
</head>
<body>
<div id="preview-content">
<div id="md-output">
${docHeader}
${bodyHtml}
</div>
</div>
</body>
</html>`;
}
