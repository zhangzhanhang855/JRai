import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

// 设置 ES Module 的路径变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json());

// 静态文件托管（前端 HTML 文件放在 public 文件夹中）
app.use(express.static(path.join(__dirname, 'public')));

// 初始化 Gemini 客户端
// 注意：无需在代码里硬编码 API Key，SDK 会自动读取 Render 环境变量中的 GEMINI_API_KEY
const ai = new GoogleGenAI({});

// 处理聊天请求的 API 路由
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        // 构建带有上下文的对话记录
        const contents = history ? [...history] : [];
        contents.push({ role: 'user', parts: [{ text: message }] });

        // 调用 Gemini 模型 (此处以 gemini-3.5-flash 为例)
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: contents
        });

        // 将生成的文本返回给前端
        res.json({ text: response.text });
    } catch (error) {
        console.error('调用 Gemini API 失败:', error);
        res.status(500).json({ error: 'AI 服务暂时不可用，请稍后再试。' });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
