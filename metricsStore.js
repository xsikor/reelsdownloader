const fs = require('fs');
const path = require('path');

class MetricsStore {
  constructor(dataDir = path.join(__dirname, 'metrics-data')) {
    this.dataDir = dataDir;
    this.metricsFile = path.join(dataDir, 'metrics.json');
    this.requestsFile = path.join(dataDir, 'requests.json');
    this.performanceFile = path.join(dataDir, 'performance.json');
    
    // In-memory data structures for fast access
    this.requests = [];
    this.performanceData = [];
    this.chatMetrics = new Map();
    
    // Data retention settings (in milliseconds)
    // Set to 0 or very large values to preserve data forever
    this.retentionPeriods = {
      requests: process.env.METRICS_RETENTION_REQUESTS ? 
        parseInt(process.env.METRICS_RETENTION_REQUESTS) : 0,     // 0 = keep forever
      performance: process.env.METRICS_RETENTION_PERFORMANCE ? 
        parseInt(process.env.METRICS_RETENTION_PERFORMANCE) : 0,  // 0 = keep forever  
      chatMetrics: process.env.METRICS_RETENTION_CHAT_METRICS ? 
        parseInt(process.env.METRICS_RETENTION_CHAT_METRICS) : 0  // 0 = keep forever
    };
    
    // Log retention settings on startup
    console.log('📊 Metrics retention settings:');
    console.log(`   Requests: ${this.retentionPeriods.requests === 0 ? 'Forever' : `${Math.floor(this.retentionPeriods.requests / (24 * 60 * 60 * 1000))} days`}`);
    console.log(`   Performance: ${this.retentionPeriods.performance === 0 ? 'Forever' : `${Math.floor(this.retentionPeriods.performance / (60 * 60 * 1000))} hours`}`);
    console.log(`   Chat Metrics: ${this.retentionPeriods.chatMetrics === 0 ? 'Forever' : `${Math.floor(this.retentionPeriods.chatMetrics / (24 * 60 * 60 * 1000))} days`}`);
    
    this.ensureDataDirectory();
    this.loadData();
  }

  // Ensure data directory exists
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Load existing data from files
  loadData() {
    try {
      // Load requests data
      if (fs.existsSync(this.requestsFile)) {
        const requestsData = JSON.parse(fs.readFileSync(this.requestsFile, 'utf8'));
        this.requests = requestsData.requests || [];
      }
      
      // Load performance data
      if (fs.existsSync(this.performanceFile)) {
        const performanceData = JSON.parse(fs.readFileSync(this.performanceFile, 'utf8'));
        this.performanceData = performanceData.performance || [];
      }
      
      // Load metrics summary
      if (fs.existsSync(this.metricsFile)) {
        const metricsData = JSON.parse(fs.readFileSync(this.metricsFile, 'utf8'));
        if (metricsData.chatMetrics) {
          this.chatMetrics = new Map(Object.entries(metricsData.chatMetrics));
        }
      }
      
      console.log(`📊 Loaded ${this.requests.length} requests and ${this.performanceData.length} performance records`);
      
    } catch (error) {
      console.warn('Warning: Could not load existing metrics data:', error.message);
      // Continue with empty data structures
    }
  }

  // Add a new request record
  addRequest(requestData) {
    this.requests.push(requestData);
    
    // Update chat-specific metrics
    const chatId = requestData.chatId;
    if (!this.chatMetrics.has(chatId)) {
      this.chatMetrics.set(chatId, {
        chatId,
        chatName: requestData.chatName || 'Unknown',
        chatType: requestData.chatType || 'private',
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        platformBreakdown: { instagram: 0, tiktok: 0, facebook: 0 },
        firstSeen: requestData.timestamp,
        lastSeen: requestData.timestamp
      });
    }
    
    const chatMetric = this.chatMetrics.get(chatId);
    chatMetric.totalRequests++;
    chatMetric.lastSeen = requestData.timestamp;
    
    // Update chat name if provided (in case it changed or was missing)
    if (requestData.chatName) {
      chatMetric.chatName = requestData.chatName;
    }
    if (requestData.chatType) {
      chatMetric.chatType = requestData.chatType;
    }
    
    if (requestData.isSuccess) {
      chatMetric.successfulRequests++;
    } else {
      chatMetric.failedRequests++;
    }
    
    if (chatMetric.platformBreakdown[requestData.platform] !== undefined) {
      chatMetric.platformBreakdown[requestData.platform]++;
    }
    
    // Limit in-memory storage to prevent memory leaks
    if (this.requests.length > 10000) {
      this.requests = this.requests.slice(-5000); // Keep last 5000
    }
  }

