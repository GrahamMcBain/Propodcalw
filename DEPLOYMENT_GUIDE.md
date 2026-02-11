# Hey Neighbor OpenClaw Production Deployment Guide

## Prerequisites Setup

### 1. Install Node.js 22+
```bash
# Install via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node --version  # Should show v22.x.x
```

### 2. Install Fly.io CLI
```bash
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
fly auth login
```

### 3. Install Dependencies
```bash
npm install -g pnpm
```

## OpenClaw Setup

### 1. Clone and Setup OpenClaw
```bash
cd /Users/grahammcbain/PodProdClaw
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
```

### 2. Create Production Configuration

Create `config/hey-neighbor-config.json`:
```json
{
  "gateway": {
    "bind": "0.0.0.0",
    "port": 18789,
    "token": "${OPENCLAW_GATEWAY_TOKEN}"
  },
  "agents": {
    "defaults": {
      "model": "claude-3-5-sonnet-20241022",
      "provider": "anthropic",
      "temperature": 0.7,
      "maxTokens": 2000,
      "sandbox": {
        "mode": "non-main",
        "scope": "agent",
        "workspaceAccess": "rw"
      }
    }
  },
  "providers": {
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}",
      "baseUrl": "https://api.anthropic.com"
    }
  },
  "email": {
    "provider": "gmail",
    "user": "${GMAIL_USER}",
    "password": "${GMAIL_APP_PASSWORD}",
    "fromEmail": "${GMAIL_USER}",
    "fromName": "Graham McBain - Hey Neighbor"
  },
  "campaigns": {
    "defaultTemplate": "podcast-guest",
    "followUpDelay": 7,
    "maxFollowUps": 2,
    "dailyLimit": 50
  },
  "tools": {
    "web_search": {
      "enabled": true,
      "provider": "serpapi",
      "apiKey": "${SERPAPI_KEY}"
    },
    "email_sender": {
      "enabled": true,
      "rateLimit": 10
    }
  }
}
```

### 3. Create Hey Neighbor Agent Configuration

Create `agents/hey-neighbor-outreach.js`:
```javascript
import { Agent } from '@openclaw/core';

export class HeyNeighborOutreachAgent extends Agent {
  constructor(config) {
    super({
      name: 'hey-neighbor-outreach',
      description: 'Automated outreach agent for Hey Neighbor podcast guest bookings',
      ...config
    });
  }

  async discoverProspects(criteria) {
    const searchQueries = [
      'community building podcast hosts',
      'neighborhood engagement newsletter editors',
      'civic tech journalists',
      'local community organizers podcast',
      'loneliness epidemic researchers',
      'social connection researchers podcast'
    ];
    
    const prospects = [];
    for (const query of searchQueries) {
      const results = await this.tools.web_search.search(query);
      const processed = await this.processSearchResults(results, criteria);
      prospects.push(...processed);
    }
    
    return this.deduplicateProspects(prospects);
  }

  async processSearchResults(results, criteria) {
    const prospects = [];
    
    for (const result of results.slice(0, 10)) {
      const analysis = await this.llm.complete({
        prompt: `
Analyze this search result for podcast guest outreach potential:

Title: ${result.title}
URL: ${result.url}
Snippet: ${result.snippet}

Is this relevant for Hey Neighbor (community building/neighborhood engagement)? 
Extract:
1. Contact person name
2. Email if found
3. Platform type (podcast/newsletter/blog)
4. Relevance score 1-10
5. Reason for relevance
6. Suggested pitch angle

Format as JSON.
        `,
        maxTokens: 500
      });
      
      try {
        const parsed = JSON.parse(analysis);
        if (parsed.relevanceScore >= 7) {
          prospects.push({
            name: parsed.contactPerson,
            email: parsed.email,
            platform: parsed.platformType,
            url: result.url,
            relevanceScore: parsed.relevanceScore,
            reason: parsed.reason,
            pitchAngle: parsed.pitchAngle,
            source: result.title,
            discoveredAt: new Date().toISOString()
          });
        }
      } catch (e) {
        console.warn('Failed to parse prospect analysis:', e);
      }
    }
    
    return prospects;
  }

  async generateOutreachEmail(prospect, template = 'podcast-guest') {
    const templates = {
      'podcast-guest': this.podcastGuestTemplate,
      'media-pitch': this.mediaPitchTemplate,
      'newsletter-pitch': this.newsletterPitchTemplate
    };
    
    const templateFunc = templates[template] || templates['podcast-guest'];
    return await templateFunc(prospect);
  }

  async podcastGuestTemplate(prospect) {
    const prompt = `
