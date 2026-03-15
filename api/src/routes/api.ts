// REST API routes — POST /convert, GET /health
import { Hono } from 'hono';
import { renderHtml } from '../render';
import { convertToPdf } from '../convert';
import { stampPdf } from '../stamp';

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

export default api;
