#!/usr/bin/env node

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { downloadVideo, validateInstagramUrl, validateTikTokUrl, validateFacebookUrl } = require('./downloader');
const { getMetrics } = require('./metrics');
const { RateLimiter } = require('./rateLimiter');

// Bot configuration
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is required');
  console.error('Please set it in your .env file or as an environment variable');
  process.exit(1);
}

// Admin configuration - comma-separated list of user IDs
const adminIds = process.env.ADMIN_USER_IDS 
  ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : [];

if (adminIds.length > 0) {
  console.log(`🔐 Admin mode enabled for ${adminIds.length} user(s): ${adminIds.join(', ')}`);
} else {
  console.log('ℹ️  No admin users configured. All users can access bot commands.');
}

// Create bot instance
const bot = new TelegramBot(token, { polling: true });

// Initialize metrics system if enabled
const enableMetrics = process.env.ENABLE_METRICS === 'true' || process.env.NODE_ENV === 'production';
const metrics = enableMetrics ? getMetrics() : null;
const rateLimiter = enableMetrics ? new RateLimiter(metrics) : null;

if (enableMetrics) {
  console.log('📊 Metrics system enabled');
}

// Helper function to check if user is admin
function isUserAdmin(userId) {
  return adminIds.length === 0 || adminIds.includes(userId);
}

// Helper function to send admin-only error message
function sendAdminOnlyMessage(chatId, isGroupChat, messageId) {
  const adminOnlyMessage = adminIds.length > 0 
    ? '🔐 This command is restricted to administrators only.'
    : '❌ Admin functionality is disabled.';
  
  bot.sendMessage(chatId, adminOnlyMessage, {
    reply_to_message_id: isGroupChat ? messageId : undefined
  });
}

// Helper function to format latency in seconds with decimal precision
function formatLatency(latencyMs) {
  if (latencyMs < 1000) {
    return `${Math.round(latencyMs)}ms`;
  } else {
    const seconds = (latencyMs / 1000).toFixed(2);
    return `${seconds}s`;
  }
}

// Helper function to get chat name based on chat type
function getChatName(chat) {
  if (chat.type === 'private') {
    // For private chats: use first_name + last_name or username
    let name = chat.first_name || '';
    if (chat.last_name) {
      name += ' ' + chat.last_name;
    }
    if (!name && chat.username) {
      name = '@' + chat.username;
    }
    return name || 'Private Chat';
  } else if (chat.type === 'group' || chat.type === 'supergroup') {
    // For groups: use title
    return chat.title || 'Group Chat';
  } else {
    return 'Unknown Chat';
  }
}

// Temp directory for downloads
const TEMP_DIR = process.env.DOWNLOAD_DIR || path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Store active downloads to prevent duplicates
const activeDownloads = new Map();

console.log('🤖 Instagram, TikTok & Facebook Video Bot started successfully!');
console.log(`📁 Using temp directory: ${TEMP_DIR}`);
console.log('ℹ️  Note: For group chat support, disable privacy mode via @BotFather');

// Helper function to extract video URLs from text
function extractVideoUrls(text) {
  const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/(reel|p)\/[a-zA-Z0-9_-]+\/?[^\s]*/g;
  const tiktokRegex = /https?:\/\/(www\.|vm\.)?tiktok\.com\/(@[a-zA-Z0-9._-]+\/video\/\d+|[a-zA-Z0-9]+)\/?[^\s]*/g;
  const facebookRegex = /https?:\/\/(www\.|m\.)?facebook\.com\/[^\s]*|https?:\/\/fb\.watch\/[^\s]*/g;

  const instagramUrls = text.match(instagramRegex) || [];
  const tiktokUrls = text.match(tiktokRegex) || [];
  const facebookUrls = text.match(facebookRegex) || [];

  return [...instagramUrls, ...tiktokUrls, ...facebookUrls];
}

// Helper function to detect platform from URL
function detectPlatform(url) {
  if (validateInstagramUrl(url)) return 'instagram';
  if (validateTikTokUrl(url)) return 'tiktok';
  if (validateFacebookUrl(url)) return 'facebook';
  return 'unknown';
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
🎬 *Welcome to Instagram, TikTok & Facebook Video Downloader Bot!*

Simply send me an Instagram, TikTok or Facebook video URL and I'll download it for you.

*How to use:*
1. Copy a video URL from Instagram, TikTok or Facebook
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

📘 *Facebook:*
• \`https://www.facebook.com/somepage/videos/123456/\`
• \`https://fb.watch/ABC123/\`

*Group Chat Support:*
${isGroupChat ? '✅ This bot is active in this group!' : '• Add me to groups to download videos there'}
• In groups, I'll reply to your message with the video
• Make sure my privacy mode is disabled (via @BotFather)

*Note:* Only public content can be downloaded.

${adminIds.length > 0 ? `
🔐 *Admin System Active*
Your User ID: \`${msg.from.id}\`
Admin Status: ${isUserAdmin(msg.from.id) ? '✅ Administrator' : '❌ Regular User'}
${isUserAdmin(msg.from.id) ? 'You can use /metrics and /health commands.' : 'Contact admin to access advanced features.'}
` : ''}
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
*Instagram, TikTok & Facebook Video Downloader Bot Help*

