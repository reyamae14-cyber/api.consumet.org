// M3U8 proxy function based on the working implementation
import fetch from 'node-fetch';
import { DEFAULT_USER_AGENT } from './proxyserver.js';
import { logger } from './logger.js';
import http from 'http';
import https from 'https';

export async function proxyM3U8(targetUrl, headers, res, serverUrl) {
    const startTime = Date.now();
    
    try {
        logger.debug('Starting M3U8 proxy request', {
            targetUrl,
            headers: Object.keys(headers),
            serverUrl
        });

        const agentHttp = new http.Agent({ keepAlive: true });
        const agentHttps = new https.Agent({ keepAlive: true });
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                'Accept': '*/*',
                ...headers
            },
            agent: (parsedUrl) => (parsedUrl.protocol === 'http:' ? agentHttp : agentHttps),
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
            logger.error('M3U8 fetch failed', null, {
                targetUrl,
                statusCode: response.status,
                statusText: response.statusText,
                responseTime: Date.now() - startTime
            });
            
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: `M3U8 fetch failed: ${response.status} ${response.statusText}`,
                code: 'M3U8_FETCH_ERROR',
                targetUrl,
                timestamp: new Date().toISOString()
            }));
            return;
        }

        const m3u8Content = await response.text();
        
        logger.debug('M3U8 content fetched successfully', {
            targetUrl,
            contentLength: m3u8Content.length,
            responseTime: Date.now() - startTime
        });

        // Process M3U8 content line by line - key difference from our previous implementation
        const processedLines = m3u8Content.split('\n').map((line) => {
            line = line.trim();

            // Skip empty lines and comments (except special ones)
            if (!line || (line.startsWith('#') && !line.includes('URI='))) {
                return line;
            }

            // Handle URI in #EXT-X-MEDIA tags (for audio/subtitle tracks)
            if (line.startsWith('#EXT-X-MEDIA:') && line.includes('URI=')) {
                const uriMatch = line.match(/URI="([^"]+)"/);
                if (uriMatch) {
                    const mediaUrl = new URL(uriMatch[1], targetUrl).href;
                    const proxyUrl = `${serverUrl}/m3u8-proxy?url=${encodeURIComponent(mediaUrl)}`;
                    return line.replace(uriMatch[1], proxyUrl);
                }
                return line;
            }

            // Handle encryption keys
            if (line.startsWith('#EXT-X-KEY:') && line.includes('URI=')) {
                const uriMatch = line.match(/URI="([^"]+)"/);
                if (uriMatch) {
                    const keyUrl = new URL(uriMatch[1], targetUrl).href;
                    const proxyUrl = `${serverUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}`;
                    return line.replace(uriMatch[1], proxyUrl);
                }
                return line;
            }

            // Handle segment URLs (non-comment lines)
            if (!line.startsWith('#')) {
                try {
                    const match = line.match(/[^\s]+?(\.m3u8(?:\?[^\s]*)?|\.ts(?:\?[^\s]*)?)/i);
                    let raw = match ? match[0] : line;
                    raw = raw.replace(/%2522.*$/i, '').replace(/%22.*$/i, '');
                    const abs = new URL(raw, targetUrl).href;
                    const isM3U8 = /\.m3u8(?:\?|$)/i.test(raw);
                    if (isM3U8) {
                        return `${serverUrl}/m3u8-proxy?url=${encodeURIComponent(abs)}`;
                    }
                    return `${serverUrl}/ts-proxy?url=${encodeURIComponent(abs)}`;
                } catch (e) {
                    return line;
                }
            }

            return line;
        });

        const processedContent = processedLines.join('\n');

        logger.debug('M3U8 content processed successfully', {
            targetUrl,
            originalLines: m3u8Content.split('\n').length,
            processedLines: processedLines.length,
            processingTime: Date.now() - startTime
        });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Length', Buffer.byteLength(processedContent));
        res.setHeader('Cache-Control', 'no-cache');

        res.writeHead(200);
        res.end(processedContent);
        
        logger.info('M3U8 proxy request completed successfully', {
            targetUrl,
            responseTime: Date.now() - startTime,
            contentLength: processedContent.length
        });
        
    } catch (error) {
        logger.error('M3U8 proxy processing error', error, {
            targetUrl,
            headers: Object.keys(headers),
            serverUrl,
            responseTime: Date.now() - startTime
        });
        
        if (!res.headersSent) {
            const isAbort = error && (error.name === 'AbortError' || /timeout/i.test(error.message));
            const statusCode = isAbort ? 408 : 500;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: isAbort ? 'M3U8 proxy timeout' : 'M3U8 proxy processing error',
                code: isAbort ? 'M3U8_TIMEOUT' : 'M3U8_PROCESSING_ERROR',
                message: error.message,
                timestamp: new Date().toISOString()
            }));
        }
    }
}
