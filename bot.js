require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const token = process.env.TELEGRAM_BOT_TOKEN;
// RENDER_EXTERNAL_URL là biến môi trường Render tự động tạo ra cho bạn
const url = process.env.RENDER_EXTERNAL_URL; 
const port = process.env.PORT || 3000;

// Khởi tạo bot ở chế độ Webhook
const bot = new TelegramBot(token, { webHook: true });
// Đặt webhook URL
if (url) {
    bot.setWebHook(`${url}/bot${token}`);
}

const app = express();
app.use(express.json());

// Nhận dữ liệu từ Telegram gửi về
app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Route để Render kiểm tra xem app có đang sống không
app.get('/', (req, res) => {
    res.send('Bot is running on Render!');
});

// Bật server Express
app.listen(port, () => {
    console.log(`Express server is listening on port ${port}`);
});

const waitingForFile = new Set();

// --- HÀM GIẢI MÃ ---
async function processNpvFile(inputPath, outputPath, key, iv) {
    return new Promise((resolve, reject) => {
        try {
            const algorithm = 'aes-256-cbc';
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            const input = fs.createReadStream(inputPath);
            const output = fs.createWriteStream(outputPath);
            input.pipe(decipher).pipe(output);
            output.on('finish', () => resolve(true));
            decipher.on('error', () => reject(new Error('Sai Key/IV hoặc file không đúng định dạng.')));
        } catch (error) {
            reject(error);
        }
    });
}

// --- LUỒNG TƯƠNG TÁC ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const options = {
        reply_markup: {
            inline_keyboard: [[{ text: '🔓 Bắt đầu giải mã file .npv', callback_data: 'start_decrypt' }]]
        }
    };
    bot.sendMessage(chatId, 'Chào mừng bạn đến với Bot. Bấm nút bên dưới để bắt đầu.', options);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'start_decrypt') {
        waitingForFile.add(chatId);
        bot.sendMessage(chatId, '📎 Vui lòng đính kèm file `.npv` của bạn vào đây.', { parse_mode: 'Markdown' });
        bot.answerCallbackQuery(query.id);
    }
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    if (!waitingForFile.has(chatId)) return;

    const document = msg.document;
    if (!document.file_name.endsWith('.npv')) {
        return bot.sendMessage(chatId, '❌ Chỉ chấp nhận file .npv!');
    }

    bot.sendMessage(chatId, '⏳ Đang xử lý...');

    try {
        const downloadPath = await bot.downloadFile(document.file_id, __dirname);
        const decryptedPath = path.join(__dirname, 'decrypted_' + document.file_name + '.txt');

        // Thay bằng Key/IV thật của bạn
        const MY_KEY = Buffer.from('0123456789abcdef0123456789abcdef'); 
        const MY_IV = Buffer.from('abcdef9876543210'); 

        await processNpvFile(downloadPath, decryptedPath, MY_KEY, MY_IV);

        await bot.sendDocument(chatId, decryptedPath, { caption: '✅ Thành công!' });

        fs.unlinkSync(downloadPath);
        fs.unlinkSync(decryptedPath);
        waitingForFile.delete(chatId);
    } catch (error) {
        bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
        waitingForFile.delete(chatId);
    }
});
