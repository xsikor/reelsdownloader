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

### Dependencies Structure
- **btch-downloader**: External service integration for bypassing Instagram restrictions
- **node-telegram-bot-api**: Telegram bot functionality
- **axios**: HTTP requests with proper error handling
- **commander**: CLI interface
- **ora**: Terminal progress indicators

### Environment Configuration
Create `.env` file with:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

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