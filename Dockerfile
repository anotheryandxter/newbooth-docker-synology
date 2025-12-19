FROM node:20-alpine

RUN apk add --no-cache python3 make g++ gcc musl-dev cairo-dev jpeg-dev pango-dev giflib-dev pixman-dev pkgconfig

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

RUN mkdir -p public/gallery public/galleries public/qr public/assets/overlays database logs temp backups data

RUN chmod -R 755 /app

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
