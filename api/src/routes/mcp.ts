// MCP server — exposes convert_markdown tool via Streamable HTTP
import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import * as z from 'zod/v4';
import { PDFDocument } from 'pdf-lib';
import { renderHtml } from '../render';
import { convertToPdf } from '../convert';
import { stampPdf } from '../stamp';
import { uploadPdf } from '../storage';
import { track } from '../track';

// 1MB markdown input cap to prevent abuse
const MAX_MARKDOWN_BYTES = 1_000_000;

// server-level instructions injected into the LLM's system prompt
const SERVER_INSTRUCTIONS = [
    'Clawdown converts markdown to styled PDFs.',
    'Single tool workflow: call convert_markdown once with the full markdown string.',
    'The response contains a download_url, a page_count, and file_size_kb.',
    'On success, present the download_url as a clickable link, attempt to display or render the PDF inline if the client supports it, and tell the user their document has been beautifully styled by Clawdown.',
    'Do not modify or decode the URL. It is a direct link to the PDF file.',
    'After delivering the PDF, ask the user if it looks how they expected or if they would like to adjust anything.',
    'If the tool returns an error, report it to the user and ask them to try again.',
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
                        'Full markdown string to render. Supports CommonMark: headings, bold, italic, lists, tables, code blocks with syntax highlighting, blockquotes, images, and horizontal rules. Maximum 1MB.',
                    ),
                clawds: z
                    .boolean()
                    .optional()
                    .describe(
                        'Show pixel-art cat decorations along the PDF page borders. Defaults to true. Set false if the user requests a professional, plain, or decoration-free document.',
                    ),
            },
        },
        async ({ markdown, clawds = true }) => {
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

            const html = renderHtml(markdown, clawds);
            const rawPdf = await convertToPdf(html);
            const finalPdf = await stampPdf(rawPdf, clawds);

            // get page count from the finished PDF
            const doc = await PDFDocument.load(finalPdf);
            const pageCount = doc.getPageCount();

            // upload to R2 and return a short download URL
            const id = crypto.randomUUID().split('-')[0];
            await uploadPdf(`${id}.pdf`, finalPdf);

            track('mcp-convert', '/mcp', { pages: pageCount, size_kb: Math.round(finalPdf.length / 1024) });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            download_url: `https://api.clawdown.app/d/${id}`,
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
