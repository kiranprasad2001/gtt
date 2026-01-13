/**
 * GTA Transit Proxy Worker
 * 
 * A Cloudflare Worker that proxies requests to various GTA transit APIs.
 * This handles CORS and API key security for the frontend.
 */

const ALLOWED_ORIGINS = [
    'https://thomassth.github.io',
    'https://tobus.ca',
    'http://localhost:5173', // Vite dev server
    'http://localhost:4173', // Vite preview
];

const CORS_HEADERS = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

/**
 * Handle CORS preflight requests
 */
function handleOptions(request) {
    const origin = request.headers.get('Origin');
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    return new Response(null, {
        status: 204,
        headers: {
            ...CORS_HEADERS,
            'Access-Control-Allow-Origin': allowedOrigin,
        },
    });
}

/**
 * Add CORS headers to a response
 */
function addCorsHeaders(response, request) {
    const origin = request.headers.get('Origin');
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', allowedOrigin);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * Fetch GO Transit (Metrolinx) next service data
 */
async function fetchGoTransit(stopCode, env) {
    const apiKey = env.METROLINX_KEY;

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: 'Metrolinx API key not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const url = `http://api.openmetrolinx.com/OpenDataAPI/api/V1/Stop/NextService/${encodeURIComponent(stopCode)}`;

    try {
        const response = await fetch(url, {
            headers: {
                'KeyId': apiKey,
            },
        });

        if (!response.ok) {
            return new Response(
                JSON.stringify({
                    error: 'Metrolinx API error',
                    status: response.status,
                    message: await response.text()
                }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const data = await response.json();

        // Return a clean, normalized response
        return new Response(
            JSON.stringify({
                agency: 'go',
                stopCode: stopCode,
                data: data,
                timestamp: new Date().toISOString(),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: 'Failed to fetch from Metrolinx', message: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

/**
 * Main request handler
 */
export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }

        // Only allow GET requests
        if (request.method !== 'GET') {
            return addCorsHeaders(
                new Response(JSON.stringify({ error: 'Method not allowed' }), {
                    status: 405,
                    headers: { 'Content-Type': 'application/json' }
                }),
                request
            );
        }

        const url = new URL(request.url);
        const agency = url.searchParams.get('agency');
        const stopCode = url.searchParams.get('stopCode');

        // Validate required parameters
        if (!agency || !stopCode) {
            return addCorsHeaders(
                new Response(
                    JSON.stringify({
                        error: 'Missing required parameters',
                        required: ['agency', 'stopCode'],
                        example: '?agency=go&stopCode=UN'
                    }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                ),
                request
            );
        }

        let response;

        switch (agency.toLowerCase()) {
            case 'go':
                response = await fetchGoTransit(stopCode, env);
                break;

            // Future: Add YRT, MiWay, Brampton Transit handlers here
            // case 'yrt':
            //   response = await fetchYrt(stopCode, env);
            //   break;

            default:
                response = new Response(
                    JSON.stringify({
                        error: 'Unknown agency',
                        agency: agency,
                        supported: ['go']
                    }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
        }

        return addCorsHeaders(response, request);
    },
};