*Commands:*
/start - Welcome message
/help - Show this help message
/stats - Show your personal usage statistics

${adminIds.length > 0 ? `*Admin Commands:*
/metrics - Show global bot metrics
/health - System health check

*Your User ID:* \`${msg.from.id}\`
${isUserAdmin(msg.from.id) ? '✅ *You have admin access*' : '❌ *You do not have admin access*'}
` : ''}

*Usage:*
Just send me any Instagram, TikTok or Facebook video URL and I'll download it for you!

*Supported URLs:*
📸 *Instagram:*
• Instagram Reels
• Instagram Posts with videos

🎵 *TikTok:*
• TikTok videos
• TikTok short links (vm.tiktok.com)

📘 *Facebook:*
• Facebook videos
• fb.watch short links

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

// Handle /stats command - Show user statistics
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  if (!enableMetrics) {
    bot.sendMessage(chatId, '📊 Metrics are not enabled on this bot instance.', {
      reply_to_message_id: isGroupChat ? msg.message_id : undefined
    });
    return;
  }
  
  const chatMetrics = metrics.getChatMetrics(chatId);
  const rateLimitStatus = rateLimiter.checkRateLimit(chatId, msg.chat.type);
  
  const statsMessage = `
📊 *Your Bot Usage Statistics*

*Total Requests:* ${chatMetrics.totalRequests}
*Successful:* ${chatMetrics.successfulRequests}
*Failed:* ${chatMetrics.failedRequests}
*Success Rate:* ${chatMetrics.successRate}%

*Platform Breakdown:*
📸 Instagram: ${chatMetrics.platformBreakdown.instagram}
🎵 TikTok: ${chatMetrics.platformBreakdown.tiktok}
📘 Facebook: ${chatMetrics.platformBreakdown.facebook}

*Rate Limits:*
• Per minute: ${rateLimitStatus.current?.perMinute || 0}/${rateLimitStatus.limits?.perMinute || 'N/A'}
• Per hour: ${rateLimitStatus.current?.perHour || 0}/${rateLimitStatus.limits?.perHour || 'N/A'}

${chatMetrics.firstSeen ? `*First used:* ${new Date(chatMetrics.firstSeen).toLocaleDateString()}` : ''}
${chatMetrics.lastSeen ? `*Last used:* ${new Date(chatMetrics.lastSeen).toLocaleDateString()}` : ''}
  `;
  
  bot.sendMessage(chatId, statsMessage, { 
    parse_mode: 'Markdown',
    reply_to_message_id: isGroupChat ? msg.message_id : undefined
  });
});

// Handle /metrics command - Show global metrics (admin only)
bot.onText(/\/metrics/, (msg) => {
  const chatId = msg.chat.id;
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  // Check admin permissions
  if (!isUserAdmin(msg.from.id)) {
    sendAdminOnlyMessage(chatId, isGroupChat, msg.message_id);
    return;
  }
  
  if (!enableMetrics) {
    bot.sendMessage(chatId, '📊 Metrics are not enabled on this bot instance.', {
      reply_to_message_id: isGroupChat ? msg.message_id : undefined
    });
    return;
  }
  
  const globalMetrics = metrics.getGlobalMetrics();
  const healthStatus = metrics.getHealthStatus();
  const platformStats = metrics.getPlatformStats();
  
  const uptimeFormatted = Math.floor(globalMetrics.uptime / 1000 / 60);
  
  const metricsMessage = `
📊 *Global Bot Metrics*

*System Health:* ${healthStatus.healthy ? '✅ Healthy' : '❌ Issues Detected'}
*Uptime:* ${uptimeFormatted} minutes

*Total Statistics:*
• Requests: ${globalMetrics.counters.totalRequests}
• Success Rate: ${globalMetrics.performance.successRate}%
• Avg Latency: ${formatLatency(globalMetrics.performance.averageLatency)}
• Downloads: ${globalMetrics.performance.totalDownloads}

*Platform Distribution:*
📸 Instagram: ${platformStats.instagram}%
🎵 TikTok: ${platformStats.tiktok}%
📘 Facebook: ${platformStats.facebook}%

*Chat Types:*
👤 Private: ${globalMetrics.counters.requestsByChatType.private || 0}
👥 Groups: ${(globalMetrics.counters.requestsByChatType.group || 0) + (globalMetrics.counters.requestsByChatType.supergroup || 0)}

*Active Rate Limiters:* ${globalMetrics.activeWindows}
  `;
  
  bot.sendMessage(chatId, metricsMessage, { 
    parse_mode: 'Markdown',
    reply_to_message_id: isGroupChat ? msg.message_id : undefined
  });
});

