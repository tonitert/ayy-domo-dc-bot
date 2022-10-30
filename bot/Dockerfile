FROM node:lts

WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN ./node_modules/typescript/bin/tsc
CMD ["node", "./dist/bot.js"]