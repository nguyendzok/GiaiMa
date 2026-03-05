import os
import telebot
from telebot.types import ReplyKeyboardMarkup, KeyboardButton
from playwright.sync_api import sync_playwright
import time
import random

# Lấy Token từ biến môi trường của Render
TOKEN = os.environ.get('BOT_TOKEN')
bot = telebot.TeleBot(TOKEN)

def hardcore_bypass(url, status_callback):
    """
    Hàm Playwright có thêm 'status_callback' để báo cáo tiến trình về cho Telegram
    """
    try:
        with sync_playwright() as p:
            # Báo cáo Bước 1
            status_callback("⏳ [1/5] Đang khởi tạo trình duyệt ảo...")
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={'width': 1920, 'height': 1080}
            )
            page = context.new_page()
            
            # Báo cáo Bước 2
            status_callback("🌐 [2/5] Đang truy cập trang web rút gọn...")
            page.goto(url, timeout=60000)
            time.sleep(3)
            
            # Báo cáo Bước 3
            status_callback("📜 [3/5] Đang giả lập hành vi cuộn trang của người thật...")
            for _ in range(3):
                page.mouse.wheel(0, random.randint(300, 700))
                time.sleep(random.uniform(1, 2))
            page.mouse.wheel(0, -400)
            time.sleep(1)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            
            # Báo cáo Bước 4
            status_callback("🖱️ [4/5] Đang tìm kiếm quảng cáo & Chờ thời gian đếm ngược (khoảng 15-20s)...")
            
            # (Đoạn code click quảng cáo ẩn đi cho gọn, web sẽ tự đếm ngược trong thời gian này)
            time.sleep(15) 
            
            # Báo cáo Bước 5
            status_callback("🔍 [5/5] Đang trích xuất mã và lấy link trang đích...")
            time.sleep(5)
            
            final_url = page.url
            browser.close()
            
            # Trả về kết quả cuối cùng
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
    """Xử lý lệnh /start và hiện nút bấm"""
    # Tạo nút bấm dưới bàn phím
    markup = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=False)
    btn = KeyboardButton("🔗 Gửi link cần vượt")
    markup.add(btn)
    
    bot.send_message(
        message.chat.id, 
        "👋 Xin chào! Mình là Bot hỗ trợ vượt link tự động.\nHãy ấn nút bên dưới để bắt đầu nhé!", 
        reply_markup=markup
    )

@bot.message_handler(func=lambda message: message.text == "🔗 Gửi link cần vượt")
def ask_for_link(message):
    """Xử lý khi người dùng bấm nút"""
    bot.reply_to(message, "📝 Vui lòng dán link bạn cần vượt vào khung chat và gửi cho mình nhé 🔽")

@bot.message_handler(func=lambda message: "http" in message.text)
def handle_link(message):
    """Xử lý khi người dùng gửi link"""
    # 1. Gửi tin nhắn trạng thái ban đầu và lưu lại message_id
    msg = bot.reply_to(message, "🚀 Bắt đầu tiếp nhận link...")
    
    # Hàm con để cập nhật tin nhắn (edit_message)
    def update_status(text):
        try:
            bot.edit_message_text(
                chat_id=message.chat.id, 
                message_id=msg.message_id, 
                text=text
            )
        except:
            # Bỏ qua lỗi nếu nội dung cập nhật bị trùng với nội dung cũ
            pass

    # 2. Gọi hàm vượt link và truyền hàm cập nhật trạng thái vào
    result = hardcore_bypass(message.text, update_status)
    
    # 3. BÁO CÁO HOÀN THÀNH VÀ IN RA LINK ĐÍCH
    thong_bao_hoan_thanh = f"✅ **HOÀN THÀNH!**\n\n🔗 **Link trang đích của bạn:**\n{result}"
    
    bot.edit_message_text(
        chat_id=message.chat.id, 
        message_id=msg.message_id, 
        text=thong_bao_hoan_thanh,
        parse_mode='Markdown',
        disable_web_page_preview=True
    )

if __name__ == '__main__':
    print("Bot đang chạy... Bấm Ctrl+C để dừng.")
    bot.infinity_polling()
