class RateLimiter {
  constructor(metrics) {
    this.metrics = metrics;
    
    // Check if rate limiting is enabled
    this.enabled = process.env.ENABLE_RATE_LIMITING !== 'false';
    
    // Rate limit configurations from environment variables with defaults
    this.limits = {
      // Per chat type limits
      private: {
        perMinute: parseInt(process.env.RATE_LIMIT_PRIVATE_PER_MINUTE) || 10,
        perHour: parseInt(process.env.RATE_LIMIT_PRIVATE_PER_HOUR) || 100,
        burstAllowance: parseInt(process.env.RATE_LIMIT_PRIVATE_BURST) || 3
      },
      group: {
        perMinute: parseInt(process.env.RATE_LIMIT_GROUP_PER_MINUTE) || 20,
        perHour: parseInt(process.env.RATE_LIMIT_GROUP_PER_HOUR) || 200,
        burstAllowance: parseInt(process.env.RATE_LIMIT_GROUP_BURST) || 5
      },
      supergroup: {
        perMinute: parseInt(process.env.RATE_LIMIT_SUPERGROUP_PER_MINUTE) || 15,
        perHour: parseInt(process.env.RATE_LIMIT_SUPERGROUP_PER_HOUR) || 150,
        burstAllowance: parseInt(process.env.RATE_LIMIT_SUPERGROUP_BURST) || 4
      },
      
      // Global limits
      global: {
        perMinute: parseInt(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE) || 100,
        perHour: parseInt(process.env.RATE_LIMIT_GLOBAL_PER_HOUR) || 2000
      }
    };
    
    // Penalty configurations
    this.penalties = {
      consecutiveFailures: {
        3: 30000,    // 30 seconds penalty after 3 failures
        5: 60000,    // 1 minute penalty after 5 failures
        10: 300000   // 5 minutes penalty after 10 failures
      },
      rapidFire: {
        threshold: 5,      // 5 requests in rapid succession
        timeWindow: 10000, // within 10 seconds
        penalty: 60000     // 1 minute penalty
      }
    };
    
    // Track penalties and warnings
    this.chatPenalties = new Map();
    this.chatWarnings = new Map();
    this.lastWarningCleanup = Date.now();
    
    // Global rate limiting
    this.globalRequestTimes = [];
    
    // Start penalty cleanup interval
    this.startPenaltyCleanup();
    
    if (!this.enabled) {
      console.log('⚠️  Rate limiting is disabled via environment variable');
    } else {
      console.log('🛡️  Rate limiting enabled with limits:', this.limits);
    }
  }

  // Check if a request is allowed for a specific chat
  checkRateLimit(chatId, chatType = 'private') {
    // If rate limiting is disabled, always allow requests
    if (!this.enabled) {
      return {
        allowed: true,
        reason: 'rate_limiting_disabled',
        message: 'Rate limiting is disabled',
        limits: this.limits[chatType] || this.limits.private
      };
    }
    
    const now = Date.now();
    const chatKey = String(chatId);
    
    // Check if chat is under penalty
    const penaltyInfo = this.checkChatPenalty(chatKey, now);
    if (penaltyInfo.penalized) {
      return {
        allowed: false,
        reason: 'penalty',
        message: `Rate limited due to ${penaltyInfo.reason}. Try again in ${Math.ceil(penaltyInfo.remainingMs / 1000)} seconds.`,
        retryAfter: penaltyInfo.remainingMs,
        limits: this.limits[chatType]
      };
    }
    
    // Check global rate limits
    const globalCheck = this.checkGlobalLimits(now);
    if (!globalCheck.allowed) {
      return {
        allowed: false,
        reason: 'global_limit',
        message: 'System is currently overloaded. Please try again later.',
        retryAfter: 60000, // 1 minute default
        limits: this.limits.global
      };
    }
    
    // Get chat-specific rate limit check from metrics
    const rateCheck = this.metrics.checkRateLimit(chatId, chatType);
    
    if (!rateCheck.allowed) {
      const isMinuteLimit = rateCheck.requestsLastMinute >= rateCheck.limits.perMinute;
      const limitType = isMinuteLimit ? 'per-minute' : 'per-hour';
      const remaining = isMinuteLimit ? 
        (60 - Math.floor((now % 60000) / 1000)) : 
        (3600 - Math.floor((now % 3600000) / 1000));
      
      return {
        allowed: false,
        reason: 'rate_limit',
        message: `Rate limit exceeded (${limitType}). Try again in ${remaining} seconds.`,
        retryAfter: remaining * 1000,
        current: {
          perMinute: rateCheck.requestsLastMinute,
          perHour: rateCheck.requestsLastHour
        },
        limits: rateCheck.limits
      };
    }
    
    // Check for rapid-fire requests
    const rapidFireCheck = this.checkRapidFire(chatKey, now);
    if (!rapidFireCheck.allowed) {
      this.applyPenalty(chatKey, 'rapid_fire', now);
      return {
        allowed: false,
        reason: 'rapid_fire',
        message: 'Too many rapid requests detected. Please slow down.',
        retryAfter: this.penalties.rapidFire.penalty,
        limits: this.limits[chatType]
      };
    }
    
    // Update global tracking
    this.updateGlobalTracking(now);
    
    // Issue warning if approaching limits
    const warning = this.checkForWarnings(chatKey, rateCheck, chatType);
    
    return {
      allowed: true,
      warning: warning,
      current: {
        perMinute: rateCheck.requestsLastMinute,
        perHour: rateCheck.requestsLastHour
      },
      limits: rateCheck.limits
    };
  }

