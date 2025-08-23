const EventEmitter = require('events');
const { MetricsStore } = require('./metricsStore');

class BotMetrics extends EventEmitter {
  constructor() {
    super();
    this.store = new MetricsStore();
    this.rateLimitWindows = new Map();
    this.startTime = Date.now();
    
    // In-memory counters for performance
    this.counters = {
      totalRequests: 0,
      totalFailures: 0,
      requestsByPlatform: {
        instagram: 0,
        tiktok: 0,
        facebook: 0
      },
      requestsByChatType: {
        private: 0,
        group: 0,
        supergroup: 0
      }
    };
    
    // Performance tracking
    this.performanceData = {
      totalLatency: 0,
      requestCount: 0,
      totalFileSize: 0,
      downloadCount: 0
    };
    
    // Rate limiting data
    this.rateLimits = {
      perMinute: 60,
      perHour: 1000,
      groupPerMinute: 20
    };
    
    // Initialize periodic data persistence
    this.startPeriodicSave();
    
    // Load and rebuild counters from stored data
    this.rebuildCountersFromStorage();
  }

  // Record a new request
  recordRequest(chatId, chatType, platform, isSuccess = true, chatName = null) {
    const timestamp = Date.now();
    const requestData = {
      timestamp,
      chatId: String(chatId),
      chatType,
      platform,
      isSuccess,
      chatName
    };
    
    // Update counters
    this.counters.totalRequests++;
    if (!isSuccess) {
      this.counters.totalFailures++;
    }
    
    this.counters.requestsByPlatform[platform] = 
      (this.counters.requestsByPlatform[platform] || 0) + 1;
    
    this.counters.requestsByChatType[chatType] = 
      (this.counters.requestsByChatType[chatType] || 0) + 1;
    
    // Store detailed request data
    this.store.addRequest(requestData);
    
    // Update rate limit windows
    this.updateRateLimitWindow(chatId, timestamp);
    
    // Emit event for real-time listeners
    this.emit('request', requestData);
    
    return requestData;
  }

  // Record download performance metrics
  recordDownloadMetrics(chatId, platform, latencyMs, fileSizeBytes, error = null) {
    const timestamp = Date.now();
    const performanceData = {
      timestamp,
      chatId: String(chatId),
      platform,
      latencyMs,
      fileSizeBytes,
      error: error ? error.message : null
    };
    
    if (!error) {
      this.performanceData.totalLatency += latencyMs;
      this.performanceData.requestCount++;
      this.performanceData.totalFileSize += fileSizeBytes || 0;
      this.performanceData.downloadCount++;
    }
    
    this.store.addPerformanceData(performanceData);
    this.emit('performance', performanceData);
    
    return performanceData;
  }

  // Update rate limit windows (sliding window implementation)
  updateRateLimitWindow(chatId, timestamp) {
    const chatKey = String(chatId);
    
    if (!this.rateLimitWindows.has(chatKey)) {
      this.rateLimitWindows.set(chatKey, []);
    }
    
    const window = this.rateLimitWindows.get(chatKey);
    window.push(timestamp);
    
    // Clean old entries (older than 1 hour)
    const oneHourAgo = timestamp - (60 * 60 * 1000);
    while (window.length > 0 && window[0] < oneHourAgo) {
      window.shift();
    }
  }

  // Check if request is within rate limits
  checkRateLimit(chatId, chatType) {
    const chatKey = String(chatId);
    const now = Date.now();
    const window = this.rateLimitWindows.get(chatKey) || [];
    
    // Count requests in last minute
    const oneMinuteAgo = now - (60 * 1000);
    const requestsLastMinute = window.filter(ts => ts > oneMinuteAgo).length;
    
    // Count requests in last hour
    const oneHourAgo = now - (60 * 60 * 1000);
    const requestsLastHour = window.filter(ts => ts > oneHourAgo).length;
    
    // Apply different limits based on chat type
    const minuteLimit = chatType === 'private' 
      ? this.rateLimits.perMinute 
      : this.rateLimits.groupPerMinute;
    
    return {
      allowed: requestsLastMinute < minuteLimit && requestsLastHour < this.rateLimits.perHour,
      requestsLastMinute,
      requestsLastHour,
      limits: {
        perMinute: minuteLimit,
        perHour: this.rateLimits.perHour
      }
    };
  }

  // Get metrics for a specific chat
  getChatMetrics(chatId) {
    return this.store.getChatMetrics(String(chatId));
  }

  // Get global metrics summary
  getGlobalMetrics() {
    const uptime = Date.now() - this.startTime;
    const avgLatency = this.performanceData.requestCount > 0 
      ? this.performanceData.totalLatency / this.performanceData.requestCount 
      : 0;
    
    const avgFileSize = this.performanceData.downloadCount > 0
      ? this.performanceData.totalFileSize / this.performanceData.downloadCount
      : 0;

    return {
      uptime,
      counters: { ...this.counters },
      performance: {
        averageLatency: Math.round(avgLatency),
        averageFileSize: Math.round(avgFileSize),
        totalDownloads: this.performanceData.downloadCount,
        successRate: this.counters.totalRequests > 0 
          ? ((this.counters.totalRequests - this.counters.totalFailures) / this.counters.totalRequests * 100).toFixed(2)
          : 100
      },
      rateLimits: this.rateLimits,
      activeWindows: this.rateLimitWindows.size
    };
  }

  // Get top active chats
  getTopChats(limit = 10) {
    return this.store.getTopChats(limit);
  }

