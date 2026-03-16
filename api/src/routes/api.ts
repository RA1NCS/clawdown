// REST API routes — POST /convert, POST /convert/batch, GET /health, GET /d/:id
import { Hono } from 'hono';
import { PDFDocument } from 'pdf-lib';
import { renderHtml } from '../render';
import { convertToPdf } from '../convert';
import { stampPdf } from '../stamp';
import { getPdf, uploadPdf } from '../storage';
import { track } from '../track';

// batch limits
const MAX_BATCH_SIZE = 10;
const MAX_MARKDOWN_BYTES = 1_000_000;

const api = new Hono();

// health check
api.get('/health', (c) => c.json({ status: 'ok' }));

// convert markdown to styled PDF
api.post('/convert', async (c) => {
    const t0 = performance.now();

    const {
        markdown,
        clawds = true,
        filename = 'clawdown-export',
    } = await c.req.json();

    if (!markdown || typeof markdown !== 'string') {
        return c.json({ error: 'markdown field is required' }, 400);
    }

    // render markdown → full HTML page
    const t1 = performance.now();
    const html = renderHtml(markdown, clawds);
    const tRender = performance.now() - t1;

    // send to Gotenberg → raw PDF
    const t2 = performance.now();
    const rawPdf = await convertToPdf(html);
    const tGotenberg = performance.now() - t2;

    // stamp border clawds + page numbers
    const t3 = performance.now();
    const finalPdf = await stampPdf(rawPdf, clawds);
    const tStamp = performance.now() - t3;

    const tTotal = performance.now() - t0;

    track('api-convert', '/convert', {
        size_kb: Math.round(finalPdf.length / 1024),
    });

    return new Response(finalPdf.buffer as ArrayBuffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}.pdf"`,
            'X-Time-Total': `${tTotal.toFixed(0)}ms`,
            'X-Time-Render': `${tRender.toFixed(0)}ms`,
            'X-Time-Gotenberg': `${tGotenberg.toFixed(0)}ms`,
            'X-Time-Stamp': `${tStamp.toFixed(0)}ms`,
        },
    });
});

// convert up to 10 documents in one request, all in parallel
// returns R2 download URLs instead of raw binaries (keeps response small)
api.post('/convert/batch', async (c) => {
    const { documents } = await c.req.json();

    if (!Array.isArray(documents) || documents.length === 0) {
        return c.json({ error: 'documents array is required' }, 400);
    }
    if (documents.length > MAX_BATCH_SIZE) {
        return c.json(
            { error: `maximum ${MAX_BATCH_SIZE} documents per batch` },
            400,
        );
    }

    const t0 = performance.now();

    // each doc goes through the full pipeline independently
    const results = await Promise.all(
        documents.map(
            async (doc: { markdown: string; clawds?: boolean }, i: number) => {
                // validate individually so one bad doc doesn't kill the whole batch
                if (!doc.markdown || typeof doc.markdown !== 'string') {
                    return { index: i, error: 'markdown field is required' };
                }
                if (
                    new TextEncoder().encode(doc.markdown).length >
                    MAX_MARKDOWN_BYTES
                ) {
                    return { index: i, error: 'markdown exceeds 1MB limit' };
                }

                // render → gotenberg → stamp → upload
                const clawds = doc.clawds ?? true;
                const html = renderHtml(doc.markdown, clawds);
                const rawPdf = await convertToPdf(html);
                const finalPdf = await stampPdf(rawPdf, clawds);

                const pdfDoc = await PDFDocument.load(finalPdf);
                const pageCount = pdfDoc.getPageCount();

                // upload to R2, return short URL
                const id = crypto.randomUUID().split('-')[0];
                await uploadPdf(`${id}.pdf`, finalPdf);

                return {
                    index: i,
                    download_url: `https://api.clawdown.app/d/${id}`,
                    page_count: pageCount,
                    file_size_kb: Math.round(finalPdf.length / 1024),
                };
            },
        ),
    );

    track('api-batch-convert', '/convert/batch', {
        count: documents.length,
        time_ms: Math.round(performance.now() - t0),
    });

    return c.json({ results });
});

// serve a PDF from R2 by id
api.get('/d/:id', async (c) => {
    const pdf = await getPdf(`${c.req.param('id')}.pdf`);
    if (!pdf) return c.json({ error: 'not found or expired' }, 404);

    return new Response(pdf.buffer as ArrayBuffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${c.req.param('id')}.pdf"`,
        },
    });
});

export default api;
