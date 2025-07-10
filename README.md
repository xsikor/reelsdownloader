# Instagram Reels Downloader

A Node.js command-line tool to download Instagram Reels videos.

## Features

- Download single Instagram Reels or posts with videos
- Batch download from a text file containing multiple URLs
- Progress indicator during download
- Automatic filename generation with username and post ID
- URL validation
- Error handling for invalid or private content

## Installation

1. Clone or download this repository
2. Install dependencies:
```bash
npm install
```

## Usage

### Download a single reel

```bash
node index.js https://www.instagram.com/reel/XXXXXX/
```

### Specify output directory

```bash
node index.js https://www.instagram.com/reel/XXXXXX/ --output ./my-videos
```

### Batch download from file

Create a text file with one URL per line:
```text
https://www.instagram.com/reel/XXXXXX/
https://www.instagram.com/reel/YYYYYY/
https://www.instagram.com/p/ZZZZZZ/
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

1. Download a single reel to default directory:
```bash
node index.js https://www.instagram.com/reel/C9HytkYS4Hc/
```

2. Download to a specific folder:
```bash
node index.js https://www.instagram.com/reel/C9HytkYS4Hc/ -o ~/Desktop/reels
```

3. Batch download with custom output directory:
```bash
node index.js --batch my-urls.txt --output ./my-collection
```

## Output

Downloaded videos are saved with the following naming format:
- `{username}_instagram_reel_{postId}.mp4`
- If username is not available: `instagram_reel_{postId}.mp4`
- If post ID cannot be extracted: `instagram_reel_{timestamp}.mp4`

## Telegram Bot Usage

This tool also includes a Telegram bot that can download Instagram Reels directly in your chat!

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
3. Send any Instagram Reel or Post URL
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

This tool uses the `btch-downloader` package which provides a reliable way to download Instagram content. The package handles Instagram's anti-scraping measures and provides video URLs through a proxy service.

## Limitations

- Only works with public Instagram content
- Instagram may rate-limit requests if too many downloads are attempted
- Video quality depends on what Instagram provides
- The tool depends on third-party services which may occasionally be unavailable

## Troubleshooting

1. **"Invalid Instagram URL" error**: Make sure you're using the full Instagram URL including https://
2. **"Could not find video URL" error**: The post might not contain a video or might be private
3. **"fetch failed" error**: The download service might be temporarily unavailable, try again later
4. **Network errors**: Check your internet connection and try again

## Disclaimer

This tool is for educational purposes only. Please respect Instagram's Terms of Service and content creators' rights when downloading content.