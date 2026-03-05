import os
import telebot
from telebot.types import ReplyKeyboardMarkup, KeyboardButton
from playwright.sync_api import sync_playwright
import time
import random
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# Lấy Token từ biến môi trường
TOKEN = os.environ.get('BOT_TOKEN')
bot = telebot.TeleBot(TOKEN)

def hardcore_bypass(url, status_callback):
    """Hàm xử lý Playwright (giữ nguyên)"""
    try:
        with sync_playwright() as p:
            status_callback("⏳ [1/5] Đang khởi tạo trình duyệt ảo...")
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={'width': 1920, 'height': 1080}
            )
            page = context.new_page()
            
            status_callback("🌐 [2/5] Đang truy cập trang web rút gọn...")
            page.goto(url, timeout=60000)
            time.sleep(3)
            
            status_callback("📜 [3/5] Đang giả lập hành vi cuộn trang của người thật...")
            for _ in range(3):
                page.mouse.wheel(0, random.randint(300, 700))
                time.sleep(random.uniform(1, 2))
            page.mouse.wheel(0, -400)
            time.sleep(1)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            
            status_callback("🖱️ [4/5] Đang tìm kiếm quảng cáo & Chờ thời gian đếm ngược (khoảng 15-20s)...")
            time.sleep(15) 
            
            status_callback("🔍 [5/5] Đang trích xuất mã và lấy link trang đích...")
            time.sleep(5)
            
            final_url = page.url
            browser.close()
            
            if url in final_url or "m4" in final_url:
                return f"⚠️ Bot đã chạy xong nhưng web chưa nhả link. URL hiện tại: {final_url}"
            else:
                return final_url

    except Exception as e:
        return f"❌ Lỗi trong quá trình chạy: {str(e)}"

# ==========================================
# CÁC LỆNH CỦA TELEGRAM BOT
# ==========================================

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    markup = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=False)
    markup.add(KeyboardButton("🔗 Gửi link cần vượt"))
    bot.send_message(message.chat.id, "👋 Xin chào! Mình là Bot hỗ trợ vượt link tự động.\nHãy ấn nút bên dưới để bắt đầu nhé!", reply_markup=markup)

@bot.message_handler(func=lambda message: message.text == "🔗 Gửi link cần vượt")
def ask_for_link(message):
    bot.reply_to(message, "📝 Vui lòng dán link bạn cần vượt vào khung chat và gửi cho mình nhé 🔽")

@bot.message_handler(func=lambda message: "http" in message.text)
def handle_link(message):
    msg = bot.reply_to(message, "🚀 Bắt đầu tiếp nhận link...")
    
    def update_status(text):
        try:
            bot.edit_message_text(chat_id=message.chat.id, message_id=msg.message_id, text=text)
        except:
            pass

    result = hardcore_bypass(message.text, update_status)
    bot.edit_message_text(chat_id=message.chat.id, message_id=msg.message_id, 
                          text=f"✅ **HOÀN THÀNH!**\n\n🔗 **Link trang đích của bạn:**\n{result}",
                          parse_mode='Markdown', disable_web_page_preview=True)

# ==========================================
# SERVER GIẢ LẬP ĐỂ RENDER KHÔNG TẮT BOT
# ==========================================
class DummyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b"Bot is alive and running!")

def run_dummy_server():
    port = int(os.environ.get("PORT", 8080)) # Render tự động cấp Port
    server = HTTPServer(('0.0.0.0', port), DummyHandler)
    server.serve_forever()

if __name__ == '__main__':
    # Bật server giả lập ở một luồng riêng
    server_thread = threading.Thread(target=run_dummy_server)
    server_thread.daemon = True
    server_thread.start()

    # Sửa lỗi 409 Conflict bằng cách xóa Webhook cũ
    print("Đang dọn dẹp Webhook cũ (nếu có)...")
    try:
        bot.remove_webhook()
        time.sleep(1)
    except Exception as e:
        pass

    # Khởi động Bot
    print("Bot đang chạy... Bấm Ctrl+C để dừng.")
    bot.infinity_polling()
