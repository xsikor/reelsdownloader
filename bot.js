#!/usr/bin/env node

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { downloadVideo, validateInstagramUrl, validateTikTokUrl } = require('./downloader');

// Bot configuration
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is required');
  console.error('Please set it in your .env file or as an environment variable');
  process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(token, { polling: true });

// Temp directory for downloads
const TEMP_DIR = process.env.DOWNLOAD_DIR || path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Store active downloads to prevent duplicates
const activeDownloads = new Map();

console.log('🤖 Instagram & TikTok Video Bot started successfully!');
console.log(`📁 Using temp directory: ${TEMP_DIR}`);
console.log('ℹ️  Note: For group chat support, disable privacy mode via @BotFather');

// Helper function to extract video URLs from text
function extractVideoUrls(text) {
  const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(reel|p)\/[a-zA-Z0-9_-]+\/?[^\s]*/g;
  const tiktokRegex = /https?:\/\/(www\.|vm\.)?tiktok\.com\/(@[a-zA-Z0-9._-]+\/video\/\d+|[a-zA-Z0-9]+)\/?[^\s]*/g;
  
  const instagramUrls = text.match(instagramRegex) || [];
  const tiktokUrls = text.match(tiktokRegex) || [];
  
  return [...instagramUrls, ...tiktokUrls];
}

// Helper function to clean up old files
function cleanupOldFiles() {
  const files = fs.readdirSync(TEMP_DIR);
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  files.forEach(file => {
    const filePath = path.join(TEMP_DIR, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > maxAge) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Cleaned up old file: ${file}`);
    }
  });
}

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  const welcomeMessage = `
🎬 *Welcome to Instagram & TikTok Video Downloader Bot!*

Simply send me an Instagram or TikTok video URL and I'll download it for you.

*How to use:*
1. Copy a video URL from Instagram or TikTok
2. Send it to me
3. Wait for the download to complete
4. I'll send you the video file

*Supported URLs:*
📸 *Instagram:*
• \`https://www.instagram.com/reel/ABC123/\`
• \`https://www.instagram.com/p/XYZ789/\`

🎵 *TikTok:*
• \`https://www.tiktok.com/@username/video/123456\`
• \`https://vm.tiktok.com/ABC123/\`

*Group Chat Support:*
${isGroupChat ? '✅ This bot is active in this group!' : '• Add me to groups to download videos there'}
• In groups, I'll reply to your message with the video
• Make sure my privacy mode is disabled (via @BotFather)

*Note:* Only public content can be downloaded.
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_to_message_id: isGroupChat ? msg.message_id : undefined
  });
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  const helpMessage = `
*Instagram & TikTok Video Downloader Bot Help*

*Commands:*
/start - Welcome message
/help - Show this help message

*Usage:*
Just send me any Instagram or TikTok video URL and I'll download it for you!

*Supported URLs:*
📸 *Instagram:*
• Instagram Reels
• Instagram Posts with videos

🎵 *TikTok:*
• TikTok videos
• TikTok short links (vm.tiktok.com)

*Group Chat Features:*
• Works in group chats and supergroups
• Replies directly to your message with the video
• Requires privacy mode to be disabled (see @BotFather)

*Limitations:*
• Only public content
• Maximum file size: 50MB
• Videos are deleted after 1 hour
• Groups: max 20 messages per minute
  `;
  
  bot.sendMessage(chatId, helpMessage, { 
    parse_mode: 'Markdown',
    reply_to_message_id: isGroupChat ? msg.message_id : undefined
  });
});

// Handle all messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text || '';
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  // Skip if it's a command
  if (messageText.startsWith('/')) {
    return;
  }
  
  // Extract video URLs from the message
  const urls = extractVideoUrls(messageText);
  
  if (urls.length === 0) {
    return; // No video URLs found, ignore the message
  }
  
  // Log activity with chat type
  console.log(`📨 Processing ${urls.length} URL(s) from ${msg.chat.type} chat ${chatId}`);
  
  // Process each URL
  for (const url of urls) {
    try {
      // Check if already downloading
      if (activeDownloads.has(`${chatId}-${url}`)) {
        bot.sendMessage(chatId, '⏳ This URL is already being processed. Please wait...', {
          reply_to_message_id: isGroupChat ? msg.message_id : undefined
        });
        continue;
      }
      
      // Validate URL
      if (!validateInstagramUrl(url) && !validateTikTokUrl(url)) {
        bot.sendMessage(chatId, `❌ Invalid URL: ${url}\nPlease provide a valid Instagram or TikTok URL.`, {
          reply_to_message_id: isGroupChat ? msg.message_id : undefined
        });
        continue;
      }
      
      // Mark as active download
      activeDownloads.set(`${chatId}-${url}`, true);
      
      // Determine platform for better messaging
      const platform = validateInstagramUrl(url) ? 'Instagram' : 'TikTok';
      
      // Send initial status message
      const statusMsg = await bot.sendMessage(chatId, `🔍 Fetching ${platform} video data from:\n${url}`, {
        reply_to_message_id: isGroupChat ? msg.message_id : undefined
      });
      
      try {
        // Download the video
        const result = await downloadVideo(url, TEMP_DIR, {
          quiet: true,
          onProgress: async (percent) => {
            // Update progress every 20%
            if (percent % 20 === 0) {
              try {
                await bot.editMessageText(
                  `📥 Downloading video... ${percent}%\n${url}`,
                  {
                    chat_id: chatId,
                    message_id: statusMsg.message_id
                  }
                );
              } catch (e) {
                // Ignore edit errors
              }
            }
          }
        });
        
        // Update status
        await bot.editMessageText(
          `✅ Download complete! Sending video...\n${url}`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id
          }
        );
        
        // Check file size (Telegram limit is 50MB)
        const stats = fs.statSync(result.path);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        if (fileSizeMB > 50) {
          throw new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Telegram limit is 50MB.`);
        }
        
        // Send the video
        await bot.sendVideo(chatId, result.path, {
          caption: `🎬 Downloaded from: ${url}`,
          supports_streaming: true,
          reply_to_message_id: isGroupChat ? msg.message_id : undefined
        });
        
        // Delete status message
        await bot.deleteMessage(chatId, statusMsg.message_id);
        
        // Clean up the file
        fs.unlinkSync(result.path);
        console.log(`✅ Sent video to ${chatId} (${msg.chat.type}): ${result.filename}`);
        
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        
        // Update status with error
        await bot.editMessageText(
          `❌ Failed to download:\n${url}\n\nError: ${error.message}`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id
          }
        );
      } finally {
        // Remove from active downloads
        activeDownloads.delete(`${chatId}-${url}`);
      }
      
    } catch (error) {
      console.error('Unexpected error:', error);
      bot.sendMessage(chatId, `❌ An unexpected error occurred: ${error.message}`, {
        reply_to_message_id: isGroupChat ? msg.message_id : undefined
      });
    }
  }
});

// Handle polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Bot is shutting down...');
  bot.stopPolling();
  
  // Clean up temp files
  try {
    const files = fs.readdirSync(TEMP_DIR);
    files.forEach(file => {
      fs.unlinkSync(path.join(TEMP_DIR, file));
    });
    console.log('🗑️  Cleaned up temp files');
  } catch (e) {
    // Ignore cleanup errors
  }
  
  process.exit(0);
});

console.log('👂 Bot is listening for messages...');