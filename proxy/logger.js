// Comprehensive logging utility for the proxy system
export class ProxyLogger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.enableDetailedLogging = process.env.ENABLE_DETAILED_LOGGING === 'true';
    }

    log(level, message, data = {}) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        const currentLevel = levels[this.logLevel] || 2;
        const messageLevel = levels[level] || 2;

        if (messageLevel <= currentLevel) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                level: level.toUpperCase(),
                message,
                ...data
            };

            console.log(JSON.stringify(logEntry));
        }
    }

    error(message, error = null, context = {}) {
        const errorData = {
            ...context,
            error: error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : null
        };
        this.log('error', message, errorData);
    }

    warn(message, context = {}) {
        this.log('warn', message, context);
    }

    info(message, context = {}) {
        this.log('info', message, context);
    }

    debug(message, context = {}) {
        this.log('debug', message, context);
    }

    // Specific logging methods for proxy operations
    logProxyRequest(type, url, headers = {}, query = {}) {
        if (!this.enableDetailedLogging) return;
        
        this.info(`Proxy ${type} request`, {
            url,
            headers: this.sanitizeHeaders(headers),
            query: this.sanitizeQuery(query),
            userAgent: headers['user-agent'],
            referer: headers.referer,
            origin: headers.origin
        });
    }

    logProxyResponse(type, url, statusCode, responseHeaders = {}, error = null) {
        const context = {
            url,
            statusCode,
            responseHeaders: this.sanitizeHeaders(responseHeaders),
            responseTime: Date.now()
        };

        if (error) {
            this.error(`Proxy ${type} response error`, error, context);
        } else {
            this.info(`Proxy ${type} response success`, context);
        }
    }

    logProviderError(provider, error, context = {}) {
        this.error(`Provider ${provider} error`, error, {
            provider,
            ...context
        });
    }

    logRateLimit(provider, retryAfter = null) {
        this.warn(`Rate limit hit for provider ${provider}`, {
            provider,
            retryAfter,
            timestamp: Date.now()
        });
    }

    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
        
        sensitiveKeys.forEach(key => {
            if (sanitized[key]) {
                sanitized[key] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    sanitizeQuery(query) {
        const sanitized = { ...query };
        const sensitiveKeys = ['token', 'key', 'secret', 'password', 'api_key'];
        
        sensitiveKeys.forEach(key => {
            if (sanitized[key]) {
                sanitized[key] = '[REDACTED]';
            }
        });

        return sanitized;
    }
}

// Create singleton instance
export const logger = new ProxyLogger();