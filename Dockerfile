# Stage 1: Build & Package Entire App
FROM node:20-alpine

WORKDIR /app

# Enable the compiler to route all calls locally through the container's REST API,
# bypassing Google Firebase completely at build-time.
ENV VITE_LOCAL_BACKEND=true
ENV NODE_ENV=production

# Install package dependencies (devDependencies included: the build needs Vite/esbuild
# even though NODE_ENV=production is set for the runtime server)
COPY package*.json ./
RUN npm ci --include=dev

# Copy codebase
COPY . .

# Run production compilation:
# - Compiles React assets into the "dist/" static folder
# - Bundles the custom Express backend server.ts into "dist/server.cjs"
RUN npm run build

# Expose server listener port (3000)
EXPOSE 3000

# Declare persistent data volume holding db.json and local uploads folder
VOLUME [ "/app/data" ]

# Start Node production server
CMD [ "npm", "run", "start" ]
