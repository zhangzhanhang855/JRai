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

if (!process.env.GEMINI_API_KEY) {
    console.error("警告: 未找到 GEMINI_API_KEY 环境变量！");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        // 回退到当前 API 实际支持的最强旗舰模型
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        res.json({ text: text });
    } catch (error) {
        console.error('调用 Gemini API 失败:', error);
        res.status(500).json({ error: error.message || 'AI 服务暂时不可用。' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`当前使用的模型为: gemini-1.5-pro-latest`);
});
