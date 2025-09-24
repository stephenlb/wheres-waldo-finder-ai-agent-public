const PubNub = require('pubnub');
require('dotenv').config();

// Initialize PubNub with demo keys
const pubnub = new PubNub({
  publishKey: 'demo',
  subscribeKey: 'demo',
  uuid: 'waldo-finder-server',
  ssl: true
});

class PubNubClient {
  constructor() {
    this.pubnub = pubnub;
  }

  // Generate a random channel name
  generateChannelName() {
    return 'waldo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // Publish a message to a channel with error handling
  async publish(channel, message) {
    try {
      // Calculate message size in KB
      const messageString = JSON.stringify(message);
      const messageSizeBytes = new TextEncoder().encode(messageString).length;
      const messageSizeKB = (messageSizeBytes / 1024).toFixed(2);

      console.log(`📦 Publishing message size: ${messageSizeKB} KB to channel ${channel} (${message.type || 'message'})`);

      const result = await Promise.race([
        this.pubnub.publish({
          channel: channel,
          message: message
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('PubNub publish timeout')), 5000)
        )
      ]);
      console.log(`✅ Published to channel ${channel}:`, message.type || 'message');
      return result;
    } catch (error) {
      console.error('❌ Error publishing to PubNub:', error.message);
      // Don't throw error to prevent crashing the processing
      return null;
    }
  }

  // Publish segment processing progress
  async publishSegmentResult(channel, segmentData) {
    const message = {
      type: 'segment_result',
      timestamp: Date.now(),
      data: segmentData
    };
    return this.publish(channel, message);
  }

  // Publish processing status updates
  async publishProgress(channel, progress) {
    const message = {
      type: 'progress',
      timestamp: Date.now(),
      data: progress
    };
    return this.publish(channel, message);
  }

  // Publish final results
  async publishFinalResults(channel, results) {
    const message = {
      type: 'final_results',
      timestamp: Date.now(),
      data: results
    };
    return this.publish(channel, message);
  }

  // Publish error messages
  async publishError(channel, error) {
    const message = {
      type: 'error',
      timestamp: Date.now(),
      data: { error: error.message || error }
    };
    return this.publish(channel, message);
  }
}

module.exports = new PubNubClient();