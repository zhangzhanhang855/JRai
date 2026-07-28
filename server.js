const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "healthy", message: "JR Ghost-Protocol Operational!" });
});

/**
 * Safely rewrites resource URLs to proxy endpoints
 */
function toProxyUrl(rawUrl, targetOrigin, proxyHost) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    
    const trimmed = rawUrl.trim();
    if (
        trimmed.startsWith('data:') || 
        trimmed.startsWith('blob:') || 
        trimmed.startsWith('#') || 
        trimmed.startsWith('javascript:') ||
        trimmed.includes('/api/media-stream')
    ) {
        return rawUrl;
    }

    try {
        const absoluteUrl = new URL(trimmed, targetOrigin).href;
        return `${proxyHost}/api/media-stream?url=${encodeURIComponent(absoluteUrl)}`;
    } catch (e) {
        return rawUrl;
    }
}

// 1. Web Page HTML Proxy & Smart Asset Rewriter
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[JR Ghost Proxy] Processing Page: ${url}`);
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000,
            responseType: 'text'
        });

        let html = response.data;
        const urlObj = new URL(url);
        const targetOrigin = urlObj.origin;
        const protocolAndHost = `${req.protocol}://${req.get('host')}`;

        // Client-side JS Injection
        const injectionScript = `
        <head>
            <script>
                (function() {
                    window._targetOrigin = "${targetOrigin}";
                    window._proxyHost = "${protocolAndHost}";

                    function wrapUrl(rawUrl) {
                        if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
                        if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.includes('/api/media-stream')) {
                            return rawUrl;
                        }
                        try {
                            const abs = new URL(rawUrl, window._targetOrigin).href;
                            return window._proxyHost + '/api/media-stream?url=' + encodeURIComponent(abs);
                        } catch (e) {
                            return rawUrl;
                        }
                    }

                    // Intercept Fetch API
                    const originalFetch = window.fetch;
                    window.fetch = function(resource, config) {
                        if (typeof resource === 'string') {
                            resource = wrapUrl(resource);
                        } else if (resource && resource.url) {
                            resource = new Request(wrapUrl(resource.url), resource);
                        }
                        return originalFetch.call(this, resource, config);
                    };

                    // Intercept XMLHttpRequest
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                        return originalOpen.call(this, method, wrapUrl(url), ...rest);
                    };

                    // Intercept Audio src assignments
                    const originalAudio = window.Audio;
                    window.Audio = function(src) {
                        return new originalAudio(wrapUrl(src));
                    };

                    const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
                    if (srcDescriptor && srcDescriptor.set) {
                        Object.defineProperty(HTMLMediaElement.prototype, 'src', {
                            get: srcDescriptor.get,
                            set: function(value) {
                                srcDescriptor.set.call(this, wrapUrl(value));
                            },
                            configurable: true
                        });
                    }

                    // Prevent frame breakout checks
                    const preventEscape = { get: function() { return window; }, set: function() { return true; } };
                    Object.defineProperty(window, 'top', preventEscape);
                    Object.defineProperty(window, 'parent', preventEscape);
                })();
            </script>
            <base href="${targetOrigin}/">
        `;

        // Precise HTML regex replacement for assets (src, href for css/js/images/audio)
        html = html.replace(/(src|href)\s*=\s*["']([^"']+)["']/gi, (match, attr, srcVal) => {
            // Do not rewrite plain hash anchors or void javascript tags
            if (srcVal.startsWith('#') || srcVal.startsWith('javascript:')) return match;

            const proxyUrl = toProxyUrl(srcVal, targetOrigin, protocolAndHost);
            return `${attr}="${proxyUrl}"`;
        });

        // Inject script into head or body
        if (html.includes('<head>')) {
            html = html.replace('<head>', injectionScript);
        } else {
            html = html.replace('<html>', `<html>${injectionScript}`);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        res.status(500).send(`<div style="padding:40px;color:red;text-align:center;">Proxy Error: ${error.message}</div>`);
    }
});

// 2. All-Media & Asset Stream Proxy Endpoint
app.use('/api/media-stream', (req, res, next) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL parameter is required');

    try {
        const decodedUrl = decodeURIComponent(url);
        const urlObj = new URL(decodedUrl);

        const mediaProxy = createProxyMiddleware({
            target: urlObj.origin,
            changeOrigin: true,
            followRedirects: true,
            pathRewrite: () => urlObj.pathname + urlObj.search,
            on: {
                proxyReq: (proxyReq, req) => {
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
                    proxyReq.setHeader('Referer', urlObj.origin);
                    proxyReq.setHeader('Accept', '*/*');

                    if (req.headers.range) {
                        proxyReq.setHeader('Range', req.headers.range);
                    }
                },
                proxyRes: (proxyRes) => {
                    // Strip Security headers that block stylesheets / cross-origin elements
                    delete proxyRes.headers['x-frame-options'];
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['cross-origin-opener-policy'];
                    delete proxyRes.headers['cross-origin-resource-policy'];
                    delete proxyRes.headers['cross-origin-embedder-policy'];

                    // Enable full CORS access for CSS, JS, Fonts, and Media
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
                    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, HEAD';
                }
            }
        });

        mediaProxy(req, res, next);
    } catch (e) {
        res.status(500).send(`Proxy Error: ${e.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`JR Ghost-Protocol Server running on port ${PORT}`);
});
