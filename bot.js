require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL; 
const port = process.env.PORT || 3000;

const bot = new TelegramBot(token, { webHook: true });
if (url) {
    bot.setWebHook(`${url}/bot${token}`);
}

const app = express();
app.use(express.json());

app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.send('Bot is running on Render!');
});

app.listen(port, () => {
    console.log(`Express server is listening on port ${port}`);
});

const waitingForFile = new Set();

// --- HÀM GIẢI MÃ ---
async function processNpvtFile(inputPath, outputPath, key, iv) {
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
            inline_keyboard: [[{ text: '🔓 Bắt đầu giải mã file .npvt', callback_data: 'start_decrypt' }]]
        }
    };
    bot.sendMessage(chatId, 'Chào mừng bạn đến với Bot. Bấm nút bên dưới để bắt đầu.', options);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'start_decrypt') {
        waitingForFile.add(chatId);
        bot.sendMessage(chatId, '📎 Vui lòng đính kèm file `.npvt` của bạn vào đây.', { parse_mode: 'Markdown' });
        bot.answerCallbackQuery(query.id);
    }
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    if (!waitingForFile.has(chatId)) return;

    const document = msg.document;
    
    // Đã đổi đuôi file thành .npvt ở đây
    if (!document.file_name.endsWith('.npvt')) {
        return bot.sendMessage(chatId, '❌ Lỗi: Bot chỉ chấp nhận định dạng file .npvt!');
    }

    bot.sendMessage(chatId, '⏳ Đang xử lý file...');

    try {
        const downloadPath = await bot.downloadFile(document.file_id, __dirname);
        const decryptedPath = path.join(__dirname, 'decrypted_' + document.file_name + '.txt');

        // LƯU Ý: Thay bằng Key/IV thật của bạn dành cho file .npvt
        const MY_KEY = Buffer.from('0123456789abcdef0123456789abcdef'); 
        const MY_IV = Buffer.from('abcdef9876543210'); 

        await processNpvtFile(downloadPath, decryptedPath, MY_KEY, MY_IV);

        await bot.sendDocument(chatId, decryptedPath, { caption: '✅ Giải mã thành công!' });

        fs.unlinkSync(downloadPath);
        fs.unlinkSync(decryptedPath);
        waitingForFile.delete(chatId);
    } catch (error) {
        bot.sendMessage(chatId, `❌ Quá trình giải mã thất bại:\n${error.message}`);
        waitingForFile.delete(chatId);
    }
});
