// sends rendered HTML to Gotenberg and returns raw PDF buffer
const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://localhost:3000';

// margin: 13mm = 0.512 inches (matches client-side jsPDF margins)
const MARGIN_INCHES = '0.512';

export async function convertToPdf(html: string): Promise<ArrayBuffer> {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('paperWidth', '8.5');
    form.append('paperHeight', '11');
    // top/bottom margins for per-page spacing; left/right 0 so CSS padding handles it
    // cream bg painted over margin areas in stamp.ts post-processing
    form.append('marginTop', MARGIN_INCHES);
    form.append('marginBottom', MARGIN_INCHES);
    form.append('marginLeft', '0');
    form.append('marginRight', '0');
    form.append('printBackground', 'true');
    form.append('emulatedMediaType', 'screen');
    form.append('generateTaggedPdf', 'true');
    // wait for Google Fonts to load before converting
    form.append('skipNetworkIdleEvent', 'false');

    const res = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
        method: 'POST',
        body: form,
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`gotenberg error (${res.status}): ${err}`);
    }

    return res.arrayBuffer();
}
