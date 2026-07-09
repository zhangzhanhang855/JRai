const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 允许跨域请求（方便你的前端进行联调测试）
app.use(cors());

// 2. 解析 JSON 格式的请求体
app.use(express.json());

// 3. 根路径 GET 请求：解决直接访问显示 "Cannot GET /" 的问题
app.get('/', (req, res) => {
    res.json({
        status: "healthy",
        message: "JR Proxy Server is running successfully!",
        usage: "Send a POST request to /api/proxy with { \"url\": \"YOUR_URL\" }"
    });
});

// 4. 核心代理接口 (POST 请求)
app.post('/api/proxy', async (req, res) => {
    const { url } = req.body;

    // 检查前端是否传了网址
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`[JR Proxy] Fetching target URL: ${url}`);

        // 使用 Axios 去访问目标网站，并模拟常见的浏览器 User-Agent 避免被拦截
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            },
            timeout: 12000 // 设置 12 秒超时，防止 Render 服务器卡死
        });

        // 将获取到的网页 HTML 源码完整传回前端
        res.send(response.data);

    } catch (error) {
        console.error('[JR Proxy Error]:', error.message);
        
        // 区分是目标网站报错还是服务器自身问题
        if (error.response) {
            res.status(error.response.status).json({ 
                error: 'Target website returned an error', 
                details: error.message 
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to fetch the website', 
                details: error.message 
            });
        }
    }
});

// 5. 启动服务器
app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`  JR Proxy Server is running on port ${PORT}`);
    console.log(`=============================================`);
});
