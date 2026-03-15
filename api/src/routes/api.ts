// REST API routes — POST /convert, GET /health, GET /d/:id
import { Hono } from 'hono';
import { renderHtml } from '../render';
import { convertToPdf } from '../convert';
import { stampPdf } from '../stamp';
import { getPdf } from '../storage';
import { track } from '../track';

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

    track('api-convert', '/convert', { size_kb: Math.round(finalPdf.length / 1024) });

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

// serve a PDF from R2 by id
api.get('/d/:id', async (c) => {
    const pdf = await getPdf(`${c.req.param('id')}.pdf`);
    if (!pdf) return c.json({ error: 'not found or expired' }, 404);

    return new Response(pdf, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${c.req.param('id')}.pdf"`,
        },
    });
});

export default api;
