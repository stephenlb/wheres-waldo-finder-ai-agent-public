const sharp = require('sharp');
const fs = require('fs').promises;

async function processImageSegments(imagePath) {
  try {
    // Get image metadata
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    console.log(`Processing image: ${width}x${height} pixels`);
    
    const segments = [];
    const segmentSize = 300;
    const stepSize = 100; // More overlap to catch split features

    // Generate segments with 300x300px size and 100px steps for better overlap
    for (let y = 0; y <= height - segmentSize; y += stepSize) {
      for (let x = 0; x <= width - segmentSize; x += stepSize) {
        // Use full segment size since we're within boundaries
        const actualWidth = segmentSize;
        const actualHeight = segmentSize;

        const segment = {
          x1: x,
          y1: y,
          x2: x + actualWidth,
          y2: y + actualHeight,
          width: actualWidth,
          height: actualHeight
        };

        // Extract the segment as base64
        const extractParams = {
          left: Math.floor(x),
          top: Math.floor(y),
          width: Math.floor(actualWidth),
          height: Math.floor(actualHeight)
        };

        const segmentBuffer = await sharp(imagePath)
          .extract(extractParams)
          .modulate({ brightness: 1.1, saturation: 1.2 })
          .sharpen()
          .jpeg({ quality: 85 })
          .toBuffer();
        
        segment.imageData = segmentBuffer.toString('base64');
        segment.mediaType = 'image/jpeg';
        segments.push(segment);

        // Log segment details for debugging
        console.log(`Generated segment ${segments.length}: (${x},${y}) to (${x + actualWidth},${y + actualHeight})`);
      }
    }
    
    console.log(`Generated ${segments.length} segments`);
    return segments;
    
  } catch (error) {
    console.error('Error processing image segments:', error);
    throw new Error('Failed to process image segments: ' + error.message);
  }
}

module.exports = {
  processImageSegments
};