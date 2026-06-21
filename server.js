import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 检查是否配置了 API Key
if (!process.env.GEMINI_API_KEY) {
    console.error("警告: 未找到 GEMINI_API_KEY 环境变量！请在 Render 中配置。");
}

// 初始化官方的 GoogleGenerativeAI 客户端
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        // 获取模型实例
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // 使用 SDK 内置的 startChat 处理多轮对话历史
        const chat = model.startChat({
            history: history || [],
        });

        // 发送新消息
        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        res.json({ text: text });
    } catch (error) {
        console.error('调用 Gemini API 失败:', error);
        res.status(500).json({ error: 'AI 服务暂时不可用，或者 API Key 配置有误。' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