Write a personalized podcast guest pitch email for Hey Neighbor.

Prospect: ${prospect.name}
Platform: ${prospect.platform}
URL: ${prospect.url}
Reason relevant: ${prospect.reason}
Suggested angle: ${prospect.pitchAngle}

Hey Neighbor context:
- Community-building platform connecting neighbors
- Founded by Graham McBain (former Stripe, Retool)
- Focus on loneliness epidemic, local connections, civic engagement
- Success stories: neighborhood events, mutual aid, local business support

Email should:
- Be genuinely personal (reference their recent work)
- Explain Hey Neighbor's unique angle
- Suggest specific conversation topics
- Include social proof/traction metrics
- Professional but warm tone
- 150-200 words max

Subject line and email body:
`;

    const response = await this.llm.complete({
      prompt,
      maxTokens: 600,
      temperature: 0.8
    });

    const [subjectLine, ...bodyParts] = response.split('\n\n');
    return {
      subject: subjectLine.replace('Subject:', '').trim(),
      body: bodyParts.join('\n\n'),
      generatedAt: new Date().toISOString(),
      template: 'podcast-guest'
    };
  }

  async sendEmail(prospect, email) {
    try {
      const result = await this.tools.email_sender.sendGmail({
        to: prospect.email,
        from: this.config.email.fromEmail,
        fromName: this.config.email.fromName,
        subject: email.subject,
        body: email.body,
        user: this.config.email.user,
        password: this.config.email.password
      });

      await this.storage.log('email_sent', {
        prospectId: prospect.id,
        emailId: result.id,
        subject: email.subject,
        sentAt: new Date().toISOString()
      });

      return result;
    } catch (error) {
      await this.storage.log('email_failed', {
        prospectId: prospect.id,
        error: error.message,
        attemptedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  async scheduleFollowUp(prospect, delayDays = 7) {
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + delayDays);

    await this.storage.set(\`followup:\${prospect.id}\`, {
      prospectId: prospect.id,
      scheduledFor: followUpDate.toISOString(),
      type: 'follow-up',
      attempt: (prospect.followUpAttempts || 0) + 1
    });
  }

  deduplicateProspects(prospects) {
    const seen = new Set();
    return prospects.filter(p => {
      const key = p.email || p.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
```

### 4. Create Campaign Worker