  // Check if chat is currently under penalty
  checkChatPenalty(chatKey, now) {
    const penalty = this.chatPenalties.get(chatKey);
    if (!penalty) {
      return { penalized: false };
    }
    
    if (now < penalty.until) {
      return {
        penalized: true,
        reason: penalty.reason,
        remainingMs: penalty.until - now,
        appliedAt: penalty.appliedAt
      };
    }
    
    // Penalty expired, remove it
    this.chatPenalties.delete(chatKey);
    return { penalized: false };
  }

  // Check global system limits
  checkGlobalLimits(now) {
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    
    // Clean old entries
    this.globalRequestTimes = this.globalRequestTimes.filter(time => time > oneHourAgo);
    
    const requestsLastMinute = this.globalRequestTimes.filter(time => time > oneMinuteAgo).length;
    const requestsLastHour = this.globalRequestTimes.length;
    
    return {
      allowed: requestsLastMinute < this.limits.global.perMinute && 
               requestsLastHour < this.limits.global.perHour,
      current: {
        perMinute: requestsLastMinute,
        perHour: requestsLastHour
      }
    };
  }

  // Update global request tracking
  updateGlobalTracking(now) {
    this.globalRequestTimes.push(now);
    
    // Limit array size to prevent memory issues
    if (this.globalRequestTimes.length > 5000) {
      this.globalRequestTimes = this.globalRequestTimes.slice(-2500);
    }
  }

  // Check for rapid-fire requests
  checkRapidFire(chatKey, now) {
    const chatMetrics = this.metrics.store.getChatMetrics(chatKey);
    const recentRequests = this.metrics.store.getRecentRequests(1); // Last minute
    
    const chatRecentRequests = recentRequests
      .filter(req => req.chatId === chatKey)
      .map(req => req.timestamp);
    
    if (chatRecentRequests.length >= this.penalties.rapidFire.threshold) {
      // Check if requests were within rapid-fire window
      const oldestRecent = Math.min(...chatRecentRequests);
      const newestRecent = Math.max(...chatRecentRequests);
      
      if ((newestRecent - oldestRecent) < this.penalties.rapidFire.timeWindow) {
        return { allowed: false };
      }
    }
    
    return { allowed: true };
  }

  // Apply penalty to a chat
  applyPenalty(chatKey, reason, now) {
    let penaltyDuration;
    
    switch (reason) {
      case 'consecutive_failures':
        const failures = this.getRecentFailures(chatKey);
        penaltyDuration = this.penalties.consecutiveFailures[failures] || 300000;
        break;
      case 'rapid_fire':
        penaltyDuration = this.penalties.rapidFire.penalty;
        break;
      default:
        penaltyDuration = 60000; // Default 1 minute
    }
    
    this.chatPenalties.set(chatKey, {
      reason,
      appliedAt: now,
      until: now + penaltyDuration
    });
    
    console.log(`🚫 Applied ${reason} penalty to chat ${chatKey} for ${penaltyDuration / 1000}s`);
  }

