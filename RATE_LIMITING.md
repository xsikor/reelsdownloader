# Rate Limiting Configuration

This document explains how to configure rate limiting for the Instagram/TikTok/Facebook Bot.

## Quick Setup

### To Disable Rate Limiting Completely
```bash
export ENABLE_RATE_LIMITING=false
```

### To Enable Rate Limiting (Default)
```bash
export ENABLE_RATE_LIMITING=true
```

## Detailed Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_RATE_LIMITING` | `true` | Enable/disable all rate limiting |

### Private Chat Limits
| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_PRIVATE_PER_MINUTE` | `10` | Requests per minute for private chats |
| `RATE_LIMIT_PRIVATE_PER_HOUR` | `100` | Requests per hour for private chats |
| `RATE_LIMIT_PRIVATE_BURST` | `3` | Burst allowance for private chats |

### Group Chat Limits
| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_GROUP_PER_MINUTE` | `20` | Requests per minute for groups |
| `RATE_LIMIT_GROUP_PER_HOUR` | `200` | Requests per hour for groups |
| `RATE_LIMIT_GROUP_BURST` | `5` | Burst allowance for groups |

### Supergroup Limits
| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_SUPERGROUP_PER_MINUTE` | `15` | Requests per minute for supergroups |
| `RATE_LIMIT_SUPERGROUP_PER_HOUR` | `150` | Requests per hour for supergroups |
| `RATE_LIMIT_SUPERGROUP_BURST` | `4` | Burst allowance for supergroups |

### Global Limits
| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_GLOBAL_PER_MINUTE` | `100` | Total requests per minute across all users |
| `RATE_LIMIT_GLOBAL_PER_HOUR` | `2000` | Total requests per hour across all users |

## Example Configurations

### No Rate Limiting
```env
ENABLE_RATE_LIMITING=false
```

### Relaxed Rate Limiting
```env
ENABLE_RATE_LIMITING=true
RATE_LIMIT_PRIVATE_PER_MINUTE=50
RATE_LIMIT_PRIVATE_PER_HOUR=500
RATE_LIMIT_GROUP_PER_MINUTE=100
RATE_LIMIT_GROUP_PER_HOUR=1000
RATE_LIMIT_GLOBAL_PER_MINUTE=500
RATE_LIMIT_GLOBAL_PER_HOUR=5000
```

### Strict Rate Limiting
```env
ENABLE_RATE_LIMITING=true
RATE_LIMIT_PRIVATE_PER_MINUTE=3
RATE_LIMIT_PRIVATE_PER_HOUR=30
RATE_LIMIT_GROUP_PER_MINUTE=5
RATE_LIMIT_GROUP_PER_HOUR=50
RATE_LIMIT_GLOBAL_PER_MINUTE=20
RATE_LIMIT_GLOBAL_PER_HOUR=200
```

## Docker Configuration

### Update `.env` file
```env
ENABLE_RATE_LIMITING=false
```

### Restart container
```bash
docker-compose restart
```

### Or rebuild if needed
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

## How It Works

1. **When Enabled**: The bot checks rate limits before processing any video download request
2. **When Disabled**: All requests are allowed immediately without any checks
3. **Per Chat Type**: Different limits apply to private chats, groups, and supergroups
4. **Global Limits**: Additional limits apply across all users combined
5. **Penalties**: Users who exceed limits face temporary restrictions

## Monitoring

Use the admin commands to monitor rate limiting:
- `/metrics` - Shows active rate limiters
- `/health` - Shows system status including rate limiting

Rate limiting status is also visible in the bot startup logs.