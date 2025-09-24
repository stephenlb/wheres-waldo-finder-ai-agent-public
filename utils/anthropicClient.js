const Anthropic = require('@anthropic-ai/sdk');
const pubNubClient = require('./pubNubClient');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const waldoDetectionTool = {
  name: "report_waldo_probability",
  description: `Analyze this cartoon image segment using a two-stage approach to determine if Waldo is present:

STAGE 1 - HUMAN FIGURE WITH STRIPED CLOTHING FILTER:
First, look for human figures wearing red and white horizontal striped clothing. If NO human figure with striped clothing is present, score 0-5% regardless of other features.

STAGE 2 - WALDO FEATURE ANALYSIS:
Only for human figures with striped clothing, analyze these Waldo-specific features:
- Red and white horizontal striped shirt (must be on a person)
- Red and white striped knit hat/beanie
- Round black-rimmed glasses
- Brown hair (visible under hat)
- Blue jeans
- Walking stick/cane or camera accessories
- Tall, thin body proportions
- Friendly facial features

IMPORTANT: Striped objects that are NOT clothing on people (tents, poles, signs, etc.) should score near 0%. Only human figures with the complete Waldo combination should score high.`,
  input_schema: {
    type: "object",
    properties: {
      waldo_probability: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Probability score (0-100) that Waldo is present in this image segment"
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of what features or evidence led to this probability score"
      }
    },
    required: ["waldo_probability", "reasoning"]
  }
};

