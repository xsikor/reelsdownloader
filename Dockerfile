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

# Create directories for downloads and temp files
RUN mkdir -p downloads temp

# Create non-root user to run the app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Copy health check script
COPY healthcheck.js .

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Expose port (optional, for potential future web interface)
EXPOSE 3000

# Default command runs the bot
CMD ["node", "bot.js"]