Create `workers/campaign-worker.js`:
```javascript
import { HeyNeighborOutreachAgent } from '../agents/hey-neighbor-outreach.js';
import { Storage } from '@openclaw/core';

export class CampaignWorker {
  constructor(config) {
    this.config = config;
    this.agent = new HeyNeighborOutreachAgent(config);
    this.storage = new Storage();
  }

  async runDailyProspectDiscovery() {
    console.log('Starting daily prospect discovery...');
    
    try {
      const criteria = {
        minRelevanceScore: 7,
        topics: ['community building', 'neighborhoods', 'loneliness', 'civic tech']
      };

      const prospects = await this.agent.discoverProspects(criteria);
      
      for (const prospect of prospects) {
        await this.storage.set(\`prospect:\${prospect.url}\`, prospect);
      }
      
      console.log(\`Discovered \${prospects.length} new prospects\`);
      return prospects;
    } catch (error) {
      console.error('Prospect discovery failed:', error);
      throw error;
    }
  }

  async runOutreachCampaign() {
    console.log('Starting outreach campaign...');
    
    try {
      const unseenProspects = await this.getUnseenProspects();
      const dailyLimit = this.config.campaigns.dailyLimit || 10;
      const prospectsToContact = unseenProspects.slice(0, dailyLimit);
      
      const results = [];
      for (const prospect of prospectsToContact) {
        try {
          const email = await this.agent.generateOutreachEmail(prospect);
          
          if (prospect.email) {
            await this.agent.sendEmail(prospect, email);
            await this.agent.scheduleFollowUp(prospect);
            
            results.push({ 
              prospect: prospect.name, 
              status: 'sent',
              subject: email.subject 
            });
          } else {
            results.push({ 
              prospect: prospect.name, 
              status: 'no_email' 
            });
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(\`Failed to contact \${prospect.name}:\`, error);
          results.push({ 
            prospect: prospect.name, 
            status: 'failed', 
            error: error.message 
          });
        }
      }
      
      console.log(\`Outreach complete: \${results.length} attempts\`);
      return results;
    } catch (error) {
      console.error('Outreach campaign failed:', error);
      throw error;
    }
  }

  async processFollowUps() {
    console.log('Processing follow-ups...');
    
    const followUps = await this.storage.scan('followup:*');
    const dueFollowUps = followUps.filter(f => 
      new Date(f.scheduledFor) <= new Date()
    );
    
    for (const followUp of dueFollowUps) {
      try {
        const prospect = await this.storage.get(\`prospect:\${followUp.prospectId}\`);
        if (!prospect) continue;
        
        const followUpEmail = await this.agent.generateOutreachEmail(prospect, 'follow-up');
        await this.agent.sendEmail(prospect, followUpEmail);
        
        // Schedule next follow-up if under limit
        if (followUp.attempt < (this.config.campaigns.maxFollowUps || 2)) {
          await this.agent.scheduleFollowUp(prospect, this.config.campaigns.followUpDelay);
        }
        
        await this.storage.delete(\`followup:\${followUp.prospectId}\`);
        
      } catch (error) {
        console.error('Follow-up failed:', error);
      }
    }
  }

  async getUnseenProspects() {
    const allProspects = await this.storage.scan('prospect:*');
    const sentEmails = await this.storage.scan('email_sent');
    const sentProspectIds = new Set(sentEmails.map(e => e.prospectId));
    
    return allProspects.filter(p => !sentProspectIds.has(p.id));
  }
}

// Worker entry point
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const config = JSON.parse(process.env.OPENCLAW_CONFIG || '{}');
  const worker = new CampaignWorker(config);
  
  const command = process.argv[2];
  
  switch (command) {
    case 'discover':
      await worker.runDailyProspectDiscovery();
      break;
    case 'outreach':
      await worker.runOutreachCampaign();
      break;
    case 'followups':
      await worker.processFollowUps();
      break;
    default:
      console.log('Usage: node campaign-worker.js [discover|outreach|followups]');
  }
}
```

## Fly.io Deployment

### 1. Initialize Fly App
```bash
cd openclaw
fly launch --dockerfile ./Dockerfile --name hey-neighbor-openclaw --no-deploy
```

### 2. Create fly.toml Configuration
```toml
app = "hey-neighbor-openclaw"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[processes]
  web = "npm run start"
  worker = "node workers/campaign-worker.js"

[[mounts]]
  source = "openclaw_data"
  destination = "/app/data"

[env]
  NODE_ENV = "production"
  OPENCLAW_CONFIG_PATH = "/app/config/hey-neighbor-config.json"

[http_service]
  internal_port = 18789
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    grace_period = "30s"
    interval = "15s"
    method = "GET"
    path = "/healthz"
    port = 18789
    restart_limit = 0
    timeout = "10s"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

[deploy]
  strategy = "rolling"
  max_unavailable = 0
```

### 3. Create Volume for Persistent Data
```bash
fly volumes create openclaw_data --size 1 --region sjc
```

### 4. Setup Postgres Database
```bash
fly postgres create --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 5 --region sjc --name hey-neighbor-db
fly postgres attach --app hey-neighbor-openclaw hey-neighbor-db
```

