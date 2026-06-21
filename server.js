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

// 检查环境变量中是否配置了 API Key
if (!process.env.GEMINI_API_KEY) {
    console.error("警告: 未找到 GEMINI_API_KEY 环境变量！请确保已在配置中添加。");
}

// 初始化官方客户端
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        // 【关键升级】直接调用 Google 最新的 Gemini 3.1 Pro 模型
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro' });

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        res.json({ text: text });
    } catch (error) {
        console.error('调用 Gemini 3.1 API 失败:', error);
        
        // 如果报错提示模型找不到，可以尝试将上面的模型名称改为 'gemini-3.1-pro-preview'
        res.status(500).json({ error: error.message || 'AI 服务暂时不可用。' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`🚀 当前已接入 Google 旗舰模型: Gemini 3.1 Pro`);
});