// Handle /health command - System health check (admin only)
bot.onText(/\/health/, (msg) => {
  const chatId = msg.chat.id;
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  // Check admin permissions
  if (!isUserAdmin(msg.from.id)) {
    sendAdminOnlyMessage(chatId, isGroupChat, msg.message_id);
    return;
  }
  
  if (!enableMetrics) {
    bot.sendMessage(chatId, '✅ Bot is running (metrics disabled)', {
      reply_to_message_id: isGroupChat ? msg.message_id : undefined
    });
    return;
  }
  
  const healthStatus = metrics.getHealthStatus();
  const memUsage = process.memoryUsage();
  
  const healthMessage = `
🏥 *System Health Check*

*Overall Status:* ${healthStatus.healthy ? '✅ Healthy' : '❌ Unhealthy'}
*Uptime:* ${Math.floor(healthStatus.uptime / 1000 / 60)} minutes
*Total Requests:* ${healthStatus.totalRequests}
*Recent Failure Rate:* ${healthStatus.recentFailureRate}%

*Memory Usage:*
• RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB
• Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB
• External: ${Math.round(memUsage.external / 1024 / 1024)}MB

*Timestamp:* ${new Date(healthStatus.timestamp).toLocaleString()}
  `;
  
  bot.sendMessage(chatId, healthMessage, { 
    parse_mode: 'Markdown',
    reply_to_message_id: isGroupChat ? msg.message_id : undefined
  });
});

// /top10 command - Show top 10 most active chats
bot.onText(/\/top10/, (msg) => {
  const chatId = msg.chat.id;
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  // Check admin permissions
  if (!isUserAdmin(msg.from.id)) {
    sendAdminOnlyMessage(chatId, isGroupChat, msg.message_id);
    return;
  }
  
  if (!enableMetrics) {
    bot.sendMessage(chatId, '❌ Metrics system is disabled', {
      reply_to_message_id: isGroupChat ? msg.message_id : undefined
    });
    return;
  }
  
  const topChats = metrics.getTopChats(10);
  
  if (topChats.length === 0) {
    bot.sendMessage(chatId, '📊 No chat activity recorded yet.', {
      reply_to_message_id: isGroupChat ? msg.message_id : undefined
    });
    return;
  }
  
  let message = '🏆 *Top 10 Most Active Chats*\n\n';
  
  topChats.forEach((chat, index) => {
    const rank = index + 1;
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const chatTypeEmoji = chat.chatType === 'private' ? '👤' : '👥';
    
    // Format chat name (truncate if too long)
    const displayName = chat.chatName.length > 25 
      ? chat.chatName.substring(0, 22) + '...' 
      : chat.chatName;
    
    message += `${rankEmoji} ${chatTypeEmoji} *${displayName}*\n`;
    message += `   📊 ${chat.totalRequests} requests (${chat.successRate}% success)\n`;
    message += `   🆔 \`${chat.chatId}\`\n\n`;
  });
  
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    reply_to_message_id: isGroupChat ? msg.message_id : undefined
  });
});