  // Add performance data
  addPerformanceData(performanceData) {
    this.performanceData.push(performanceData);
    
    // Limit in-memory storage
    if (this.performanceData.length > 5000) {
      this.performanceData = this.performanceData.slice(-2500);
    }
  }

  // Get metrics for a specific chat
  getChatMetrics(chatId) {
    const chatMetric = this.chatMetrics.get(chatId);
    if (!chatMetric) {
      return {
        chatId,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        platformBreakdown: { instagram: 0, tiktok: 0, facebook: 0 },
        firstSeen: null,
        lastSeen: null,
        successRate: '0.00'
      };
    }
    
    const successRate = chatMetric.totalRequests > 0 
      ? ((chatMetric.successfulRequests / chatMetric.totalRequests) * 100).toFixed(2)
      : '0.00';
    
    return {
      ...chatMetric,
      successRate
    };
  }

  // Get top active chats
  getTopChats(limit = 10) {
    return Array.from(this.chatMetrics.values())
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, limit)
      .map(chat => ({
        ...chat,
        successRate: chat.totalRequests > 0 
          ? ((chat.successfulRequests / chat.totalRequests) * 100).toFixed(2)
          : '0.00'
      }));
  }

  // Get recent activity
  getRecentActivity(minutesBack = 60) {
    const cutoff = Date.now() - (minutesBack * 60 * 1000);
    return this.requests.filter(req => req.timestamp > cutoff);
  }

  // Get recent failures
  getRecentFailures(minutesBack = 5) {
    const cutoff = Date.now() - (minutesBack * 60 * 1000);
    return this.requests.filter(req => req.timestamp > cutoff && !req.isSuccess);
  }

  // Get recent requests (all)
  getRecentRequests(minutesBack = 5) {
    const cutoff = Date.now() - (minutesBack * 60 * 1000);
    return this.requests.filter(req => req.timestamp > cutoff);
  }

  // Get hourly request distribution
  getHourlyDistribution(hoursBack = 24) {
    const now = Date.now();
    const hoursAgo = now - (hoursBack * 60 * 60 * 1000);
    const recentRequests = this.requests.filter(req => req.timestamp > hoursAgo);
    
    const distribution = {};
    for (let i = 0; i < hoursBack; i++) {
      const hour = new Date(now - (i * 60 * 60 * 1000)).getHours();
      distribution[hour] = 0;
    }
    
    recentRequests.forEach(req => {
      const hour = new Date(req.timestamp).getHours();
      distribution[hour] = (distribution[hour] || 0) + 1;
    });
    
    return distribution;
  }

  // Get platform performance comparison
  getPlatformPerformance() {
    const platformStats = {
      instagram: { count: 0, totalLatency: 0, totalSize: 0, failures: 0 },
      tiktok: { count: 0, totalLatency: 0, totalSize: 0, failures: 0 },
      facebook: { count: 0, totalLatency: 0, totalSize: 0, failures: 0 }
    };
    
    this.performanceData.forEach(perf => {
      if (platformStats[perf.platform]) {
        const stat = platformStats[perf.platform];
        stat.count++;
        
        if (!perf.error) {
          stat.totalLatency += perf.latencyMs || 0;
          stat.totalSize += perf.fileSizeBytes || 0;
        } else {
          stat.failures++;
        }
      }
    });
    
    // Calculate averages
    Object.keys(platformStats).forEach(platform => {
      const stat = platformStats[platform];
      stat.avgLatency = stat.count > 0 ? Math.round(stat.totalLatency / stat.count) : 0;
      stat.avgFileSize = stat.count > 0 ? Math.round(stat.totalSize / stat.count) : 0;
      stat.successRate = stat.count > 0 ? (((stat.count - stat.failures) / stat.count) * 100).toFixed(2) : '0.00';
    });
    
    return platformStats;
  }

  // Get request volume by time intervals
  getRequestVolume(intervalMinutes = 5, periodsBack = 12) {
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    const volumes = [];
    
    for (let i = 0; i < periodsBack; i++) {
      const periodStart = now - ((i + 1) * intervalMs);
      const periodEnd = now - (i * intervalMs);
      
      const requestsInPeriod = this.requests.filter(req => 
        req.timestamp >= periodStart && req.timestamp < periodEnd
      );
      
      volumes.unshift({
        timestamp: periodEnd,
        period: `${new Date(periodEnd).toLocaleTimeString()} (${intervalMinutes}m)`,
        requests: requestsInPeriod.length,
        successes: requestsInPeriod.filter(r => r.isSuccess).length,
        failures: requestsInPeriod.filter(r => !r.isSuccess).length
      });
    }
    
    return volumes;
  }

  // Persist data to files
  async persistData() {
    try {
      // Save requests
      const requestsData = {
        timestamp: Date.now(),
        requests: this.requests
      };
      fs.writeFileSync(this.requestsFile, JSON.stringify(requestsData, null, 2));
      
      // Save performance data
      const performanceData = {
        timestamp: Date.now(),
        performance: this.performanceData
      };
      fs.writeFileSync(this.performanceFile, JSON.stringify(performanceData, null, 2));
      
      // Save metrics summary
      const metricsData = {
        timestamp: Date.now(),
        chatMetrics: Object.fromEntries(this.chatMetrics)
      };
      fs.writeFileSync(this.metricsFile, JSON.stringify(metricsData, null, 2));
      
      console.log('📊 Metrics data persisted successfully');
      
    } catch (error) {
      console.error('Error persisting metrics data:', error);
    }
  }

  // Clean old data based on retention periods
  cleanOldData() {
    const now = Date.now();
    let cleaned = 0;
    
    // Clean old requests (only if retention period is set)
    if (this.retentionPeriods.requests > 0) {
      const requestsCutoff = now - this.retentionPeriods.requests;
      const originalRequestsLength = this.requests.length;
      this.requests = this.requests.filter(req => req.timestamp > requestsCutoff);
      cleaned += originalRequestsLength - this.requests.length;
    }
    
    // Clean old performance data (only if retention period is set)
    if (this.retentionPeriods.performance > 0) {
      const performanceCutoff = now - this.retentionPeriods.performance;
      const originalPerformanceLength = this.performanceData.length;
      this.performanceData = this.performanceData.filter(perf => perf.timestamp > performanceCutoff);
      cleaned += originalPerformanceLength - this.performanceData.length;
    }
    
    // Clean old chat metrics (only if retention period is set)
    let chatsCleaned = 0;
    if (this.retentionPeriods.chatMetrics > 0) {
      const chatMetricsCutoff = now - this.retentionPeriods.chatMetrics;
      for (const [chatId, metrics] of this.chatMetrics.entries()) {
        if (metrics.lastSeen < chatMetricsCutoff) {
          this.chatMetrics.delete(chatId);
          chatsCleaned++;
        }
      }
      cleaned += chatsCleaned;
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} old records (${chatsCleaned} inactive chats)`);
    } else if (this.retentionPeriods.requests === 0 && this.retentionPeriods.performance === 0 && this.retentionPeriods.chatMetrics === 0) {
      console.log('📊 Data retention is set to forever - no records were cleaned');
    }
  }

  // Export data for backup or analysis
  exportData() {
    return {
      timestamp: Date.now(),
      requests: this.requests,
      performance: this.performanceData,
      chatMetrics: Object.fromEntries(this.chatMetrics),
      stats: {
        totalRequests: this.requests.length,
        totalPerformanceRecords: this.performanceData.length,
        totalChats: this.chatMetrics.size
      }
    };
  }

  // Get storage usage information
  getStorageInfo() {
    const getFileSize = (filePath) => {
      try {
        return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      } catch {
        return 0;
      }
    };
    
    return {
      files: {
        requests: {
          path: this.requestsFile,
          size: getFileSize(this.requestsFile),
          records: this.requests.length
        },
        performance: {
          path: this.performanceFile,
          size: getFileSize(this.performanceFile),
          records: this.performanceData.length
        },
        metrics: {
          path: this.metricsFile,
          size: getFileSize(this.metricsFile),
          chats: this.chatMetrics.size
        }
      },
      totalSize: getFileSize(this.requestsFile) + getFileSize(this.performanceFile) + getFileSize(this.metricsFile),
      dataDir: this.dataDir
    };
  }
}

module.exports = {
  MetricsStore
};