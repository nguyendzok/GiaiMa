# Sử dụng image chính thức của Microsoft có sẵn Playwright và trình duyệt
FROM mcr.microsoft.com/playwright/python:v1.42.0-jammy

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy file requirements và cài đặt thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ code của bạn vào container
COPY . .

# Lệnh khởi chạy bot
CMD ["python", "bot.py"]
