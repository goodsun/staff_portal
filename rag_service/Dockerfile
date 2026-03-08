FROM python:3.11-slim

WORKDIR /app

# 依存関係インストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリコピー
COPY app.py .

# データディレクトリ
RUN mkdir -p /data/chroma

EXPOSE 3001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3001"]
