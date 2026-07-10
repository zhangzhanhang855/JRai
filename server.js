const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 根路径
app.get('/', (req, res) => {
    res.json({ status: "healthy", message: "JR Proxy Server is running perfectly!" });
});

// 1. 网页 HTML 代理接口
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[JR Proxy] Fetching html: ${url}`);
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0' 
            },
            timeout: 15000
        });

        let html = response.data;
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

        // 👉 安全替换优化：将所有音频相关的 src 强制替换为走我们的海外媒体流代理
        // 增加对各种单双引号、无引号、带 source 标签的超强兼容性
        html = html.replace(/(<(?:audio|source)[^>]*src=["'])([^"']*)(["'][^>]*>)/gi, (match, p1, p2, p3) => {
            let absoluteMediaUrl = p2.trim();
            
            // 跳过无效或空链接
            if (!absoluteMediaUrl || absoluteMediaUrl.startsWith('data:')) return match;

            // 相对路径补全
            if (!/^https?:\/\//i.test(absoluteMediaUrl)) {
                try {
                    absoluteMediaUrl = new URL(absoluteMediaUrl, baseUrl).href;
                } catch(e) {
                    return match; // 补全失败则保持原样，防止崩溃
                }
            }
            
            // 强行重定向到我们自己的媒体通道
            return `${p1}https://jrai-v64g.onrender.com/api/media-proxy?url=${encodeURIComponent(absoluteMediaUrl)}${p3}`;
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('[HTML Proxy Error]:', error.message);
        res.status(500).send(`<div style="padding:40px;color:red;text-align:center;">Proxy HTML Error: ${error.message}</div>`);
    }
});

// 2. 媒体二进制音频流代理接口（防海外屏蔽、防跨域、防盗链）
app.get('/api/media-proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        // 👉 关键安全容错：解析 Origin 时加入 try-catch，防止非法 URL 直接导致系统假死
        let originHeader = '';
        try {
            originHeader = new URL(url).origin;
        } catch (e) {
            originHeader = '*';
        }

        console.log(`[JR Media Proxy] Streaming from: ${url}`);
        
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream', // 极其关键：必须是 stream 流模式
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': originHeader
            },
            timeout: 30000 // 音乐下载给足 30 秒超时时间
        });

        // 允许前端流式跨域接收音频
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        
        // 管道流式传输给国内浏览器
        response.data.pipe(res);

        // 监听错误，防止传输中途断开导致 Node 进程崩溃
        response.data.on('error', (err) => {
            console.error('Stream error:', err.message);
        });

    } catch (error) {
        console.error('[Media Proxy Server Error]:', error.message);
        // 如果已经发送了部分请求头，则直接结束响应而不再尝试报错
        if (!res.headersSent) {
            res.status(500).send(`Media Proxy Error: ${error.message}`);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running securely on port ${PORT}`);
});
