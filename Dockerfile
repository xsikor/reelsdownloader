# Use Node.js LTS Alpine image for smaller size
FROM node:20-alpine

# Install dependencies for better compatibility
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create directories for downloads, temp files, and metrics data
RUN mkdir -p downloads temp metrics-data

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Expose ports for bot and metrics dashboard
EXPOSE 3000 3001

# Default command runs the bot
CMD ["node", "bot.js"]