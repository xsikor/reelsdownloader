#!/usr/bin/env node

const express = require('express');
const { getMetrics } = require('./metrics');
const { RateLimiter } = require('./rateLimiter');

class MetricsDashboard {
  constructor(port = 3001) {
    this.app = express();
    this.port = port;
    this.metrics = getMetrics();
    this.rateLimiter = new RateLimiter(this.metrics);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // JSON parsing
    this.app.use(express.json());
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📊 Dashboard: ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Main dashboard HTML
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // API Routes
    this.app.get('/api/health', (req, res) => {
      res.json(this.metrics.getHealthStatus());
    });

    this.app.get('/api/metrics/global', (req, res) => {
      res.json(this.metrics.getGlobalMetrics());
    });

    this.app.get('/api/metrics/chat/:chatId', (req, res) => {
      const chatMetrics = this.metrics.getChatMetrics(req.params.chatId);
      res.json(chatMetrics);
    });

    this.app.get('/api/metrics/top-chats', (req, res) => {
      const limit = parseInt(req.query.limit) || 10;
      res.json(this.metrics.getTopChats(limit));
    });

    this.app.get('/api/metrics/platform-stats', (req, res) => {
      res.json(this.metrics.getPlatformStats());
    });

    this.app.get('/api/metrics/recent-activity', (req, res) => {
      const minutes = parseInt(req.query.minutes) || 60;
      res.json(this.metrics.getRecentActivity(minutes));
    });

    this.app.get('/api/metrics/hourly-distribution', (req, res) => {
      const hours = parseInt(req.query.hours) || 24;
      const distribution = this.metrics.store.getHourlyDistribution(hours);
      res.json(distribution);
    });

    this.app.get('/api/metrics/platform-performance', (req, res) => {
      res.json(this.metrics.store.getPlatformPerformance());
    });

    this.app.get('/api/metrics/request-volume', (req, res) => {
      const interval = parseInt(req.query.interval) || 5;
      const periods = parseInt(req.query.periods) || 12;
      res.json(this.metrics.store.getRequestVolume(interval, periods));
    });

    this.app.get('/api/rate-limiter/status', (req, res) => {
      res.json(this.rateLimiter.getStatusSummary());
    });

    this.app.post('/api/rate-limiter/update-limits', (req, res) => {
      try {
        this.rateLimiter.updateLimits(req.body);
        res.json({ success: true, message: 'Rate limits updated' });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/metrics/storage-info', (req, res) => {
      res.json(this.metrics.store.getStorageInfo());
    });

    this.app.get('/api/metrics/export', (req, res) => {
      const data = this.metrics.store.exportData();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="bot-metrics-${Date.now()}.json"`);
      res.json(data);
    });

    // Server-Sent Events for real-time updates
    this.app.get('/api/metrics/stream', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const sendUpdate = () => {
        const data = {
          timestamp: Date.now(),
          global: this.metrics.getGlobalMetrics(),
          health: this.metrics.getHealthStatus(),
          rateLimiter: this.rateLimiter.getStatusSummary()
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Send initial data
      sendUpdate();

      // Send updates every 5 seconds
      const interval = setInterval(sendUpdate, 5000);

      req.on('close', () => {
        clearInterval(interval);
      });
    });

    // Prometheus-compatible metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send(this.getPrometheusMetrics());
    });
  }

  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instagram/TikTok/Facebook Bot Metrics</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 4px solid #667eea;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            margin: 10px 0;
        }
        .metric-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .status-healthy { color: #28a745; }
        .status-unhealthy { color: #dc3545; }
        .progress-bar {
            background-color: #e9ecef;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 20px;
            background: linear-gradient(90deg, #28a745, #ffc107, #dc3545);
            transition: width 0.3s ease;
        }
        .platform-stats {
            display: flex;
            justify-content: space-between;
            margin: 15px 0;
        }
        .platform-stat {
            text-align: center;
            flex: 1;
        }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin: 10px;
            font-size: 1em;
        }
        .refresh-btn:hover {
            background: #5a6fd8;
        }
        .top-chats {
            max-height: 400px;
            overflow-y: auto;
        }
        .chat-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
        }
        .live-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            background-color: #28a745;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Bot Metrics Dashboard</h1>
        <p>Real-time monitoring for Instagram/TikTok/Facebook Bot</p>
        <div class="live-indicator"></div> Live Updates
    </div>

    <div style="text-align: center; margin-bottom: 20px;">
        <button class="refresh-btn" onclick="loadMetrics()">🔄 Refresh</button>
        <button class="refresh-btn" onclick="exportData()">📊 Export Data</button>
        <button class="refresh-btn" onclick="toggleAutoRefresh()">⏱️ Toggle Auto-refresh</button>
    </div>

    <div class="grid">
        <div class="card">
            <div class="metric-label">System Health</div>
            <div id="health-status" class="metric-value">Loading...</div>
            <div id="uptime">Uptime: Loading...</div>
        </div>
        
        <div class="card">
            <div class="metric-label">Total Requests</div>
            <div id="total-requests" class="metric-value">0</div>
            <div id="success-rate">Success Rate: 0%</div>
        </div>
        
        <div class="card">
            <div class="metric-label">Average Latency</div>
            <div id="avg-latency" class="metric-value">0ms</div>
            <div id="avg-file-size">Avg File Size: 0MB</div>
        </div>
        
        <div class="card">
            <div class="metric-label">Rate Limiter Status</div>
            <div id="active-penalties" class="metric-value">0</div>
            <div>Active Penalties</div>
            <div id="active-warnings">Warnings: 0</div>
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <div class="metric-label">Platform Distribution</div>
            <div class="platform-stats">
                <div class="platform-stat">
                    <div>📸 Instagram</div>
                    <div id="instagram-percent">0%</div>
                </div>
                <div class="platform-stat">
                    <div>🎵 TikTok</div>
                    <div id="tiktok-percent">0%</div>
                </div>
                <div class="platform-stat">
                    <div>📘 Facebook</div>
                    <div id="facebook-percent">0%</div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <div class="metric-label">Top Active Chats</div>
            <div id="top-chats" class="top-chats">Loading...</div>
        </div>
    </div>

    <script>
        let autoRefresh = true;
        let refreshInterval;

        function formatUptime(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (days > 0) return \`\${days}d \${hours % 24}h \${minutes % 60}m\`;
            if (hours > 0) return \`\${hours}h \${minutes % 60}m\`;
            if (minutes > 0) return \`\${minutes}m \${seconds % 60}s\`;
            return \`\${seconds}s\`;
        }

        function formatFileSize(bytes) {
            const mb = bytes / (1024 * 1024);
            return mb.toFixed(1) + 'MB';
        }

        async function loadMetrics() {
            try {
                const [global, health, rateLimiter, platformStats, topChats] = await Promise.all([
                    fetch('/api/metrics/global').then(r => r.json()),
                    fetch('/api/health').then(r => r.json()),
                    fetch('/api/rate-limiter/status').then(r => r.json()),
                    fetch('/api/metrics/platform-stats').then(r => r.json()),
                    fetch('/api/metrics/top-chats?limit=5').then(r => r.json())
                ]);

                // Update health status
                document.getElementById('health-status').textContent = health.healthy ? '✅ Healthy' : '❌ Unhealthy';
                document.getElementById('health-status').className = \`metric-value \${health.healthy ? 'status-healthy' : 'status-unhealthy'}\`;
                document.getElementById('uptime').textContent = \`Uptime: \${formatUptime(health.uptime)}\`;

                // Update global metrics
                document.getElementById('total-requests').textContent = global.counters.totalRequests;
                document.getElementById('success-rate').textContent = \`Success Rate: \${global.performance.successRate}%\`;
                document.getElementById('avg-latency').textContent = \`\${global.performance.averageLatency}ms\`;
                document.getElementById('avg-file-size').textContent = formatFileSize(global.performance.averageFileSize);

                // Update rate limiter
                document.getElementById('active-penalties').textContent = rateLimiter.activePenalties;
                document.getElementById('active-warnings').textContent = \`Warnings: \${rateLimiter.activeWarnings}\`;

                // Update platform stats
                document.getElementById('instagram-percent').textContent = \`\${platformStats.instagram}%\`;
                document.getElementById('tiktok-percent').textContent = \`\${platformStats.tiktok}%\`;
                document.getElementById('facebook-percent').textContent = \`\${platformStats.facebook}%\`;

                // Update top chats
                const topChatsHtml = topChats.map(chat => \`
                    <div class="chat-item">
                        <div>Chat \${chat.chatId}</div>
                        <div>\${chat.totalRequests} requests (\${chat.successRate}%)</div>
                    </div>
                \`).join('');
                document.getElementById('top-chats').innerHTML = topChatsHtml || '<div class="chat-item">No data available</div>';

            } catch (error) {
                console.error('Failed to load metrics:', error);
            }
        }

        function exportData() {
            window.open('/api/metrics/export', '_blank');
        }

        function toggleAutoRefresh() {
            autoRefresh = !autoRefresh;
            if (autoRefresh) {
                refreshInterval = setInterval(loadMetrics, 5000);
                console.log('Auto-refresh enabled');
            } else {
                clearInterval(refreshInterval);
                console.log('Auto-refresh disabled');
            }
        }

        // Initial load
        loadMetrics();
        
        // Auto-refresh every 5 seconds
        refreshInterval = setInterval(() => {
            if (autoRefresh) loadMetrics();
        }, 5000);
    </script>
</body>
</html>
    `;
  }

  getPrometheusMetrics() {
    const global = this.metrics.getGlobalMetrics();
    const health = this.metrics.getHealthStatus();
    const platformStats = this.metrics.getPlatformStats();
    
    return `
# HELP bot_requests_total Total number of requests processed
# TYPE bot_requests_total counter
bot_requests_total ${global.counters.totalRequests}

# HELP bot_requests_failed_total Total number of failed requests
# TYPE bot_requests_failed_total counter
bot_requests_failed_total ${global.counters.totalFailures}

# HELP bot_uptime_seconds Bot uptime in seconds
# TYPE bot_uptime_seconds gauge
bot_uptime_seconds ${Math.floor(global.uptime / 1000)}

# HELP bot_average_latency_milliseconds Average request latency
# TYPE bot_average_latency_milliseconds gauge
bot_average_latency_milliseconds ${global.performance.averageLatency}

# HELP bot_success_rate_percent Request success rate percentage
# TYPE bot_success_rate_percent gauge
bot_success_rate_percent ${global.performance.successRate}

# HELP bot_platform_requests_total Requests by platform
# TYPE bot_platform_requests_total counter
bot_platform_requests_total{platform="instagram"} ${global.counters.requestsByPlatform.instagram || 0}
bot_platform_requests_total{platform="tiktok"} ${global.counters.requestsByPlatform.tiktok || 0}
bot_platform_requests_total{platform="facebook"} ${global.counters.requestsByPlatform.facebook || 0}

# HELP bot_healthy Bot health status
# TYPE bot_healthy gauge
bot_healthy ${health.healthy ? 1 : 0}
    `.trim();
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`📊 Metrics Dashboard started at http://localhost:${this.port}`);
      console.log(`📊 API available at http://localhost:${this.port}/api/`);
      console.log(`📊 Prometheus metrics at http://localhost:${this.port}/metrics`);
    });
  }
}

// Start dashboard if run directly
if (require.main === module) {
  const dashboard = new MetricsDashboard();
  dashboard.start();
}

module.exports = {
  MetricsDashboard
};