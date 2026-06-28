FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src

EXPOSE 3000
CMD ["node", "src/index.js"]