  // Get platform usage statistics
  getPlatformStats() {
    const total = this.counters.totalRequests;
    if (total === 0) {
      return { instagram: 0, tiktok: 0, facebook: 0 };
    }

    return {
      instagram: ((this.counters.requestsByPlatform.instagram || 0) / total * 100).toFixed(1),
      tiktok: ((this.counters.requestsByPlatform.tiktok || 0) / total * 100).toFixed(1),
      facebook: ((this.counters.requestsByPlatform.facebook || 0) / total * 100).toFixed(1)
    };
  }

  // Get recent activity (last N minutes)
  getRecentActivity(minutesBack = 60) {
    return this.store.getRecentActivity(minutesBack);
  }

  // Health check
  getHealthStatus() {
    const metrics = this.getGlobalMetrics();
    const recentFailures = this.store.getRecentFailures(5); // Last 5 minutes
    
    const status = {
      healthy: true,
      uptime: metrics.uptime,
      totalRequests: metrics.counters.totalRequests,
      recentFailureRate: 0,
      memoryUsage: process.memoryUsage(),
      timestamp: Date.now()
    };

    // Calculate recent failure rate
    if (recentFailures.length > 0) {
      const recentTotal = this.store.getRecentRequests(5).length;
      status.recentFailureRate = recentTotal > 0 
        ? (recentFailures.length / recentTotal * 100).toFixed(2)
        : 0;
      
      // Mark unhealthy if failure rate > 50%
      if (status.recentFailureRate > 50) {
        status.healthy = false;
      }
    }

    return status;
  }

  // Start periodic data persistence
  startPeriodicSave() {
    // Save metrics every 5 minutes
    setInterval(async () => {
      await this.store.persistData();
    }, 5 * 60 * 1000);

    // Clean old data every hour
    setInterval(() => {
      this.store.cleanOldData();
    }, 60 * 60 * 1000);
  }

  // Rebuild counters from stored data
  rebuildCountersFromStorage() {
    console.log('📊 Rebuilding metrics counters from stored data...');
    
    // Reset counters
    this.counters = {
      totalRequests: 0,
      totalFailures: 0,
      requestsByPlatform: {
        instagram: 0,
        tiktok: 0,
        facebook: 0
      },
      requestsByChatType: {
        private: 0,
        group: 0,
        supergroup: 0
      }
    };
    
    this.performanceData = {
      totalLatency: 0,
      requestCount: 0,
      totalFileSize: 0,
      downloadCount: 0
    };
    
    // Rebuild from stored requests
    this.store.requests.forEach(request => {
      this.counters.totalRequests++;
      
      if (!request.isSuccess) {
        this.counters.totalFailures++;
      }
      
      // Platform breakdown
      if (this.counters.requestsByPlatform[request.platform] !== undefined) {
        this.counters.requestsByPlatform[request.platform]++;
      }
      
      // Chat type breakdown
      if (this.counters.requestsByChatType[request.chatType] !== undefined) {
        this.counters.requestsByChatType[request.chatType]++;
      }
    });
    
    // Rebuild from stored performance data
    this.store.performanceData.forEach(perf => {
      if (!perf.error) {
        this.performanceData.requestCount++;
        this.performanceData.totalLatency += perf.latencyMs || 0;
        this.performanceData.totalFileSize += perf.fileSizeBytes || 0;
        this.performanceData.downloadCount++;
      }
    });
    
    console.log(`📊 Rebuilt counters: ${this.counters.totalRequests} requests, ${this.counters.totalFailures} failures`);
  }

  // Migration: Update chat names for existing data (optional)
  async updateMissingChatNames(botInstance) {
    if (!botInstance) {
      console.log('⚠️  Bot instance required for chat name migration');
      return;
    }
    
    console.log('🔄 Starting chat name migration for existing data...');
    let updated = 0;
    let failed = 0;
    
    for (const [chatId, chatMetric] of this.store.chatMetrics.entries()) {
      // Skip if chat name is already set (not 'Unknown')
      if (chatMetric.chatName && chatMetric.chatName !== 'Unknown') {
        continue;
      }
      
      try {
        // Try to get chat info from Telegram API
        const chatInfo = await botInstance.getChat(chatId);
        const chatName = this.getChatNameFromApi(chatInfo);
        
        // Update the stored metric
        chatMetric.chatName = chatName;
        chatMetric.chatType = chatInfo.type || 'private';
        updated++;
        
        console.log(`✅ Updated chat ${chatId}: ${chatName}`);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failed++;
        console.log(`❌ Failed to get chat info for ${chatId}: ${error.message}`);
      }
    }
    
    console.log(`📊 Chat name migration completed: ${updated} updated, ${failed} failed`);
    
    // Persist the updates
    if (updated > 0) {
      await this.store.persistData();
    }
  }
  
  // Helper to extract chat name from Telegram API response
  getChatNameFromApi(chatInfo) {
    if (chatInfo.type === 'private') {
      let name = chatInfo.first_name || '';
      if (chatInfo.last_name) {
        name += ' ' + chatInfo.last_name;
      }
      if (!name && chatInfo.username) {
        name = '@' + chatInfo.username;
      }
      return name || 'Private Chat';
    } else if (chatInfo.type === 'group' || chatInfo.type === 'supergroup') {
      return chatInfo.title || 'Group Chat';
    } else {
      return 'Unknown Chat';
    }
  }

  // Graceful shutdown
  async shutdown() {
    await this.store.persistData();
    this.emit('shutdown');
  }
}

// Singleton instance
let metricsInstance = null;

function getMetrics() {
  if (!metricsInstance) {
    metricsInstance = new BotMetrics();
  }
  return metricsInstance;
}

module.exports = {
  BotMetrics,
  getMetrics
};