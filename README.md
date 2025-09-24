# Where's Waldo Finder

AI-powered Where's Waldo finder using image segmentation and Anthropic's Claude vision Multimodal model.

<img width="987" height="690" alt="image" src="https://github.com/user-attachments/assets/ccfa8710-fcdb-4a98-a962-708c3cdcd269" />

## Features

- Upload Where's Waldo images and let AI find Waldo for you
- Real-time progress updates via PubNub
- Image segmentation for better accuracy on large images
- Web-based interface with drag-and-drop upload

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   PORT=3001
   ```

## Getting Your Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and paste it in your `.env` file

## Usage

1. Start the development server:
   ```bash
   npm run dev
   ```

   Or start the production server:
   ```bash
   npm start
   ```

2. Open your browser and go to `http://localhost:3001`

3. Upload a Where's Waldo image using the drag-and-drop interface

4. Watch as the AI analyzes the image and finds Waldo with real-time updates

## How It Works

1. **Image Upload**: Users upload Where's Waldo images through the web interface
2. **Image Segmentation**: Large images are automatically segmented into smaller chunks for better AI analysis
3. **AI Analysis**: Each segment is analyzed by Anthropic's Claude vision model to locate Waldo
4. **Real-time Updates**: Progress and results are broadcast in real-time using PubNub
5. **Results Display**: Found locations are highlighted on the original image

## File Structure

- `server.js` - Express server and main application logic
- `public/` - Static web files (HTML, CSS, JavaScript)
- `utils/` - Utility modules for image processing and AI analysis
- `uploads/` - Temporary storage for uploaded images
- `images/` - Sample Waldo images

## Dependencies

- **@anthropic-ai/sdk**: Claude AI integration
- **express**: Web server framework
- **multer**: File upload handling
- **sharp**: Image processing
- **pubnub**: Real-time messaging
- **cors**: Cross-origin resource sharing
- **dotenv**: Environment variable management

## License

MIT
