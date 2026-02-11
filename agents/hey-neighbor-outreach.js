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

    await this.storage.set(`followup:${prospect.id}`, {
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
