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
        await this.storage.set(`prospect:${prospect.url}`, prospect);
      }
      
      console.log(`Discovered ${prospects.length} new prospects`);
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
          console.error(`Failed to contact ${prospect.name}:`, error);
          results.push({ 
            prospect: prospect.name, 
            status: 'failed', 
            error: error.message 
          });
        }
      }
      
      console.log(`Outreach complete: ${results.length} attempts`);
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
        const prospect = await this.storage.get(`prospect:${followUp.prospectId}`);
        if (!prospect) continue;
        
        const followUpEmail = await this.agent.generateOutreachEmail(prospect, 'follow-up');
        await this.agent.sendEmail(prospect, followUpEmail);
        
        // Schedule next follow-up if under limit
        if (followUp.attempt < (this.config.campaigns.maxFollowUps || 2)) {
          await this.agent.scheduleFollowUp(prospect, this.config.campaigns.followUpDelay);
        }
        
        await this.storage.delete(`followup:${followUp.prospectId}`);
        
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
if (import.meta.url === `file://${process.argv[1]}`) {
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
