FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci \
  && apk del .build-deps

FROM node:20-alpine AS dev
RUN apk add --no-cache unzip
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npx", "tsx", "watch", "src/app.ts"]

FROM node:20-alpine AS prod
RUN apk add --no-cache unzip
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "src/app.ts"]
