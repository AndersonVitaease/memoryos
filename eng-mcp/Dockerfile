FROM node:24.19.0-bookworm

RUN apt-get update \
    && apt-get install -y git ripgrep \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY test ./test

CMD node --import tsx src/main.ts
