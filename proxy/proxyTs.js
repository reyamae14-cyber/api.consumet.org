// TS/Segment proxy function based on the working implementation
import fetch from 'node-fetch';
import { DEFAULT_USER_AGENT } from './proxyserver.js';
import { logger } from './logger.js';
import http from 'http';
import https from 'https';

export async function proxyTs(targetUrl, headers, req, res) {
    const startTime = Date.now();
    
    try {
        logger.debug('Starting TS proxy request', {
            targetUrl,
            headers: Object.keys(headers),
            range: req.headers.range
        });

        // Sanitize nested/encoded URLs
        try {
            let u = targetUrl;
            // unwrap nested ts-proxy references
            const nestedMatch = u.match(/ts-proxy\?url=([^&]+)/i);
            if (nestedMatch) {
                u = decodeURIComponent(nestedMatch[1]);
            }
            // strip encoded quotes or appended garbage
            u = u.replace(/%2522.*$/i, '').replace(/%22.*$/i, '');
            targetUrl = u;
        } catch {}

        // Handle range requests for video playback
        const fetchHeaders = {
            'User-Agent': DEFAULT_USER_AGENT,
            ...headers
        };

        // Forward range header if present
        if (req.headers.range) {
            fetchHeaders['Range'] = req.headers.range;
            logger.debug('Forwarding range header', {
                range: req.headers.range,
                targetUrl
            });
        }

        const agentHttp = new http.Agent({ keepAlive: true });
        const agentHttps = new https.Agent({ keepAlive: true });
        const response = await fetch(targetUrl, {
            headers: fetchHeaders,
            agent: (parsedUrl) => (parsedUrl.protocol === 'http:' ? agentHttp : agentHttps),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            logger.error('TS fetch failed', null, {
                targetUrl,
                statusCode: response.status,
                statusText: response.statusText,
                responseTime: Date.now() - startTime,
                range: req.headers.range
            });
            
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: `TS fetch failed: ${response.status} ${response.statusText}`,
                code: 'TS_FETCH_ERROR',
                targetUrl,
                timestamp: new Date().toISOString()
            }));
            return;
        }

        const contentType = response.headers.get('content-type') || 'video/mp2t';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=60');

        // Forward important headers from upstream
        if (response.headers.get('content-length')) {
            res.setHeader(
                'Content-Length',
                response.headers.get('content-length')
            );
        }
        if (response.headers.get('content-range')) {
            res.setHeader(
                'Content-Range',
                response.headers.get('content-range')
            );
        }
        if (response.headers.get('accept-ranges')) {
            res.setHeader(
                'Accept-Ranges',
                response.headers.get('accept-ranges')
            );
        }

        if (response.status === 206) {
            res.writeHead(206);
            logger.debug('TS proxy returning 206 partial content', {
                targetUrl,
                contentRange: response.headers.get('content-range'),
                contentLength: response.headers.get('content-length')
            });
        } else {
            res.writeHead(200);
            logger.debug('TS proxy returning 200 full content', {
                targetUrl,
                contentLength: response.headers.get('content-length')
            });
        }

        response.body.pipe(res);
        
        logger.info('TS proxy request completed successfully', {
            targetUrl,
            statusCode: response.status,
            contentType,
            responseTime: Date.now() - startTime
        });
        
    } catch (error) {
        logger.error('TS proxy processing error', error, {
            targetUrl,
            headers: Object.keys(headers),
            range: req.headers.range,
            responseTime: Date.now() - startTime
        });
        
        if (!res.headersSent) {
            const isAbort = error && (error.name === 'AbortError' || /timeout/i.test(error.message));
            const statusCode = isAbort ? 408 : 500;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: isAbort ? 'TS proxy timeout' : 'TS proxy processing error',
                code: isAbort ? 'TS_TIMEOUT' : 'TS_PROCESSING_ERROR',
                message: error.message,
                timestamp: new Date().toISOString()
            }));
        }
    }
}