// /migrate_chat_names command - Update missing chat names for existing data (admin only)
bot.onText(/\/migrate_chat_names/, async (msg) => {
  const chatId = msg.chat.id;
  const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
  
  // Check admin permissions
  if (!isUserAdmin(msg.from.id)) {
    sendAdminOnlyMessage(chatId, isGroupChat, msg.message_id);
    return;
  }
  
  if (!enableMetrics) {
    bot.sendMessage(chatId, '❌ Metrics system is disabled', {
      reply_to_message_id: isGroupChat ? msg.message_id : undefined
    });
    return;
  }
  
  // Send initial message
  const statusMessage = await bot.sendMessage(chatId, '🔄 Starting chat name migration...', {
    reply_to_message_id: isGroupChat ? msg.message_id : undefined
  });
  
  try {
    // Run the migration
    await metrics.updateMissingChatNames(bot);
    
    // Update the status message
    bot.editMessageText('✅ Chat name migration completed successfully! Check console for details.', {
      chat_id: chatId,
      message_id: statusMessage.message_id
    });
  } catch (error) {
    console.error('Migration error:', error);
    bot.editMessageText('❌ Chat name migration failed. Check console for error details.', {
      chat_id: chatId,
      message_id: statusMessage.message_id
    });
  }
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
  
  // Check rate limits if metrics are enabled
  if (enableMetrics && rateLimiter) {
    const rateLimitCheck = rateLimiter.checkRateLimit(chatId, msg.chat.type);
    
    if (!rateLimitCheck.allowed) {
      const warningEmoji = rateLimitCheck.reason === 'penalty' ? '🚫' : '⏳';
      bot.sendMessage(chatId, `${warningEmoji} ${rateLimitCheck.message}`, {
        reply_to_message_id: isGroupChat ? msg.message_id : undefined
      });
      
      // Record failed request due to rate limiting
      if (metrics) {
        const platform = detectPlatform(urls[0]);
        const chatName = getChatName(msg.chat);
        metrics.recordRequest(chatId, msg.chat.type, platform, false, chatName);
      }
      return;
    }
    
    // Show warning if approaching limits
    if (rateLimitCheck.warning) {
      bot.sendMessage(chatId, rateLimitCheck.warning.message, {
        reply_to_message_id: isGroupChat ? msg.message_id : undefined
      });
    }
  }
  
  // Log activity with chat type
  console.log(`📨 Processing ${urls.length} URL(s) from ${msg.chat.type} chat ${chatId}`);
  
  // Process each URL
  for (const url of urls) {
    const startTime = Date.now();
    let platform = detectPlatform(url);
    let downloadSuccess = false;
    let fileSizeBytes = 0;
    
    try {
      // Check if already downloading
      if (activeDownloads.has(`${chatId}-${url}`)) {
        bot.sendMessage(chatId, '⏳ This URL is already being processed. Please wait...', {
          reply_to_message_id: isGroupChat ? msg.message_id : undefined
        });
        continue;
      }
      
      // Validate URL
      if (!validateInstagramUrl(url) && !validateTikTokUrl(url) && !validateFacebookUrl(url)) {
        bot.sendMessage(chatId, `❌ Invalid URL: ${url}\nPlease provide a valid Instagram, TikTok or Facebook URL.`, {
          reply_to_message_id: isGroupChat ? msg.message_id : undefined
        });
        
        // Record failed request due to invalid URL
        if (enableMetrics && metrics) {
          const chatName = getChatName(msg.chat);
          metrics.recordRequest(chatId, msg.chat.type, platform, false, chatName);
          rateLimiter?.onRequestFailed(chatId, new Error('Invalid URL'));
        }
        continue;
      }
      
      // Mark as active download
      activeDownloads.set(`${chatId}-${url}`, true);
      
      // Determine platform for better messaging
      const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
      
      // Send initial status message
      const statusMsg = await bot.sendMessage(chatId, `🔍 Fetching ${platformName} video data from:\n${url}`, {
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
          supports_streaming: true,
          reply_to_message_id: isGroupChat ? msg.message_id : undefined
        });
        
        // Delete status message
        await bot.deleteMessage(chatId, statusMsg.message_id);
        
        // Clean up the file
        fileSizeBytes = fs.statSync(result.path).size;
        fs.unlinkSync(result.path);
        downloadSuccess = true;
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
        
        // Record metrics if enabled
        if (enableMetrics && metrics) {
          const latencyMs = Date.now() - startTime;
          
          // Record request metrics
          const chatName = getChatName(msg.chat);
          metrics.recordRequest(chatId, msg.chat.type, platform, downloadSuccess, chatName);
          
          // Record performance metrics
          if (downloadSuccess) {
            metrics.recordDownloadMetrics(chatId, platform, latencyMs, fileSizeBytes);
            rateLimiter?.onRequestSuccess(chatId);
          } else {
            metrics.recordDownloadMetrics(chatId, platform, latencyMs, 0, new Error('Download failed'));
            rateLimiter?.onRequestFailed(chatId, new Error('Download failed'));
          }
        }
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

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n👋 Bot is shutting down (${signal})...`);
  bot.stopPolling();
  
  // Shutdown metrics system
  if (enableMetrics && metrics) {
    console.log('📊 Saving metrics data...');
    await metrics.shutdown();
  }
  
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
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

console.log('👂 Bot is listening for messages...');