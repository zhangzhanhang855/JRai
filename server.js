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

// 1. 网页 HTML 代理接口
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[Ghost Mode Proxy] Fetching and Decrypting Headers: ${url}`);
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            },
            timeout: 15000
        });

        let html = response.data;
        const urlObj = new URL(url);
        const targetOrigin = urlObj.origin; 

        // 👉 极致注入：强制打破 window.top 与防内嵌拦截
        const injectionScript = `
        <head>
            <script>
                (function() {
                    window._targetOrigin = "${targetOrigin}";
                    
                    // 拦截新窗口
                    window.open = function(url) {
                        if (url) {
                            let absoluteUrl = url.startsWith('http') ? url : new URL(url, window._targetOrigin).href;
                            window.parent.postMessage({ type: 'OPEN_NEW_TAB', url: absoluteUrl }, '*');
                        }
                        return null; 
                    };

                    // 拦截链接
                    document.addEventListener('click', function(e) {
                        const target = e.target.closest('a');
                        if (target && target.href) {
                            e.preventDefault();
                            let absoluteUrl = target.href.startsWith('http') ? target.href : new URL(target.getAttribute('href'), window._targetOrigin).href;
                            window.parent.postMessage({ type: 'OPEN_NEW_TAB', url: absoluteUrl }, '*');
                        }
                    }, true);

                    // 拦截并改写所有表单的 submit 行为，防止登录点击时脱离代理
                    document.addEventListener('submit', function(e) {
                        const form = e.target;
                        if (form) {
                            const action = form.getAttribute('action');
                            if (action && !action.startsWith('http')) {
                                form.setAttribute('action', new URL(action, window._targetOrigin).href);
                            }
                        }
                    }, true);

                    // 彻底伪造并欺骗 window.top 检查
                    const preventEscape = { get: function() { return window; }, set: function() { return true; } };
                    Object.defineProperty(window, 'top', preventEscape);
                    Object.defineProperty(window, 'parent', preventEscape);
                })();
            </script>
            <base href="${targetOrigin}/">
        `;

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

// 2. 核心媒体流与安全响应头粉碎转发中心
app.use('/api/media-stream', (req, res, next) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        const decodedUrl = decodeURIComponent(url);
        const urlObj = new URL(decodedUrl);

        const mediaProxy = createProxyMiddleware({
            target: urlObj.origin,
            changeOrigin: true,
            pathRewrite: () => urlObj.pathname + urlObj.search,
            on: {
                proxyReq: (proxyReq) => {
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                    proxyReq.setHeader('Referer', urlObj.origin);
                },
                proxyRes: (proxyRes) => {
                    // 💡 【大招来了】：在 Render 收到来自 Google 等站点的安全响应后，
                    // 强行把所有用于封锁 iframe、禁止跨域、防止内嵌的安全头全部在内存中拔除！
                    delete proxyRes.headers['x-frame-options'];
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['cross-origin-opener-policy'];
                    delete proxyRes.headers['cross-origin-resource-policy'];

                    // 重新对国内浏览器下发全绿通行证
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
                }
            }
        });

        mediaProxy(req, res, next);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(PORT, () => {
    console.log(`JR Locked-Protocol Server running on port ${PORT}`);
});
