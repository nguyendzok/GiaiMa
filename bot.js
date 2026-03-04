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

// --- LƯU TRỮ TRẠNG THÁI NGƯỜI DÙNG ---
// Cấu trúc: { "chatId": { step: "WAITING_FILE" | "WAITING_KEY", filePath: "...", fileName: "..." } }
const userStates = {};

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
            decipher.on('error', () => reject(new Error('Key không hợp lệ hoặc file bị sai cấu trúc.')));
        } catch (error) {
            reject(error);
        }
    });
}

// --- BƯỚC 1: LỆNH START VÀ NÚT BẤM ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const options = {
        reply_markup: {
            inline_keyboard: [[{ text: '🔓 Bắt đầu giải mã file .npvt', callback_data: 'start_decrypt' }]]
        }
    };
    bot.sendMessage(chatId, 'Chào mừng bạn! Bấm nút bên dưới để bắt đầu luồng giải mã.', options);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'start_decrypt') {
        // Chuyển trạng thái sang chờ nhận file
        userStates[chatId] = { step: 'WAITING_FILE' };
        bot.sendMessage(chatId, '📎 Vui lòng đính kèm file `.npvt` của bạn vào đây.', { parse_mode: 'Markdown' });
        bot.answerCallbackQuery(query.id);
    }
});

// --- BƯỚC 2: NHẬN FILE VÀ HỎI KEY ---
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const state = userStates[chatId];

    // Bỏ qua nếu user không ở trạng thái chờ file
    if (!state || state.step !== 'WAITING_FILE') return;

    const document = msg.document;
    if (!document.file_name.endsWith('.npvt')) {
        return bot.sendMessage(chatId, '❌ Lỗi: Bot chỉ chấp nhận định dạng file .npvt!');
    }

    bot.sendMessage(chatId, '⏳ Đang lưu file. Vui lòng gửi tin nhắn chứa **Key giải mã** của file này:', { parse_mode: 'Markdown' });

    try {
        // Tải file về và lưu đường dẫn vào trạng thái của user
        const downloadPath = await bot.downloadFile(document.file_id, __dirname);
        userStates[chatId] = {
            step: 'WAITING_KEY',
            filePath: downloadPath,
            fileName: document.file_name
        };
    } catch (error) {
        bot.sendMessage(chatId, `❌ Lỗi khi tải file: ${error.message}`);
        delete userStates[chatId]; // Reset trạng thái nếu lỗi
    }
});

// --- BƯỚC 3: NHẬN KEY TỪ NGƯỜI DÙNG VÀ GIẢI MÃ ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates[chatId];

    // Bỏ qua nếu là lệnh start, file document, hoặc user không ở bước chờ Key
    if (!text || text.startsWith('/') || !state || state.step !== 'WAITING_KEY') return;

    bot.sendMessage(chatId, '⚙️ Đang tiến hành giải mã với Key bạn vừa cung cấp...');

    try {
        const decryptedPath = path.join(__dirname, 'decrypted_' + state.fileName + '.txt');

        // CHUẨN BỊ KEY: AES-256 yêu cầu Key phải dài chính xác 32 bytes (256 bits).
        // Đoạn code này sẽ lấy Key do user nhập, tự động cắt đi hoặc bù thêm số 0 cho đủ 32 bytes.
        let userKeyBuffer = Buffer.alloc(32); 
        Buffer.from(text, 'utf8').copy(userKeyBuffer);

        // LƯU Ý: IV (Vector khởi tạo) hiện tại vẫn đang được fix cứng. 
        // Nếu IV của bạn mỗi file mỗi khác, bạn sẽ cần tách nó từ header của file .npvt.
        const MY_IV = Buffer.from('abcdef9876543210'); 

        // Chạy hàm giải mã
        await processNpvtFile(state.filePath, decryptedPath, userKeyBuffer, MY_IV);

        // Gửi trả file
        await bot.sendDocument(chatId, decryptedPath, { caption: '✅ Giải mã thành công!' });

        // Dọn dẹp file tạm và reset trạng thái người dùng
        fs.unlinkSync(state.filePath);
        fs.unlinkSync(decryptedPath);
        delete userStates[chatId];

    } catch (error) {
        bot.sendMessage(chatId, `❌ Quá trình giải mã thất bại. Sai Key hoặc cấu trúc file không đúng.\nChi tiết: ${error.message}`);
        // Không xóa trạng thái để user có thể nhập lại Key khác cho file vừa gửi
        bot.sendMessage(chatId, '🔄 Bạn có thể thử gửi lại Key khác, hoặc gõ /start để làm lại từ đầu.');
    }
});
