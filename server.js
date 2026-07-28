const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "healthy", message: "JR Ghost-Protocol Active!" });
});

/**
 * 转换 URL 为 Render 代理 URL
 */
function toProxyUrl(rawUrl, targetOrigin, proxyHost) {
    if (!rawUrl) return rawUrl;
    // 忽略 base64, blob 以及已经代理过的 URL
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.includes('/api/media-stream')) {
        return rawUrl;
    }
    try {
        const absoluteUrl = new URL(rawUrl, targetOrigin).href;
        return `${proxyHost}/api/media-stream?url=${encodeURIComponent(absoluteUrl)}`;
    } catch (e) {
        return rawUrl;
    }
}

// 1. 网页 HTML 代理与深层脚本注入中心
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[Ghost Mode] Fetching Page: ${url}`);
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

        // 👉 注入黑科技：深度拦截 DOM、Audio 对象、Fetch/XHR
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

                    // 1. 拦截 AJAX (XHR)
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                        return originalOpen.call(this, method, wrapUrl(url), ...rest);
                    };

                    // 2. 拦截 Fetch API
                    const originalFetch = window.fetch;
                    window.fetch = function(resource, config) {
                        if (typeof resource === 'string') {
                            resource = wrapUrl(resource);
                        } else if (resource && resource.url) {
                            resource = new Request(wrapUrl(resource.url), resource);
                        }
                        return originalFetch.call(this, resource, config);
                    };

                    // 3. 核心大招：拦截 new Audio() 和 HTMLAudioElement 的 src 属性赋值
                    const originalAudio = window.Audio;
                    window.Audio = function(src) {
                        const audioInstance = new originalAudio(wrapUrl(src));
                        return audioInstance;
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

                    // 4. 拦截防内嵌/逃脱代码
                    const preventEscape = { get: function() { return window; }, set: function() { return true; } };
                    Object.defineProperty(window, 'top', preventEscape);
                    Object.defineProperty(window, 'parent', preventEscape);
                })();
            </script>
            <base href="${targetOrigin}/">
        `;

        // 替换常规 HTML 标签属性（包含 audio, video, source 等）
        html = html.replace(/(src|href|poster|data-src)\s*=\s*["']([^"']+)["']/gi, (match, attr, srcVal) => {
            if (srcVal.startsWith('#') || srcVal.startsWith('javascript:')) return match;
            return `${attr}="${toProxyUrl(srcVal, targetOrigin, protocolAndHost)}"`;
        });

        // 插入注入脚本
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

// 2. 全能流媒体与网络请求中转站（解决 GitHub 阻断的核心）
app.use('/api/media-stream', (req, res, next) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        const decodedUrl = decodeURIComponent(url);
        const urlObj = new URL(decodedUrl);

        const mediaProxy = createProxyMiddleware({
            target: urlObj.origin,
            changeOrigin: true,
            followRedirects: true, // 💡【最关键一步】：让 Render 在服务端跟进 GitHub 的 302 重定向，不把 GitHub 原始 CDN 暴露给国内客户端！
            pathRewrite: () => urlObj.pathname + urlObj.search,
            on: {
                proxyReq: (proxyReq, req) => {
                    // 伪装全套请求头
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
                    proxyReq.setHeader('Referer', 'https://github.com/');
                    proxyReq.setHeader('Accept', '*/*');

                    // 支持音频拖动（分片 Range 请求）
                    if (req.headers.range) {
                        proxyReq.setHeader('Range', req.headers.range);
                    }
                },
                proxyRes: (proxyRes) => {
                    // 彻底拔除防内嵌与限制跨域头
                    delete proxyRes.headers['x-frame-options'];
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['cross-origin-opener-policy'];
                    delete proxyRes.headers['cross-origin-resource-policy'];

                    // 给前端下发全量 CORS 绿色通行证
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
                    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, HEAD';
                }
            }
        });

        mediaProxy(req, res, next);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(PORT, () => {
    console.log(`JR Ghost-Protocol Server running on port ${PORT}`);
});
