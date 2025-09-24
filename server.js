const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const { processImageSegments } = require('./utils/imageProcessor');
const { findWaldoInSegments } = require('./utils/anthropicClient');
const pubNubClient = require('./utils/pubNubClient');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/find-waldo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const imagePath = req.file.path;
    const channel = req.body.channel;

    // Validate channel parameter
    if (!channel) {
      return res.status(400).json({ error: 'Channel parameter is required for real-time updates' });
    }

    console.log(`Processing image with real-time updates on channel: ${channel}`);

    // Send immediate response to client - processing will continue via PubNub
    res.json({
      success: true,
      message: 'Processing started',
      channel: channel
    });

    // Process image asynchronously with real-time updates
    processImageWithRealTimeUpdates(imagePath, channel)
      .catch(error => {
        console.error('Error in background processing:', error);
        // Try to publish error but don't await it to avoid blocking
        pubNubClient.publishError(channel, error).catch(pubNubError => {
          console.error('Failed to publish error to PubNub:', pubNubError.message);
        });
      });

  } catch (error) {
    console.error('Error starting image processing:', error);
    res.status(500).json({
      error: 'Failed to start processing',
      details: error.message
    });
  }
});

async function processImageWithRealTimeUpdates(imagePath, channel) {
  try {
    // Publish initial progress (non-blocking)
    pubNubClient.publishProgress(channel, {
      percent: 5,
      message: 'Processing image segments...'
    }).catch(e => console.error('Failed to publish progress:', e.message));

    // Process image into segments
    console.log('Processing image segments...');
    const segments = await processImageSegments(imagePath);

    // Publish segments count (non-blocking)
    pubNubClient.publishProgress(channel, {
      percent: 15,
      message: `Generated ${segments.length} segments, starting AI analysis...`,
      totalSegments: segments.length
    }).catch(e => console.error('Failed to publish progress:', e.message));

    // Send segments to Anthropic API with real-time publishing
    console.log(`Analyzing ${segments.length} segments for objects...`);
    const results = await findWaldoInSegments(segments, channel);

    // Publish final results (non-blocking)
    pubNubClient.publishFinalResults(channel, {
      success: true,
      segmentsAnalyzed: segments.length,
      objectDetections: results.filter(r => r.found),
      allResults: results
    }).catch(e => console.error('Failed to publish final results:', e.message));

    // Clean up uploaded file
    const fs = require('fs');
    fs.unlinkSync(imagePath);

    console.log(`✅ Processing complete for channel ${channel}`);

  } catch (error) {
    console.error('❌ Error in processImageWithRealTimeUpdates:', error);

    // Try to publish error (non-blocking)
    pubNubClient.publishError(channel, error).catch(e =>
      console.error('Failed to publish error:', e.message)
    );

    // Clean up uploaded file even on error
    try {
      const fs = require('fs');
      fs.unlinkSync(imagePath);
    } catch (cleanupError) {
      console.error('Error cleaning up file:', cleanupError);
    }
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({ error: 'Only image files are allowed' });
  }
  
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Object Detection Finder server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to start detecting objects!`);
});