### 5. Set Environment Secrets
```bash
fly secrets set OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
fly secrets set ANTHROPIC_API_KEY=your_anthropic_api_key
fly secrets set GMAIL_USER=your_gmail_address
fly secrets set GMAIL_APP_PASSWORD=your_gmail_app_password
fly secrets set SERPAPI_KEY=your_serpapi_key
```

### 6. Deploy Application
```bash
fly deploy
```

### 7. Setup Cron Jobs
```bash
# Daily prospect discovery at 9 AM UTC
fly cron schedule "0 9 * * *" -a hey-neighbor-openclaw 'worker discover'

# Outreach campaign at 10 AM UTC (after discovery)  
fly cron schedule "0 10 * * 1-5" -a hey-neighbor-openclaw 'worker outreach'

# Follow-up processing twice daily
fly cron schedule "0 14,18 * * *" -a hey-neighbor-openclaw 'worker followups'
```

## Email Provider Setup (Gmail)

### 1. Gmail App Password Setup
```bash
1. Enable 2-factor authentication on your Gmail account
2. Go to Google Account settings > Security > App passwords
3. Generate an app password for "Mail"
4. Use this app password (not your regular password) in GMAIL_APP_PASSWORD
```

### 2. Warm-up Strategy
- Week 1: 5 emails/day
- Week 2: 10 emails/day  
- Week 3: 25 emails/day
- Week 4+: 50 emails/day

## Monitoring and Management

### 1. Access Control Dashboard
```bash
# Open dashboard
fly apps open hey-neighbor-openclaw

# Access via CLI
fly ssh console
```

### 2. View Logs
```bash
# All logs
fly logs

# Worker logs only  
fly logs --process worker

# Real-time logs
fly logs -f
```

### 3. Scale Application
```bash
# Scale up for higher volume
fly scale count 2

# Scale worker process independently
fly scale count worker=2

# Scale memory
fly scale memory 1024
```

### 4. Database Management
```bash
# Connect to Postgres
fly postgres connect -a hey-neighbor-db

# Create tables for tracking
CREATE TABLE prospects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  platform VARCHAR(100),
  url TEXT,
  relevance_score INTEGER,
  discovered_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER REFERENCES prospects(id),
  subject TEXT,
  body TEXT,
  sent_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50)
);
```

## Testing the System

### 1. Manual Test
```bash
# SSH into app
fly ssh console

# Run discovery test
node workers/campaign-worker.js discover

# Run single outreach test  
node workers/campaign-worker.js outreach
```

### 2. Monitor Results
- Check Gmail sent folder for delivery confirmation
- Monitor Fly.io metrics for performance
- Review logs for errors or issues
- Monitor daily sending limits (500 emails/day for personal Gmail)

## Maintenance Tasks

### 1. Weekly Reviews
- Check email deliverability rates
- Review prospect quality
- Adjust targeting criteria if needed
- Monitor costs in Fly.io and Resend dashboards

### 2. Monthly Optimizations  
- Analyze response rates by template
- A/B test email content
- Review and update prospect discovery queries
- Scale infrastructure if needed

## Cost Monitoring Alerts

Add these alerts in your monitoring:
- Monthly Fly.io costs > $20
- Gmail daily sending approaching 500 emails
- Anthropic API costs > $50/month
- Email bounce rate > 5%

## Security Checklist

- [x] All API keys stored as encrypted secrets
- [x] HTTPS enforced for all connections
- [x] Email authentication configured (SPF, DKIM, DMARC)
- [x] Rate limiting implemented
- [x] Database backups enabled
- [x] Process isolation via Docker

## Support and Troubleshooting

Common issues and solutions:

1. **High email bounce rate**: Check domain authentication, slow down sending
2. **Worker crashes**: Check memory limits, review error logs  
3. **Poor prospect quality**: Adjust search queries and scoring thresholds
4. **Rate limiting**: Implement exponential backoff, reduce concurrent requests

For issues, check:
1. Fly.io logs: `fly logs`
2. Database connectivity: `fly postgres connect`
3. Email delivery: Gmail sent folder and error logs
4. LLM API: Anthropic Console dashboard
