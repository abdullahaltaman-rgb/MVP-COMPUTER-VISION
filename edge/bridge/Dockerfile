FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY abyad_bridge ./abyad_bridge
COPY config.yaml .

# طابور offline-first على قرص دائم
VOLUME /data
ENV OUTBOX_DB=/data/outbox.db

CMD ["python", "-m", "abyad_bridge.main"]