  // Get recent failure count for a chat
  getRecentFailures(chatKey) {
    const recentFailures = this.metrics.store.getRecentFailures(10); // Last 10 minutes
    return recentFailures.filter(req => req.chatId === chatKey).length;
  }

  // Check for warnings to issue to users
  checkForWarnings(chatKey, rateCheck, chatType) {
    const now = Date.now();
    const limits = this.limits[chatType];
    
    const minuteUsage = rateCheck.requestsLastMinute / limits.perMinute;
    const hourUsage = rateCheck.requestsLastHour / limits.perHour;
    
    // Issue warning at 80% usage
    if (minuteUsage >= 0.8 || hourUsage >= 0.8) {
      const lastWarning = this.chatWarnings.get(chatKey);
      
      // Only warn once every 5 minutes
      if (!lastWarning || (now - lastWarning) > 300000) {
        this.chatWarnings.set(chatKey, now);
        
        const limitType = minuteUsage >= 0.8 ? 'per-minute' : 'per-hour';
        const remaining = minuteUsage >= 0.8 ? 
          limits.perMinute - rateCheck.requestsLastMinute :
          limits.perHour - rateCheck.requestsLastHour;
        
        return {
          type: 'approaching_limit',
          message: `⚠️ Approaching ${limitType} rate limit. ${remaining} requests remaining.`,
          usage: Math.round(Math.max(minuteUsage, hourUsage) * 100)
        };
      }
    }
    
    return null;
  }

  // Handle failed request (may trigger penalties)
  onRequestFailed(chatId, error) {
    const chatKey = String(chatId);
    const recentFailures = this.getRecentFailures(chatKey);
    
    // Apply penalty based on consecutive failures
    if (recentFailures >= 3) {
      this.applyPenalty(chatKey, 'consecutive_failures', Date.now());
    }
    
    console.log(`❌ Request failed for chat ${chatKey}. Recent failures: ${recentFailures}`);
  }

  // Handle successful request (may remove warnings)
  onRequestSuccess(chatId) {
    const chatKey = String(chatId);
    
    // Remove rapid-fire warnings after successful request
    const warning = this.chatWarnings.get(chatKey);
    if (warning) {
      this.chatWarnings.delete(chatKey);
    }
  }

  // Get current penalties and warnings summary
  getStatusSummary() {
    const now = Date.now();
    const activePenalties = [];
    const activeWarnings = [];
    
    for (const [chatId, penalty] of this.chatPenalties.entries()) {
      if (now < penalty.until) {
        activePenalties.push({
          chatId,
          reason: penalty.reason,
          remainingMs: penalty.until - now,
          appliedAt: penalty.appliedAt
        });
      }
    }
    
    for (const [chatId, warningTime] of this.chatWarnings.entries()) {
      // Include warnings from last 10 minutes
      if ((now - warningTime) < 600000) {
        activeWarnings.push({
          chatId,
          issuedAt: warningTime,
          ageMs: now - warningTime
        });
      }
    }
    
    return {
      activePenalties: activePenalties.length,
      activeWarnings: activeWarnings.length,
      globalUsage: this.checkGlobalLimits(now).current,
      penalties: activePenalties,
      warnings: activeWarnings,
      limits: this.limits
    };
  }

  // Update rate limit configurations
  updateLimits(newLimits) {
    this.limits = { ...this.limits, ...newLimits };
    console.log('📊 Rate limits updated:', this.limits);
  }

  // Start penalty cleanup interval
  startPenaltyCleanup() {
    setInterval(() => {
      const now = Date.now();
      
      // Clean expired penalties
      for (const [chatKey, penalty] of this.chatPenalties.entries()) {
        if (now >= penalty.until) {
          this.chatPenalties.delete(chatKey);
        }
      }
      
      // Clean old warnings (older than 1 hour)
      for (const [chatKey, warningTime] of this.chatWarnings.entries()) {
        if ((now - warningTime) > 3600000) {
          this.chatWarnings.delete(chatKey);
        }
      }
    }, 60000); // Clean every minute
  }
}

module.exports = {
  RateLimiter
};