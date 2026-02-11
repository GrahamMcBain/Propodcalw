# OpenClaw Hosting Recommendation Report for Hey Neighbor

## Executive Summary

**Recommended Platform:** Fly.io  
**Estimated Monthly Cost:** $4.60 - $15.00  
**LLM Recommendation:** DeepSeek-V3.2 via DeepInfra ($0.26 input/$0.38 output per 1M tokens)

## OpenClaw Architecture Analysis

### Core Requirements
- **Runtime:** Node.js 22+ with WebSocket gateway
- **Process Model:** Daemon with background workers for campaigns/follow-ups
- **Storage:** Session management, agent memory, prospect database
- **Integration:** Email providers (Resend/Postmark), LLM APIs
- **Docker Support:** Full containerization with sandboxing capabilities

### Key Findings
- OpenClaw runs as a persistent WebSocket gateway process
- Supports Docker containers with process groups (web + worker)
- Built-in cron system for scheduled campaigns
- Memory/session persistence required for agent continuity
- Native support for multiple messaging channels and tools

## Hosting Platform Comparison

| Platform | Runtime | Background/Cron | Storage | Price/Month | Ops Effort |
|----------|---------|-----------------|---------|-------------|------------|
| **Fly.io** ✅ | Docker/Node22 ✓ | Process groups + fly cron ✓ | Volumes + Postgres ✓ | $4.60-15 | Low |
| Railway | Node22 ✓ | Schedules beta ⚠️ | Postgres only ⚠️ | $5+ | Very Low |
| Render | Node22 ✓ | Worker + Cron ✓ | Disks ✓ | $14+ | Low |
| DO App Platform | Node22 ✓ | Worker components ✓ | DB only ⚠️ | $25+ | Medium |
| AWS ECS Fargate | Full control ✓ | Scheduled tasks ✓ | EFS ✓ | $9+ | High |

### Why Fly.io Wins

1. **Cost Efficiency:** Shared-CPU instances start at $2.41/month
2. **Native WebSockets:** No additional load balancer costs
3. **Process Groups:** Run web gateway + worker in same release
4. **Built-in Cron:** `fly cron` for scheduled campaigns
5. **Volumes + Postgres:** Complete storage solution under $5/month
6. **Global Anycast:** Built-in SSL and global distribution
7. **Zero-Config Deploy:** `fly launch` and auto-deploy via GitHub Actions

## LLM Cost Analysis

### Cost per 1000 Emails (Estimated 500 tokens input, 200 tokens output per email)

| Provider | Model | Input Cost | Output Cost | Total per 1K emails |
|----------|--------|------------|-------------|-------------------|
| **DeepInfra** ✅ | DeepSeek-V3.2 | $0.13 | $0.076 | **$0.21** |
| DeepInfra | Llama-3.3-70B | $0.50 | $0.64 | $1.14 |
| Together AI | Kimi K2.5 | $0.25 | $0.56 | $0.81 |
| Anthropic | Claude Haiku 4.5 | $0.50 | $1.00 | $1.50 |
| Together AI | Qwen3-Next-80B | $0.075 | $0.30 | $0.375 |

### Monthly LLM Costs by Email Volume

| Volume | DeepSeek-V3.2 | Llama-3.3-70B | Claude Haiku |
|--------|---------------|---------------|--------------|
| 200 emails | $0.04 | $0.23 | $0.30 |
| 1,000 emails | $0.21 | $1.14 | $1.50 |
| 5,000 emails | $1.05 | $5.70 | $7.50 |
| 10,000 emails | $2.10 | $11.40 | $15.00 |

**Recommendation:** DeepSeek-V3.2 offers exceptional value with strong reasoning capabilities at 90%+ cost savings versus Claude.

## Proposed Production Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Fly.io App                         │
├─────────────────────────────────────────────────────────────┤
│  Process Group: web                                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ OpenClaw Gateway (WebSocket + REST API)                │ │
│  │ - Session management                                   │ │
│  │ - Agent orchestration                                  │ │
│  │ - Control dashboard                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  Process Group: worker                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Background Campaign Worker                              │ │
│  │ - Prospect discovery                                   │ │
│  │ - Email generation & sending                           │ │
│  │ - Follow-up scheduling                                 │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Persistent Storage                                         │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │ 1GB Volume       │  │ Fly Postgres (Shared-CPU)       │  │
│  │ - Agent memory   │  │ - Prospects database             │  │
│  │ - Vector store   │  │ - Campaign tracking              │  │
│  │ - Logs           │  │ - Email history                  │  │
│  └──────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   External Services                        │
├─────────────────────────────────────────────────────────────┤
│ Email Provider: Resend ($20/month for 100K emails)         │
│ LLM Provider: DeepInfra DeepSeek-V3.2                      │
│ Monitoring: Fly.io built-in + optional external            │
└─────────────────────────────────────────────────────────────┘
```

## Monthly Cost Breakdown

### Infrastructure (Fly.io)
- Shared-CPU-1x 512MB VM: $4.81/month
- Fly Postgres (1GB, shared-CPU): $1.88/month  
- 1GB Volume: $0.30/month
- **Infrastructure Total: $7.00/month**

### Services by Email Volume
| Volume | LLM Cost | Email Provider | Total Monthly |
|--------|----------|----------------|---------------|
| 200 emails | $0.04 | $0 (free tier) | **$7.04** |
| 1,000 emails | $0.21 | $20 (Resend) | **$27.21** |
| 5,000 emails | $1.05 | $20 (Resend) | **$28.05** |
| 10,000 emails | $2.10 | $20 (Resend) | **$29.10** |

### Self-Hosting Cost Comparison

**GPU Server for DeepSeek-V3 (requires ~40GB VRAM)**
- A100 80GB server rental: ~$600-800/month
- Break-even point: ~400,000 emails/month
- **Recommendation:** Use API - break-even is far beyond projected scale

## Risk Analysis

### Technical Risks
- **LLM Rate Limits:** DeepInfra has usage tiers; monitor for throttling
- **Email Deliverability:** Warm-up required, monitor sender reputation
- **OpenClaw Updates:** Pin versions, test updates in staging

### Operational Risks  
- **Cost Spikes:** Set usage alerts on LLM and email providers
- **Spam Classification:** Implement gradual sending ramp-up
- **Data Loss:** Automated daily backups of Postgres + volume

### Mitigation Strategies
- Monitor email open/bounce rates closely
- Implement gradual sending increase (50→100→200→500 emails/week)
- Set up alerts for costs >$50/month
- Use Fly.io's built-in metrics and logging

## Security Considerations

- All secrets via Fly.io encrypted secrets store
- Network isolation between processes
- Regular security updates via automated deploys
- Email authentication (SPF, DKIM, DMARC) setup
- Rate limiting on API endpoints

## Success Metrics

### Technical Targets
- Email delivery rate: >95%
- Response time: <10s per email generation
- Uptime: >99.5%
- Cost per email: <$0.05

### Business Targets  
- 25 relevant prospects discovered/week
- 5%+ email response rate
- 1+ booked appearance per 100 emails
- Scalable to 500 emails/week without architectural changes

## Next Steps

1. **Deploy MVP on Fly.io** (Est. 2 days)
2. **Configure DeepSeek-V3.2 + Resend** (Est. 1 day)  
3. **Build Hey Neighbor prospect discovery agents** (Est. 3 days)
4. **Test with 25-email campaign** (Est. 1 day)
5. **Monitor and optimize based on results** (Ongoing)

Total estimated setup time: 1 week