async function findWaldoInSegments(segments, channel = null) {
  const results = [];
  const BATCH_SIZE = 20;

  // Split segments into batches of 20
  const batches = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${segments.length} segments in ${batches.length} batches of ${BATCH_SIZE}...`);

  // Process batches concurrently
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStartIndex = batchIndex * BATCH_SIZE;

    console.log(`\nProcessing batch ${batchIndex + 1}/${batches.length} (${batch.length} segments)...`);

    // Process all segments in the batch concurrently
    const batchPromises = batch.map(async (segment, indexInBatch) => {
      const globalIndex = batchStartIndex + indexInBatch;

      try {
        console.log(`Processing segment ${globalIndex + 1}/${segments.length}...`);
        const result = await analyzeSegment(segment);

        // Publish individual segment result immediately if channel is provided
        if (channel) {
          // Only send essential data to avoid URI length issues
          const lightweightResult = {
            segmentIndex: globalIndex,
            totalSegments: segments.length,
            found: result.found,
            segment: {
              x1: segment.x1,
              y1: segment.y1,
              x2: segment.x2,
              y2: segment.y2,
              width: segment.width,
              height: segment.height
            },
            detection: {
              x1: result.detection.x1,
              y1: result.detection.y1,
              x2: result.detection.x2,
              y2: result.detection.y2,
              probability: result.detection.probability,
              reasoning: result.detection.reasoning.substring(0, 200) // Truncate reasoning to avoid long messages
            }
          };

          // Publish result without waiting (non-blocking)
          pubNubClient.publishSegmentResult(channel, lightweightResult).catch(pubNubError => {
            console.error(`Failed to publish segment ${globalIndex + 1} result:`, pubNubError.message);
          });
        }

        console.log(`✅ Processed segment ${globalIndex + 1}/${segments.length} - Probability: ${result.detection.probability}%`);
        return { result, globalIndex };

      } catch (segmentError) {
        console.error(`❌ Error processing segment ${globalIndex + 1}:`, segmentError);
        const failedResult = {
          segment: segment,
          found: false,
          detection: {
            x1: segment.x1,
            y1: segment.y1,
            x2: segment.x2,
            y2: segment.y2,
            probability: 0,
            reasoning: "Segment processing error: " + segmentError.message
          },
          error: segmentError.message
        };

        // Publish failed segment result if channel is provided
        if (channel) {
          const lightweightFailedResult = {
            segmentIndex: globalIndex,
            totalSegments: segments.length,
            found: false,
            segment: {
              x1: segment.x1,
              y1: segment.y1,
              x2: segment.x2,
              y2: segment.y2,
              width: segment.width,
              height: segment.height
            },
            detection: {
              x1: segment.x1,
              y1: segment.y1,
              x2: segment.x2,
              y2: segment.y2,
              probability: 0,
              reasoning: "Processing error"
            },
            error: segmentError.message
          };

          // Publish failed result without waiting (non-blocking)
          pubNubClient.publishSegmentResult(channel, lightweightFailedResult).catch(pubNubError => {
            console.error(`Failed to publish segment ${globalIndex + 1} error:`, pubNubError.message);
          });
        }

        return { result: failedResult, globalIndex };
      }
    });

    // Wait for all segments in this batch to complete
    const batchResults = await Promise.allSettled(batchPromises);

    // Add results to the main results array, maintaining original order
    batchResults.forEach((promiseResult, indexInBatch) => {
      const globalIndex = batchStartIndex + indexInBatch;
      if (promiseResult.status === 'fulfilled') {
        results[globalIndex] = promiseResult.value.result;
      } else {
        console.error(`Batch promise failed for segment ${globalIndex + 1}:`, promiseResult.reason);
        // Create a fallback failed result
        results[globalIndex] = {
          segment: batch[indexInBatch],
          found: false,
          detection: {
            x1: batch[indexInBatch].x1,
            y1: batch[indexInBatch].y1,
            x2: batch[indexInBatch].x2,
            y2: batch[indexInBatch].y2,
            probability: 0,
            reasoning: "Promise failed: " + promiseResult.reason
          },
          error: promiseResult.reason
        };
      }
    });

    console.log(`✅ Completed batch ${batchIndex + 1}/${batches.length}`);

    // Small delay between batches to avoid overwhelming the API
    if (batchIndex < batches.length - 1) {
      console.log('Waiting 5ms before next batch...');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  // Final summary
  const foundResults = results.filter(r => r && r.found);
  console.log(`\n🎯 SEARCH COMPLETE: Found ${foundResults.length} detections out of ${results.length} segments processed.`);

  return results;
}

async function analyzeSegment(segment) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-1-20250805",
      max_tokens: 1000,
      tools: [waldoDetectionTool],
      tool_choice: { type: "tool", name: "report_waldo_probability" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `TWO-STAGE WALDO DETECTION PROCESS:

STAGE 1 - QUALIFYING CHECK:
Look for HUMAN FIGURES wearing red and white horizontal striped clothing. If no such figure exists, stop here and score 0-5%.

STAGE 2 - WALDO PROBABILITY ASSESSMENT:
For qualifying striped figures only, evaluate the complete Waldo profile:

WALDO'S COMPLETE DESCRIPTION:
- RED AND WHITE HORIZONTAL STRIPED SHIRT (on a person)
- RED AND WHITE HORIZONTAL STRIPED KNIT HAT/BEANIE
- ROUND BLACK-RIMMED GLASSES
- BROWN HAIR (usually visible under the hat)
- BLUE JEANS
- WALKING STICK/CANE or CAMERA around neck
- Tall, thin body proportions
- Friendly facial appearance

REVISED SCORING GUIDANCE:
- 80-100%: Human with striped shirt + hat + glasses + multiple features (clear Waldo)
- 60-79%: Human with striped shirt + 2-3 additional Waldo features (likely Waldo)
- 40-59%: Human with striped shirt + 1 additional feature (possible Waldo)
- 20-39%: Human with striped clothing but unclear/missing other features
- 5-19%: Human figure with questionable striped pattern
- 0-4%: No human with striped clothing, or striped objects only

CRITICAL: Striped tents, poles, signs, or other objects WITHOUT a human figure = 0-5% maximum. Only complete human figures matter for scoring.`
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: segment.mediaType || "image/png",
                data: segment.imageData
              }
            }
          ]
        }
      ]
    });

    // Log detailed analysis for debugging
    console.log(`\n=== Analyzing segment (${segment.x1},${segment.y1}) to (${segment.x2},${segment.y2}) ===`);

    const toolUse = response.content.find(content => content.type === 'tool_use');

    if (toolUse && toolUse.name === 'report_waldo_probability') {
      const detection = toolUse.input;

      // Log the probability detection details
      console.log(`Waldo probability: ${detection.waldo_probability}%`);
      console.log(`Reasoning: ${detection.reasoning}`);

      // Use probability threshold - anything above 20% gets highlighted
      const isHighlightSegment = detection.waldo_probability >= 20;

      console.log(`Highlight segment: ${isHighlightSegment}`);

      return {
        segment: segment,
        found: isHighlightSegment,
        detection: {
          x1: segment.x1,
          y1: segment.y1,
          x2: segment.x2,
          y2: segment.y2,
          probability: detection.waldo_probability,
          reasoning: detection.reasoning
        }
      };
    }
    
    return {
      segment: segment,
      found: false,
      detection: {
        x1: segment.x1,
        y1: segment.y1,
        x2: segment.x2,
        y2: segment.y2,
        probability: 0,
        reasoning: "No tool response received"
      }
    };
    
  } catch (error) {
    console.error('Error analyzing segment:', error);
    return {
      segment: segment,
      found: false,
      detection: {
        x1: segment.x1,
        y1: segment.y1,
        x2: segment.x2,
        y2: segment.y2,
        probability: 0,
        reasoning: "Error during analysis"
      },
      error: error.message
    };
  }
}

module.exports = {
  findWaldoInSegments
};