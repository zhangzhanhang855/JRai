const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "healthy", message: "JR Locked-Sandbox Proxy Server is running!" });
});

// 1. 核心网页 HTML 加载与强力控制注入
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[HTML Proxy] Fetching & Locking: ${url}`);
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' 
            },
            timeout: 15000
        });

        let html = response.data;
        const urlObj = new URL(url);
        const targetOrigin = urlObj.origin; 

        // 👉 终极黑科技：注入防逃逸、防弹窗、全流程锁定的代理脚本
        const injectionScript = `
        <head>
            <script>
                (function() {
                    window._targetOrigin = "${targetOrigin}";
                    
                    // 【锁定一】：拦截所有新窗口弹窗 (window.open)，让它向外层的父浏览器发送“新建标签页”的电波
                    window.open = function(url) {
                        if (url) {
                            let absoluteUrl = url.startsWith('http') ? url : new URL(url, window._targetOrigin).href;
                            // 向外层套壳发送跨域消息
                            window.parent.postMessage({ type: 'OPEN_NEW_TAB', url: absoluteUrl }, '*');
                        }
                        return null; 
                    };

                    // 【锁定二】：拦截页面上所有的 <a> 标签点击
                    document.addEventListener('click', function(e) {
                        const target = e.target.closest('a');
                        if (target && target.href) {
                            // 如果 target 是 _blank（试图跳出新窗口）
                            if (target.target === '_blank') {
                                e.preventDefault(); // 极其重要：拦截原生跳转
                                let absoluteUrl = target.href.startsWith('http') ? target.href : new URL(target.getAttribute('href'), window._targetOrigin).href;
                                window.parent.postMessage({ type: 'OPEN_NEW_TAB', url: absoluteUrl }, '*');
                            }
                        }
                    }, true);

                    // 【锁定三】：粉碎反内嵌劫持 (阻止 window.top 逃逸)
                    // 让顶级对象变成只读，原网页的 JS 试图重写顶级定位时会直接静默失败
                    const preventEscape = {
                        get: function() { return window; },
                        set: function() { return true; }
                    };
                    Object.defineProperty(window, 'top', preventEscape);
                    Object.defineProperty(window, 'parent', preventEscape);

                    // 【锁定四】：传统的 Audio 与 Fetch 劫持中转
                    const OriginalAudio = window.Audio;
                    window.Audio = function(src) {
                        const audio = new OriginalAudio();
                        if (src) { audio.src = src; }
                        Object.defineProperty(audio, 'src', {
                            set: function(val) {
                                if (val && !val.startsWith('data:') && !val.includes('api/media-stream')) {
                                    let absoluteUrl = val.startsWith('http') ? val : new URL(val, window._targetOrigin).href;
                                    val = "https://jrai-v64g.onrender.com/api/media-stream?url=" + encodeURIComponent(absoluteUrl);
                                }
                                this.setAttribute('src', val);
                            },
                            get: function() { return this.getAttribute('src'); }
                        });
                        return audio;
                    };

                    const originalFetch = window.fetch;
                    window.fetch = async function(...args) {
                        let resource = args[0];
                        if (typeof resource === 'string' && (resource.includes('.mp3') || resource.includes('.m4a') || resource.includes('.ogg') || resource.includes('stream') || resource.includes('audio'))) {
                            let absoluteUrl = resource.startsWith('http') ? resource : new URL(resource, window._targetOrigin).href;
                            args[0] = "https://jrai-v64g.onrender.com/api/media-stream?url=" + encodeURIComponent(absoluteUrl);
                        }
                        return originalFetch.apply(this, args);
                    };
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

// 2. 媒体流中转接口保持不变
app.get('/api/media-stream', (req, res, next) => {
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
    console.log(`Server running securely on port ${PORT}`);
});
