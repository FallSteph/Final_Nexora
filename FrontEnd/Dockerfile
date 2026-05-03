# Stage 1: Build the Vite app
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Set API URL so Vite bakes it into the production build
ENV VITE_API_URL=/julius_2026
RUN npm run build

# Stage 2: Serve with Express
FROM node:20-alpine
WORKDIR /app
# Copy the built assets and server file
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./
COPY --from=build /app/package*.json ./

# Install only production dependencies
RUN npm install --production

EXPOSE 3000
CMD ["node", "server.js"]
