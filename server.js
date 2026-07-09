const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 允许跨域请求（方便你的前端进行测试）
app.use(cors());
// 解析 JSON 请求体
app.use(express.json());

// 代理接口
app.post('/api/proxy', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // 使用 Axios 访问目标网站，并设置常见的 User-Agent 伪装成浏览器
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000 // 10秒超时
        });

        // 将获取到的网页 HTML 传回前端
        res.send(response.data);
    } catch (error) {
        console.error('Error fetching the URL:', error.message);
        res.status(500).json({ error: 'Failed to fetch the website', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
