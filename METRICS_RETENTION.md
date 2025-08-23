# Metrics Data Retention Configuration

This document explains how to configure data retention for the Instagram/TikTok/Facebook Bot metrics system.

## Default Behavior

By default, **all metrics data is kept forever** to provide comprehensive historical analytics and reporting. This includes:
- Request logs and activity data
- Performance metrics and download statistics  
- Chat-specific usage patterns and statistics

## Environment Variables

Configure retention periods using these environment variables (values in milliseconds):

| Variable | Default | Description |
|----------|---------|-------------|
| `METRICS_RETENTION_REQUESTS` | `0` | Request data retention period (0 = forever) |
| `METRICS_RETENTION_PERFORMANCE` | `0` | Performance data retention period (0 = forever) |
| `METRICS_RETENTION_CHAT_METRICS` | `0` | Chat metrics retention period (0 = forever) |

## Configuration Examples

### Keep All Data Forever (Recommended Default)
```bash
# Either leave variables unset, or explicitly set to 0
METRICS_RETENTION_REQUESTS=0
METRICS_RETENTION_PERFORMANCE=0  
METRICS_RETENTION_CHAT_METRICS=0
```

### Limited Retention Example
```bash
# Keep requests for 30 days
METRICS_RETENTION_REQUESTS=2592000000

# Keep performance data for 7 days  
METRICS_RETENTION_PERFORMANCE=604800000

# Keep chat metrics for 90 days
METRICS_RETENTION_CHAT_METRICS=7776000000
```

### Common Time Period Conversions
```bash
# 1 day = 86400000 ms
# 7 days = 604800000 ms
# 30 days = 2592000000 ms
# 90 days = 7776000000 ms
# 1 year = 31536000000 ms
```

## Data Cleanup Process

The system automatically runs a cleanup process every hour that:

1. **Checks retention settings** for each data type
2. **Skips cleanup** if retention period is `0` (forever)
3. **Removes old data** only if retention period is configured
4. **Logs cleanup activity** for monitoring

### Cleanup Log Messages

```bash
# When data is set to be kept forever:
📊 Data retention is set to forever - no records were cleaned

# When data is cleaned:
🧹 Cleaned 150 old records (5 inactive chats)

# On startup, retention settings are displayed:
📊 Metrics retention settings:
   Requests: Forever
   Performance: Forever  
   Chat Metrics: Forever
```

## Storage Considerations

### Disk Usage
- Request data: ~1KB per request
- Performance data: ~500 bytes per download
- Chat metrics: ~2KB per active chat

### Estimated Storage Growth
For a moderately active bot (1000 requests/day):
- Daily growth: ~1.5MB
- Monthly growth: ~45MB
- Yearly growth: ~550MB

### Monitoring Storage
Use the `/metrics` admin command to view current storage usage:
```
Storage Information:
- Requests: 2,450 records (1.2MB)
- Performance: 1,890 records (945KB)  
- Chat Metrics: 45 chats (90KB)
- Total Size: 2.2MB
```

## Docker Configuration

### Environment File Setup
Create/update your `.env` file:
```env
# Keep all metrics data forever (recommended)
ENABLE_METRICS=true
METRICS_RETENTION_REQUESTS=0
METRICS_RETENTION_PERFORMANCE=0
METRICS_RETENTION_CHAT_METRICS=0
```

### Docker Compose
The `docker-compose.yml` already includes persistent storage:
```yaml
volumes:
  # Persist metrics data permanently
  - ./metrics-data:/app/metrics-data
```

This ensures metrics data survives container restarts and updates.

## Migration Notes

If you're upgrading from a previous version with limited retention:

1. **Existing data is preserved** - no data loss during upgrade
2. **New retention settings apply** from next cleanup cycle
3. **Set retention to 0** to stop future data deletion
4. **Restart the bot** to apply new settings

## Troubleshooting

### High Disk Usage
If storage becomes a concern:
```bash
# Set 90-day retention for all data types
METRICS_RETENTION_REQUESTS=7776000000
METRICS_RETENTION_PERFORMANCE=7776000000
METRICS_RETENTION_CHAT_METRICS=7776000000
```

### Data Recovery
If data was accidentally deleted:
- Check Docker volume backups: `./metrics-data/`
- Data files are in JSON format for easy recovery
- Consider implementing external backup strategy for critical deployments

## Backup Recommendations

For production deployments:

1. **Regular backups** of `./metrics-data/` directory
2. **Database exports** via `/api/metrics/export` endpoint
3. **Monitoring alerts** for disk usage thresholds
4. **Consider external storage** for long-term archival

## Security Considerations

- Metrics data may contain chat IDs and names (potential PII)
- Implement proper access controls for metrics endpoints
- Consider data retention compliance requirements
- Regular security audits of stored metrics data