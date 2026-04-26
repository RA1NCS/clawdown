// MCP server — exposes convert_markdown tool via Streamable HTTP
import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import * as z from 'zod/v4';
import { PDFDocument } from 'pdf-lib';
import {
    documentTitle,
    quoteFilename,
    renderHtml,
    type ImageAttachment,
} from '../render';
import { convertToPdf } from '../convert';
import { stampPdf } from '../stamp';
import { uploadPdf } from '../storage';
import { track } from '../track';

// 1MB markdown input cap to prevent abuse
const MAX_MARKDOWN_BYTES = 1_000_000;

// server-level instructions injected into the LLM's system prompt
const SERVER_INSTRUCTIONS = [
    'Purpose: Clawdown converts markdown to styled PDFs.',
    'Workflow: call convert_markdown once with the full markdown string. The response contains download_url, page_count, and file_size_kb.',
    'Markdown: supports CommonMark, code highlighting, inline LaTeX with $...$, display LaTeX with $$...$$, and images.',
    'Images: use public URLs when available. For local/generated images, pass payload images and reference them as attachment:name in markdown.',
    'Image sizing: append {width=50%} or {width=320px} after image syntax when an image should not span the full page width.',
    'Clawds: render with clawds by default. Set clawds=false only when the user explicitly asks to render without clawds or cat decorations.',
    'Delivery: fetch the PDF from download_url and display it inline as a viewable artifact when possible. Also present the download_url as a clickable link.',
    'URL handling: do not modify or decode the download_url. It is a direct PDF link.',
    'Shell agents: download locally with curl -sL <download_url> -o output.pdf, then open or display it for the user.',
    'Follow-up: tell the user their document has been beautifully styled by Clawdown, then ask if it looks right or needs adjustment.',
    'Errors: report the tool error and ask the user to try again.',
    'Batch: for 3+ documents with shell access, use REST batch instead of calling this tool in a loop.',
    'REST batch: POST https://api.clawdown.app/convert/batch with {"documents":[{"markdown":"..."},{"markdown":"..."}]} returns download URLs.',
    'REST single: POST https://api.clawdown.app/convert with {"markdown":"...","clawds":true} returns raw PDF binary.',
].join(' ');

// builds a fresh MCP server with tools registered (stateless, one per request)
function createServer() {
    const server = new McpServer(
        { name: 'clawdown', version: '1.0.0' },
        { instructions: SERVER_INSTRUCTIONS },
    );

    // markdown → styled PDF via server pipeline, uploaded to R2
    server.registerTool(
        'convert_markdown',
        {
            title: 'Convert Markdown to PDF',
            description:
                'Converts a markdown string into a downloadable styled PDF. Use this when the user wants to export, save, download, or share content as a PDF.',
            inputSchema: {
                markdown: z
                    .string()
                    .describe(
                        'Full markdown string to render. Supports CommonMark: headings, bold, italic, lists, tables, code blocks with syntax highlighting, blockquotes, images, horizontal rules, inline math with $...$, and display math with $$...$$. Reference payload images as attachment:name. Use {width=50%} or {width=320px} after image syntax to size images. Maximum 1MB.',
                    ),
                images: z
                    .array(
                        z.object({
                            name: z
                                .string()
                                .describe(
                                    'Attachment name used in markdown, e.g. chart.png for attachment:chart.png.',
                                ),
                            mime_type: z
                                .string()
                                .describe(
                                    'Image MIME type. Supported: image/png, image/jpeg, image/webp, image/gif.',
                                ),
                            data: z
                                .string()
                                .describe(
                                    'Base64-encoded image bytes, without a data URL prefix.',
                                ),
                        }),
                    )
                    .optional()
                    .describe(
                        'Optional payload images for local or generated images that are not available at a public URL. Total decoded image payload limit is 20MB.',
                    ),
                clawds: z
                    .boolean()
                    .optional()
                    .describe(
                        'Show pixel-art cat decorations along the PDF page borders. Defaults to true. Set false only when the user explicitly asks to render without clawds or cat decorations.',
                    ),
            },
        },
        async ({ markdown, images = [], clawds = true }) => {
            const imageAttachments = images as ImageAttachment[];
            if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Error: markdown input exceeds the 1MB size limit. Shorten the content and try again.',
                        },
                    ],
                    isError: true,
                };
            }

            let html: string;
            try {
                html = renderHtml(markdown, clawds, imageAttachments);
            } catch (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${err instanceof Error ? err.message : 'invalid images'}`,
                        },
                    ],
                    isError: true,
                };
            }
            const rawPdf = await convertToPdf(html);
            const finalPdf = await stampPdf(rawPdf, clawds);

            // get page count from the finished PDF
            const doc = await PDFDocument.load(finalPdf);
            const pageCount = doc.getPageCount();

            // upload to R2 and return a short download URL
            const id = crypto.randomUUID().split('-')[0];
            const filename = quoteFilename(`${documentTitle(markdown)}.pdf`);
            await uploadPdf(`${id}.pdf`, finalPdf, filename);

            track('mcp-convert', '/mcp', {
                pages: pageCount,
                size_kb: Math.round(finalPdf.length / 1024),
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            download_url: `https://api.clawdown.app/d/${id}`,
                            filename,
                            page_count: pageCount,
                            file_size_kb: Math.round(finalPdf.length / 1024),
                        }),
                    },
                ],
            };
        },
    );

    return server;
}

const mcp = new Hono();

// stateless: fresh transport + server per request, no session tracking
mcp.all('/', async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = createServer();
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
});

export default mcp;
