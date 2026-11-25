FROM node:20-alpine

WORKDIR /app

# devDependencies are needed for the build (Vite/esbuild)
COPY package*.json ./
RUN npm ci --include=dev

COPY . .

# Builds the dashboard into dist/ and bundles server.ts into dist/server.cjs
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# db.json, uploads/ and secret.key
VOLUME [ "/app/data" ]

CMD [ "npm", "run", "start" ]
