// Enhanced CORS middleware based on the working implementation
export function handleCors(req, res) {
    const origin = req.headers.origin || '';
    let allowed = [];
    try {
        if (process.env.ALLOWED_ORIGINS) {
            allowed = JSON.parse(process.env.ALLOWED_ORIGINS);
        }
    } catch {
        allowed = String(process.env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    const isLocal = /^http:\/\/localhost(?::\d+)?$/.test(origin);
    const isAllowed = origin && (isLocal || allowed.includes(origin));
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Range, Accept, Origin, X-Requested-With'
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }
    return false;
}
