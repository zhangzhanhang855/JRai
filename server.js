const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "healthy", message: "JR Proxy Server is running!" });
});

app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[JR Proxy] Fetching: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            },
            timeout: 15000
        });

        let html = response.data;

        // 解析出目标网站的根域名，例如 https://m.music.com/
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

        // 👉 核心修复：向 HTML 头部动态注入 <base href="..."> 标签
        // 这一步能彻底复活网页里所有的相对路径音乐、图片和样式文件！
        const baseTag = `<head><base href="${baseUrl}">`;
        
        if (html.includes('<head>')) {
            html = html.replace('<head>', baseTag);
        } else if (html.includes('<html>')) {
            html = html.replace('<html>', `<html>${baseTag}</head>`);
        } else {
            html = baseTag + html;
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);

    } catch (error) {
        console.error('[Proxy Error]:', error.message);
        res.status(500).send(`Proxy Error: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
