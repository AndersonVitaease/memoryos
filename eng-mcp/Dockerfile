FROM node:24.19.0-bookworm

# OCR-01: engineering.ocr.read runs tesseract + poppler behind a pinned Python venv.
COPY src/ocr/requirements.txt /tmp/ocr-requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ripgrep tesseract-ocr tesseract-ocr-eng tesseract-ocr-por tesseract-ocr-osd poppler-utils python3-venv \
    && python3 -m venv /opt/ocr-venv \
    && /opt/ocr-venv/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/ocr-requirements.txt \
    && rm -rf /var/lib/apt/lists/* /tmp/ocr-requirements.txt

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY .claude ./.claude

CMD node --import tsx src/main.ts
