FROM node:18-alpine

WORKDIR /app

ARG GIT_COMMIT_SHORT=nogit
ENV GIT_COMMIT_SHORT=$GIT_COMMIT_SHORT

RUN apk add --no-cache bash

COPY package*.json ./
RUN npm install
RUN npm install --no-save ts-node typescript

COPY . .

RUN npm run build

RUN chmod +x docker-entrypoint.sh

EXPOSE 8124

ENTRYPOINT ["./docker-entrypoint.sh"]
