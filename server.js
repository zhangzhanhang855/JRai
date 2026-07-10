// 👉 修改后的核心网页代理接口
app.post('/api/proxy', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
        console.log(`[JR Proxy] Fetching html: ${url}`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000
        });

        let html = response.data;
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

        // 💡 【核心修改】：通过正则暴力拦截 HTML 里的所有 <audio> 和 <source> 标签
        // 不再让本地浏览器直接去请求音乐，而是强制将它们的音乐链接改写，全部转发给我们的后端媒体接口！
        html = html.replace(/(<(?:audio|source)[^>]*src=["'])([^"']*)(["'][^>]*>)/gi, (match, p1, p2, p3) => {
            // 如果是相对路径，先拼成绝对路径
            let absoluteMediaUrl = p2;
            if (!/^https?:\/\//i.test(p2)) {
                try {
                    absoluteMediaUrl = new URL(p2, baseUrl).href;
                } catch(e) { absoluteMediaUrl = p2; }
            }
            
            // 如果已经是合法的 http/https 链接，或者补全了的链接
            if (/^https?:\/\//i.test(absoluteMediaUrl)) {
                // 强行把 src 指向你在 Render 上的媒体代理接口
                return `${p1}https://jrai-v64g.onrender.com/api/media-proxy?url=${encodeURIComponent(absoluteMediaUrl)}${p3}`;
            }
            return match;
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        res.status(500).send(`Proxy Error: ${error.message}`);
    }
});

// 👉 【全新引入】：专门用来跨境搬运音频二进制流的接口
app.get('/api/media-proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        console.log(`[JR Media Proxy] Streaming audio from: ${url}`);
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream', // 关键：以流的形式边下载边传给前端，不占服务器内存
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': new URL(url).origin // 伪装成原站来源，破解防盗链
            },
            timeout: 30000
        });

        // 透传原厂音频类型（例如 audio/mpeg, audio/ogg）
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        
        // 管道输送：Render 服务器在国外下一段，就立刻给你的国内浏览器发一段
        response.data.pipe(res);
    } catch (error) {
        console.error('Media proxy failed:', error.message);
        res.status(500).send(error.message);
    }
});
