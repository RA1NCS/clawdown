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

const codeBlockPattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const inlineCodePattern = /`[^`\n]+`/g;
const displayMathPattern = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g;
const inlineMathPattern = /(?<!\\)\$([^\s$][^\n$]*?)(?<!\\)\$/g;

// replaces matched text with placeholders and stores originals
function protectSegments(markdown: string, pattern: RegExp, segments: string[]): string {
    return markdown.replace(pattern, (match) => {
        const token = `@@CLAWDOWN_SEGMENT_${segments.length}@@`;
        segments.push(match);
        return token;
    });
}

// renders LaTeX math while leaving markdown code intact
function renderLatex(markdown: string): string {
    const segments: string[] = [];
    let next = protectSegments(markdown, codeBlockPattern, segments);
    next = protectSegments(next, inlineCodePattern, segments);

    next = next.replace(displayMathPattern, (_match, source: string) => {
        const html = katex.renderToString(source.trim(), {
            displayMode: true,
            throwOnError: false,
        });
        return `\n\n<div class="math-display">${html}</div>\n\n`;
    });

    next = next.replace(inlineMathPattern, (_match, source: string) =>
        katex.renderToString(source.trim(), {
            displayMode: false,
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
export function renderHtml(markdown: string, clawds: boolean): string {
    const tokens = marked.lexer(renderLatex(markdown));
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
