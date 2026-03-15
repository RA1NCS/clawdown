// Clawdown API — markdown to styled PDF
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import api from './routes/api';
import mcp from './routes/mcp';
import { initClawdPngs } from './clawd';

const app = new Hono();

// allow cross-origin requests from the frontend + MCP headers
app.use(
    '*',
    cors({
        origin: '*',
        allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowHeaders: [
            'Content-Type',
            'mcp-session-id',
            'Last-Event-ID',
            'mcp-protocol-version',
        ],
        exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
    }),
);

// hostname gating — each subdomain only serves its own protocol
app.use('*', async (c, next) => {
    const host = c.req.header('host') || '';
    const path = c.req.path;

    // mcp.clawdown.app → MCP + health + server card only
    if (
        host.startsWith('mcp.') &&
        path !== '/' &&
        path !== '/health' &&
        !path.startsWith('/.well-known/')
    ) {
        return c.json({ error: 'use api.clawdown.app for REST' }, 404);
    }

    // api.clawdown.app → REST + health only
    if (host.startsWith('api.') && path === '/mcp') {
        return c.json({ error: 'use mcp.clawdown.app for MCP' }, 404);
    }

    await next();
});

// MCP server card for registry discovery (Smithery, etc.)
app.get('/.well-known/mcp/server-card.json', (c) =>
    c.json({
        name: 'clawdown',
        description:
            'Convert markdown to styled PDFs with warm cream aesthetic and a judgmental pixel cat.',
        url: 'https://mcp.clawdown.app',
        icon: 'https://raw.githubusercontent.com/RA1NCS/clawdown/main/assets/clawd.svg',
        transport: 'streamable-http',
        authentication: null,
        tools: [
            {
                name: 'convert_markdown',
                description:
                    'Convert markdown to a styled PDF. Returns a short download URL, page count, and file size.',
            },
        ],
    }),
);

// mount API routes + MCP at /mcp and root (for mcp.clawdown.app/)
app.route('/', api);
app.route('/mcp', mcp);
app.route('/', mcp);

// pre-render rotated clawd PNGs at startup
const CLAWD_ROTATIONS = [275, 95, 260, 80, 285, 105, 270, 90, 255];

const port = parseInt(process.env.PORT || '8080');

initClawdPngs(CLAWD_ROTATIONS).then(() => {
    console.log(`clawdown api ready on :${port}`);
});

export default {
    port,
    fetch: app.fetch,
};
