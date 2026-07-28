const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "healthy", message: "JR Ghost-Protocol Server Operational!" });
});

/**
 * Helper function to convert relative URLs to absolute proxy URLs
 */
function toProxyUrl(relativeOrAbsoluteUrl, targetOrigin, proxyHost) {
    try {
        if (!relativeOrAbsoluteUrl || relativeOrAbsoluteUrl.startsWith('data:') || relativeOrAbsoluteUrl.startsWith('blob:')) {
            return relativeOrAbsoluteUrl;
        }
        const absoluteUrl = new URL(relativeOrAbsoluteUrl, targetOrigin).href;
        return `${proxyHost}/api/media-stream?url=${encodeURIComponent(absoluteUrl)}`;
    } catch (e) {
        return relativeOrAbsoluteUrl;
    }
}

// 1. Web Page HTML Proxy & Asset Rewriter
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[JR Ghost Proxy] Fetching and Processing: ${url}`);
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            },
            timeout: 15000,
            responseType: 'text'
        });

        let html = response.data;
        const urlObj = new URL(url);
        const targetOrigin = urlObj.origin;
        const protocolAndHost = `${req.protocol}://${req.get('host')}`;

        // Inject script to handle dynamic media creation, AJAX/Fetch, and navigation
        const injectionScript = `
        <head>
            <script>
                (function() {
                    window._targetOrigin = "${targetOrigin}";
                    window._proxyHost = "${protocolAndHost}";

                    function wrapUrl(rawUrl) {
                        if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.includes('/api/media-stream?url=')) {
                            return rawUrl;
                        }
                        try {
                            const abs = new URL(rawUrl, window._targetOrigin).href;
                            return window._proxyHost + '/api/media-stream?url=' + encodeURIComponent(abs);
                        } catch (e) {
                            return rawUrl;
                        }
                    }

                    // 1. Intercept Fetch Requests
                    const originalFetch = window.fetch;
                    window.fetch = function(resource, config) {
                        if (typeof resource === 'string') {
                            resource = wrapUrl(resource);
                        } else if (resource && resource.url) {
                            resource = new Request(wrapUrl(resource.url), resource);
                        }
                        return originalFetch.call(this, resource, config);
                    };

                    // 2. Intercept XMLHttpRequest
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                        return originalOpen.call(this, method, wrapUrl(url), ...rest);
                    };

                    // 3. Intercept Link Clicks & New Windows
                    window.open = function(url) {
                        if (url) {
                            let absoluteUrl = url.startsWith('http') ? url : new URL(url, window._targetOrigin).href;
                            window.parent.postMessage({ type: 'OPEN_NEW_TAB', url: absoluteUrl }, '*');
                        }
                        return null; 
                    };

                    document.addEventListener('click', function(e) {
                        const target = e.target.closest('a');
                        if (target && target.href) {
                            e.preventDefault();
                            let absoluteUrl = target.href.startsWith('http') ? target.href : new URL(target.getAttribute('href'), window._targetOrigin).href;
                            window.parent.postMessage({ type: 'OPEN_NEW_TAB', url: absoluteUrl }, '*');
                        }
                    }, true);

                    // 4. Intercept Form Submissions
                    document.addEventListener('submit', function(e) {
                        const form = e.target;
                        if (form) {
                            const action = form.getAttribute('action');
                            if (action && !action.startsWith('http')) {
                                form.setAttribute('action', new URL(action, window._targetOrigin).href);
                            }
                        }
                    }, true);

                    // 5. Override Top/Parent Checks
                    const preventEscape = { get: function() { return window; }, set: function() { return true; } };
                    Object.defineProperty(window, 'top', preventEscape);
                    Object.defineProperty(window, 'parent', preventEscape);
                })();
            </script>
            <base href="${targetOrigin}/">
        `;

        // Server-Side URL Rewriting for Static HTML Tags (Images, Video, Audio, Scripts, Links)
        html = html.replace(/(src|href|poster)\s*=\s*["']([^"']+)["']/gi, (match, attr, srcVal) => {
            // Avoid altering anchor links (#), javascript: protocols, or existing proxy links
            if (srcVal.startsWith('#') || srcVal.startsWith('javascript:') || srcVal.includes('/api/media-stream')) {
                return match;
            }
            const proxyUrl = toProxyUrl(srcVal, targetOrigin, protocolAndHost);
            return `${attr}="${proxyUrl}"`;
        });

        // Inject script into head or html root
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

// 2. All-Media & Universal Asset Proxy Endpoint
app.use('/api/media-stream', (req, res, next) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL parameter is required');

    try {
        const decodedUrl = decodeURIComponent(url);
        const urlObj = new URL(decodedUrl);

        const mediaProxy = createProxyMiddleware({
            target: urlObj.origin,
            changeOrigin: true,
            pathRewrite: () => urlObj.pathname + urlObj.search,
            on: {
                proxyReq: (proxyReq, req) => {
                    // Spoof browser headers for high compatibility
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
                    proxyReq.setHeader('Referer', urlObj.origin);
                    proxyReq.setHeader('Origin', urlObj.origin);

                    // Forward Range headers for audio/video streaming support
                    if (req.headers.range) {
                        proxyReq.setHeader('Range', req.headers.range);
                    }
                },
                proxyRes: (proxyRes) => {
                    // Strip headers that prevent iframe embedding or cross-origin media loading
                    delete proxyRes.headers['x-frame-options'];
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['cross-origin-opener-policy'];
                    delete proxyRes.headers['cross-origin-resource-policy'];
                    delete proxyRes.headers['cross-origin-embedder-policy'];

                    // Enable CORS for all assets
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
