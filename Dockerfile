FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache bash

COPY package*.json ./
COPY tsconfig.json ./
RUN npm install
RUN npm install --no-save ts-node typescript

COPY . .

RUN npm run build

RUN chmod +x docker-entrypoint.sh

EXPOSE 8124

ENTRYPOINT ["./docker-entrypoint.sh"]
