// Clawdown API — markdown to styled PDF
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import api from './routes/api';
import { initClawdPngs } from './clawd';

const app = new Hono();

// allow cross-origin requests from the frontend
app.use('*', cors());

// mount API routes
app.route('/', api);

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
