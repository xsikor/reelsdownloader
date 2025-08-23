# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Instagram Reels Downloader application built with Node.js that provides both CLI and Telegram bot interfaces for downloading Instagram videos. The project uses the `btch-downloader` package to handle Instagram's anti-scraping measures.

## Common Development Commands

### Running the Application
```bash
# Run CLI downloader
npm start
node index.js https://www.instagram.com/reel/XXXXX/

# Run Telegram bot
npm run bot

# Run bot with auto-restart (development)
npm run bot:dev

# Batch download from file
node index.js --batch urls.txt
```

### Docker Commands
```bash
# Build development image
docker build -t instagram-reels-bot .

# Build production image
docker build -f Dockerfile.prod -t instagram-reels-bot:prod .

# Run services
docker-compose up -d bot
docker-compose run --rm cli <URL>
```

## Architecture & Key Components

### Core Modules

1. **downloader.js** - Core download logic
   - Uses `btch-downloader` for Instagram content fetching
   - Handles URL validation, metadata extraction, and file downloading
   - Implements retry logic and progress tracking
   - Key functions: `downloadInstagramReel()`, `extractInstagramId()`, `validateInstagramUrl()`

2. **bot.js** - Telegram bot implementation
   - Listens for Instagram URLs in messages
   - Downloads to `/temp` directory with automatic cleanup
   - Handles Telegram's 50MB file size limit
   - Manages download queue and error handling

3. **index.js** - CLI entry point
   - Uses `commander` for argument parsing
   - Supports single and batch downloads
   - Provides progress indicators with `ora`

4. **metrics.js** - Comprehensive metrics system
   - Tracks request statistics, performance data, and chat activity
   - Implements rate limiting and health monitoring
   - Provides real-time analytics and historical reporting
   - Key functions: `recordRequest()`, `getGlobalMetrics()`, `getChatMetrics()`

5. **metricsStore.js** - Persistent metrics storage
   - Handles data persistence to JSON files
   - Configurable retention policies (default: keep forever)
   - Supports data export and backup functionality
   - Automatic cleanup based on retention settings

6. **rateLimiter.js** - Rate limiting system
   - Implements sliding window rate limiting
   - Different limits for private chats, groups, and global usage
   - Penalty system for abuse prevention
   - Configurable via environment variables

7. **metricsDashboard.js** - Web-based metrics dashboard
   - Real-time metrics visualization via web interface
   - RESTful API for metrics access and monitoring
   - Health status and performance monitoring endpoints
   - Server-Sent Events for live updates

### Dependencies Structure
- **btch-downloader**: External service integration for bypassing Instagram restrictions
- **node-telegram-bot-api**: Telegram bot functionality
- **axios**: HTTP requests with proper error handling
- **commander**: CLI interface
- **ora**: Terminal progress indicators
- **express**: Web server for metrics dashboard

### Environment Configuration
Create `.env` file with:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Admin system (optional)
ADMIN_USER_IDS=123456789,987654321

# Metrics system (enabled by default in production)
ENABLE_METRICS=true

# Data retention (0 = keep forever, which is the default)
METRICS_RETENTION_REQUESTS=0
METRICS_RETENTION_PERFORMANCE=0  
METRICS_RETENTION_CHAT_METRICS=0

# Rate limiting (enabled by default)
ENABLE_RATE_LIMITING=true
RATE_LIMIT_PRIVATE_PER_MINUTE=10
RATE_LIMIT_GROUP_PER_MINUTE=20
```

See `.env.example` for complete configuration options and `METRICS_RETENTION.md` for detailed retention policy documentation.

### File Organization
- Downloads are saved to `./downloads/` by default
- Telegram bot uses `./temp/` for temporary storage
- Filenames follow pattern: `instagram_[username]_[postId]_[timestamp].mp4`

## Development Guidelines

### Error Handling Pattern
The codebase uses consistent error handling:
- URL validation before download attempts
- Graceful handling of network failures
- User-friendly error messages
- Proper cleanup on failures

### Docker Considerations
- Non-root user (`node:node`) for security
- Multi-stage builds for production optimization
- Health checks implemented via `healthcheck.js`
- Signal handling with `tini` for proper process management

### Adding New Features
When extending functionality:
1. Maintain separation between core download logic and interfaces
2. Use the existing `downloadInstagramReel()` function from `downloader.js`
3. Follow the error handling patterns (validate → attempt → handle errors)
4. Update both CLI and bot interfaces when adding download options

### Testing Instagram URLs
Valid URL formats:
- `https://www.instagram.com/reel/XXXXX/`
- `https://www.instagram.com/p/XXXXX/`
- `https://instagram.com/stories/username/XXXXX/`

### Debugging
- Bot includes `/start` command for testing
- Use `npm run bot:dev` for auto-restart during development
- Check console output for detailed error messages
- Docker logs: `docker-compose logs -f bot`