// server-side umami event tracking
const UMAMI_URL = 'https://cloud.umami.is/api/send';
const WEBSITE_ID = 'eb294b42-8594-4071-b131-5a97294626e8';

// fire-and-forget event to umami
export function track(name: string, url: string, data?: Record<string, unknown>) {
    fetch(UMAMI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'clawdown-api/1.0',
        },
        body: JSON.stringify({
            type: 'event',
            payload: {
                website: WEBSITE_ID,
                hostname: 'api.clawdown.app',
                url,
                name,
                language: 'en-US',
                screen: '1920x1080',
                ...(data && { data }),
            },
        }),
    }).catch(() => {});
}
