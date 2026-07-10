const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// 开启跨域
app.use(cors());
// 仅对非流式传输的常规路由解析 JSON
app.use(express.json());

// 健康检查
app.get('/', (req, res) => {
    res.json({ 
        status: "healthy", 
        message: "JR Ultimate Audio Proxy Server is fully operational!" 
    });
});

// 1. 网页 HTML 加载与脚本注入接口
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[HTML Proxy] Launching overseas fetch for: ${url}`);
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' 
            },
            timeout: 15000
        });

        let html = response.data;
        const urlObj = new URL(url);
        const targetOrigin = urlObj.origin; 

        // 👉 核心黑科技：向返回的 HTML 头部强行挂载底层全自动拦截网
        // 哪怕音乐播放器是用极其复杂的原生混淆 JS 加载的，它创建 Audio 和 Fetch 的动作也会被我们瞬间拦截，强制转换为走 Render 海外中转
        const injectionScript = `
        <head>
            <script>
                (function() {
                    window._targetOrigin = "${targetOrigin}";
                    
                    // 1. 劫持原生 Audio 构造函数 (修复传统的 <audio> 标签与 new Audio 播放)
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

                    // 2. 劫持现代浏览器原生的 fetch 网络请求 (修复高级播放器异步拉取二进制流)
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

        // 织入拦截网
        if (html.includes('<head>')) {
            html = html.replace('<head>', injectionScript);
        } else {
            html = html.replace('<html>', `<html>${injectionScript}`);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('[HTML Proxy Error]:', error.message);
        res.status(500).send(`<div style="padding:40px;color:red;text-align:center;font-family:sans-serif;">Render Proxy Error: ${error.message}</div>`);
    }
});

// 2. 终极海外音频二进制流全自动代理转发中心
app.get('/api/media-stream', (req, res, next) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        const decodedUrl = decodeURIComponent(url);
        const urlObj = new URL(decodedUrl);

        console.log(`[Render Audio Cloud Parser] Extracting stream from: ${urlObj.host}`);

        // 使用高级反向代理，无缝打通跨国音频传输通道，突破国内机房对海外 IP 的反爬隔离
        const mediaProxy = createProxyMiddleware({
            target: urlObj.origin,
            changeOrigin: true,
            pathRewrite: () => urlObj.pathname + urlObj.search,
            on: {
                proxyReq: (proxyReq) => {
                    // 伪装头部，欺骗大厂音乐服务器的防盗链监测
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                    proxyReq.setHeader('Referer', urlObj.origin);
                },
                proxyRes: (proxyRes) => {
                    // 动态注入跨域白名单，赋予国内浏览器强行解码海外流的权限
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
                    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
                }
            },
            logger: console
        });

        mediaProxy(req, res, next);
    } catch (e) {
        console.error('[Audio Parser Error]:', e.message);
        res.status(500).send(`Audio Parser Crash: ${e.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  Render Audio Cloud Server is operational on ${PORT}`);
    console.log(`====================================================`);
});
