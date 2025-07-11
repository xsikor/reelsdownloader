# Instagram, TikTok & Facebook Video Downloader

A Node.js command-line tool and Telegram bot to download videos from Instagram, TikTok and Facebook.

## Features

- Download videos from Instagram (Reels and Posts)
- Download videos from TikTok
- Download videos from Facebook
- Batch download from a text file containing multiple URLs
- Progress indicator during download
- Automatic filename generation with platform and ID
- URL validation for all platforms
- Error handling for invalid or private content
- Telegram bot for downloading videos directly in chat

## Installation

1. Clone or download this repository
2. Install dependencies:
```bash
npm install
```

## Usage

### Download a single video

Instagram:
```bash
node index.js https://www.instagram.com/reel/XXXXXX/
```

TikTok:
```bash
node index.js https://www.tiktok.com/@username/video/1234567890
node index.js https://vm.tiktok.com/ABC123/
```

### Specify output directory

```bash
node index.js https://www.instagram.com/reel/XXXXXX/ --output ./my-videos
```

### Batch download from file

Create a text file with one URL per line (supports mixed platforms):
```text
https://www.instagram.com/reel/XXXXXX/
https://www.tiktok.com/@user/video/1234567890
https://www.instagram.com/p/ZZZZZZ/
https://vm.tiktok.com/ABC123/
```

Then run:
```bash
node index.js --batch urls.txt
```

### Command Options

- `-o, --output <dir>` - Specify output directory (default: ./downloads)
- `-b, --batch <file>` - Batch download from a file containing URLs
- `-h, --help` - Display help information
- `-V, --version` - Display version number

## Examples

1. Download Instagram reel:
```bash
node index.js https://www.instagram.com/reel/C9HytkYS4Hc/
```

2. Download TikTok video:
```bash
node index.js https://www.tiktok.com/@user/video/1234567890
```

3. Download to a specific folder:
```bash
node index.js https://www.instagram.com/reel/C9HytkYS4Hc/ -o ~/Desktop/videos
```

4. Batch download with custom output directory:
```bash
node index.js --batch my-urls.txt --output ./my-collection
```

## Output

Downloaded videos are saved with the following naming format:

**Instagram:**
- `instagram_reel_{postId}.mp4` or `instagram_reel_{timestamp}.mp4`

**TikTok:**
- `tiktok_video_{videoId}.mp4` or `tiktok_video_{timestamp}.mp4`

## Telegram Bot Usage

This tool also includes a Telegram bot that can download Instagram, TikTok and Facebook videos directly in your chat!

### Setting up the Bot

1. Create a new bot on Telegram:
   - Message [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow the instructions
   - Save the bot token you receive

2. Configure the bot:
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env and add your bot token
   # TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

3. Run the bot:
   ```bash
   # Run in normal mode
   npm run bot
   
   # Run in development mode (with auto-restart)
   npm run bot:dev
   ```

### Using the Bot

1. Start a chat with your bot on Telegram
2. Send `/start` to see the welcome message
3. Send any Instagram, TikTok or Facebook video URL
4. The bot will download and send you the video

### Bot Features

- Automatic URL detection - just paste the link
- Progress updates during download
- Support for multiple URLs in one message
- Automatic cleanup of old files
- File size validation (50MB Telegram limit)

### Bot Commands

- `/start` - Welcome message and instructions
- `/help` - Show help information

## Docker Usage

### Quick Start with Docker

1. Build and run the bot:
```bash
# Build the image
docker build -t instagram-reels-bot .

# Run the bot
docker run -d --name reels-bot \
  -e TELEGRAM_BOT_TOKEN=your_bot_token_here \
  instagram-reels-bot
```

2. Using Docker Compose:
```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your bot token

# Start the bot
docker-compose up -d bot

# View logs
docker-compose logs -f bot

# Stop the bot
docker-compose down
```

### Docker Commands

```bash
# Run CLI for single download
docker-compose run --rm cli https://www.instagram.com/reel/XXXXX/

# Run with custom output directory
docker-compose run --rm -v $(pwd)/my-videos:/app/downloads cli https://www.instagram.com/reel/XXXXX/

# Access bot logs
docker logs instagram-reels-bot

# Stop and remove containers
docker-compose down -v
```

### Production Deployment

For production, use the optimized Dockerfile:
```bash
docker build -f Dockerfile.prod -t instagram-reels-bot:prod .
```

## Requirements

- Node.js v14 or higher (for local development)
- npm (Node Package Manager)
- Telegram Bot Token (for bot functionality)
- Docker & Docker Compose (for containerized deployment)

## Note on Implementation

This tool uses the `btch-downloader` package which provides a reliable way to download content from Instagram, TikTok and Facebook. The package handles anti-scraping measures and provides video URLs through a proxy service.

## Limitations

- Only works with public content on all platforms
- Platforms may rate-limit requests if too many downloads are attempted
- Video quality depends on what the platforms provide
- The tool depends on third-party services which may occasionally be unavailable
- TikTok videos may include watermarks

## Troubleshooting

1. **"Invalid URL" error**: Make sure you're using the full URL including https://
2. **"Could not find video URL" error**: The post might not contain a video or might be private
3. **"fetch failed" error**: The download service might be temporarily unavailable, try again later
4. **Network errors**: Check your internet connection and try again
5. **TikTok URLs not working**: Ensure you're using the correct format (full URL with video ID)

## Disclaimer

This tool is for educational purposes only. Please respect the Terms of Service of Instagram, TikTok and Facebook, as well as content creators' rights when downloading content.