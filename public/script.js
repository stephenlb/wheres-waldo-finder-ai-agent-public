class WaldoFinder {
    constructor() {
        this.uploadArea = document.getElementById('uploadArea');
        this.imageInput = document.getElementById('imageInput');
        this.uploadForm = document.getElementById('uploadForm');
        this.findWaldoBtn = document.getElementById('findWaldoBtn');
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.resultsSection = document.getElementById('resultsSection');
        this.errorSection = document.getElementById('errorSection');
        this.resultCanvas = document.getElementById('resultCanvas');
        this.selectedFile = null;

        // PubNub integration
        this.pubnub = null;
        this.currentChannel = null;
        this.processedSegments = [];
        this.totalSegments = 0;
        this.isRealTimeMode = false;

        this.initializePubNub();
        this.initializeEventListeners();
    }

    initializePubNub() {
        // Initialize PubNub with demo keys
        this.pubnub = new PubNub({
            publishKey: 'demo',
            subscribeKey: 'demo',
            uuid: 'waldo-finder-client-' + Math.random().toString(36).substr(2, 9),
            ssl: true
        });
    }

    generateChannelName() {
        return 'waldo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    subscribeToChannel(channel) {
        this.pubnub.addListener({
            message: (messageEvent) => {
                this.handlePubNubMessage(messageEvent);
            }
        });

        this.pubnub.subscribe({
            channels: [channel]
        });

        console.log(`Subscribed to channel: ${channel}`);
    }

    unsubscribeFromChannel() {
        if (this.currentChannel) {
            this.pubnub.unsubscribe({
                channels: [this.currentChannel]
            });
            console.log(`Unsubscribed from channel: ${this.currentChannel}`);
        }
    }

    handlePubNubMessage(messageEvent) {
        const message = messageEvent.message;
        console.log('Received PubNub message:', message);

        switch (message.type) {
            case 'progress':
                this.handleProgressUpdate(message.data);
                break;
            case 'segment_result':
                this.handleSegmentResult(message.data);
                break;
            case 'final_results':
                this.handleFinalResults(message.data);
                break;
            case 'error':
                this.handleError(message.data);
                break;
        }
    }

    handleProgressUpdate(data) {
        this.updateProgress(data.percent || 0, data.message || 'Processing...');
        if (data.totalSegments) {
            this.totalSegments = data.totalSegments;
        }
    }

    handleSegmentResult(data) {
        this.processedSegments.push(data);
        this.updateRealtimeCanvas(data);

        const progressPercent = this.totalSegments > 0 ?
            20 + (this.processedSegments.length / this.totalSegments) * 70 :
            20 + this.processedSegments.length * 2;

        this.updateProgress(
            Math.min(progressPercent, 90),
            `Processing segment ${this.processedSegments.length}${this.totalSegments > 0 ? ` of ${this.totalSegments}` : ''}...`
        );
    }

    handleFinalResults(data) {
        this.updateProgress(100, 'Complete!');
        setTimeout(() => {
            this.hideProgress();
            this.showResults(data);
            this.unsubscribeFromChannel();
            this.isRealTimeMode = false;
        }, 500);
    }

    handleError(data) {
        console.error('PubNub error:', data);
        this.hideProgress();
        this.showError('Error: ' + data.error);
        this.unsubscribeFromChannel();
        this.isRealTimeMode = false;
    }

    initializeEventListeners() {
        // File input change
        this.imageInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });
        
        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleFileSelect(file);
            }
        });
        
        // Form submission
        this.uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.findWaldo();
        });
    }
    
    handleFileSelect(file) {
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.showError('Please select a valid image file.');
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            this.showError('File size must be less than 10MB.');
            return;
        }
        
        this.selectedFile = file;
        this.findWaldoBtn.disabled = false;
        
        // Update upload area to show selected file
        const uploadContent = this.uploadArea.querySelector('.upload-content');
        uploadContent.innerHTML = `
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10,9 9,9 8,9"></polyline>
            </svg>
            <h3>Image Selected: ${file.name}</h3>
            <p>File size: ${this.formatFileSize(file.size)}</p>
            <p class="file-types">Click "Find Objects!" to start processing</p>
        `;
        
        this.hideError();
        this.hideResults();
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async findWaldo() {
        if (!this.selectedFile) return;

        // Generate random channel for this processing session
        this.currentChannel = this.generateChannelName();
        this.processedSegments = [];
        this.totalSegments = 0;
        this.isRealTimeMode = true;

        // Subscribe to the channel for real-time updates
        this.subscribeToChannel(this.currentChannel);

        this.showProgress();
        this.hideError();
        this.hideResults();
        this.prepareCanvas();

        const formData = new FormData();
        formData.append('image', this.selectedFile);
        formData.append('channel', this.currentChannel);

        try {
            this.updateProgress(10, 'Uploading image and setting up real-time processing...');

            const response = await fetch('/find-waldo', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process image');
            }

            // The response will come through PubNub now, so we don't wait for it here
            this.updateProgress(20, 'Processing started! Results will appear in real-time...');

        } catch (error) {
            console.error('Error starting processing:', error);
            this.hideProgress();
            this.showError('Error starting processing: ' + error.message);
            this.unsubscribeFromChannel();
        }

        // Set a fallback timeout in case PubNub updates fail
        setTimeout(() => {
            if (this.isRealTimeMode && this.processedSegments.length === 0) {
                console.log('PubNub updates may have failed, falling back to polling...');
                this.updateProgress(50, 'Processing continues in background (real-time updates unavailable)...');

                // You could add polling logic here if needed
                // For now, just show a message that processing continues
            }
        }, 30000); // 30 second fallback timeout
    }
    
    showProgress() {
        this.progressSection.style.display = 'block';
        this.updateProgress(0, 'Starting...');
    }
    
    hideProgress() {
        this.progressSection.style.display = 'none';
    }
    
    updateProgress(percent, text) {
        this.progressFill.style.width = `${percent}%`;
        this.progressText.textContent = text;
    }

    prepareCanvas() {
        if (!this.selectedFile) return;

        // Show results section early for real-time updates
        this.resultsSection.style.display = 'block';

        // Initialize the canvas with the image
        const canvas = this.resultCanvas;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        const originalImg = document.getElementById('originalImage');

        img.onload = () => {
            // Set canvas size
            const maxWidth = 800;
            this.canvasScale = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
            canvas.width = img.width * this.canvasScale;
            canvas.height = img.height * this.canvasScale;

            // Draw image
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Store image data for redraws
            this.baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        };

        // Create object URL from selected file
        const imageUrl = URL.createObjectURL(this.selectedFile);
        img.src = imageUrl;
        originalImg.src = imageUrl;

        // Initialize summary
        const summary = document.getElementById('resultsSummary');
        summary.innerHTML = `
            <h3>🔄 Processing in Real-Time...</h3>
            <p><strong>Status:</strong> Analyzing image segments as they complete</p>
            <p><strong>Processed segments:</strong> <span id="liveSegmentCount">0</span></p>
        `;
    }

    updateRealtimeCanvas(segmentData) {
        if (!this.resultCanvas || !this.baseImageData) return;

        const canvas = this.resultCanvas;
        const ctx = canvas.getContext('2d');

        // Restore base image
        ctx.putImageData(this.baseImageData, 0, 0);

        // Draw all processed segments so far
        this.processedSegments.forEach((data, index) => {
            this.drawSegmentOnCanvas(ctx, data, index);
        });

        // Update live segment count
        const liveCount = document.getElementById('liveSegmentCount');
        if (liveCount) {
            liveCount.textContent = this.processedSegments.length;
        }
    }

    drawSegmentOnCanvas(ctx, segmentData, index) {
        const segment = segmentData.segment;
        const detection = segmentData.detection;

        if (!segment || !detection) return;

        const x = segment.x1 * this.canvasScale;
        const y = segment.y1 * this.canvasScale;
        const width = (segment.x2 - segment.x1) * this.canvasScale;
        const height = (segment.y2 - segment.y1) * this.canvasScale;

        // Draw heatmap for segments with probability >= 20%
        const showHeatmap = detection.probability >= 20;

        if (showHeatmap) {
            // Calculate heat intensity based on probability
            const intensity = detection.probability / 100;

            // Create gradient from center outward
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const radius = Math.max(width, height) / 2;

            const gradient = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, radius
            );

            // Color gradient based on probability score
            if (detection.probability >= 80) {
                gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(intensity * 1.2, 0.9)})`);
                gradient.addColorStop(0.1, `rgba(255, 255, 0, ${Math.min(intensity * 1.0, 0.8)})`);
                gradient.addColorStop(0.3, `rgba(255, 150, 0, ${Math.min(intensity * 0.9, 0.7)})`);
                gradient.addColorStop(0.6, `rgba(255, 0, 0, ${Math.min(intensity * 0.8, 0.6)})`);
                gradient.addColorStop(1, 'rgba(255, 0, 0, 0.1)');
            } else if (detection.probability >= 60) {
                gradient.addColorStop(0, `rgba(255, 255, 0, ${Math.min(intensity * 1.0, 0.8)})`);
                gradient.addColorStop(0.3, `rgba(255, 150, 0, ${Math.min(intensity * 0.8, 0.7)})`);
                gradient.addColorStop(0.7, `rgba(255, 0, 0, ${Math.min(intensity * 0.7, 0.6)})`);
                gradient.addColorStop(1, 'rgba(255, 0, 0, 0.1)');
            } else if (detection.probability >= 40) {
                gradient.addColorStop(0, `rgba(255, 150, 0, ${Math.min(intensity * 0.8, 0.7)})`);
                gradient.addColorStop(0.5, `rgba(255, 100, 0, ${Math.min(intensity * 0.7, 0.6)})`);
                gradient.addColorStop(1, 'rgba(200, 50, 0, 0.05)');
            } else if (detection.probability >= 25) {
                gradient.addColorStop(0, `rgba(255, 180, 0, ${Math.min(intensity * 0.7, 0.6)})`);
                gradient.addColorStop(0.6, `rgba(200, 120, 0, ${Math.min(intensity * 0.6, 0.5)})`);
                gradient.addColorStop(1, 'rgba(150, 80, 0, 0.05)');
            } else {
                gradient.addColorStop(0, `rgba(0, 150, 255, ${Math.min(intensity * 0.6, 0.5)})`);
                gradient.addColorStop(0.5, `rgba(0, 100, 200, ${Math.min(intensity * 0.5, 0.4)})`);
                gradient.addColorStop(1, 'rgba(0, 50, 150, 0.05)');
            }

            // Draw the heatmap circle
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x + width / 2, y + height / 2, radius, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Always draw grid number
        const gridNumber = index + 1;
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        // Draw background circle for grid number
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
        ctx.fill();

        // Draw white border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
        ctx.stroke();

        // Draw grid number text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gridNumber.toString(), centerX, centerY);
    }

    showResults(result) {
        this.resultsSection.style.display = 'block';
        
        // Update summary
        const summary = document.getElementById('resultsSummary');
        const foundCount = result.objectDetections.length;
        summary.innerHTML = `
            <h3>Analysis Complete!</h3>
            <p><strong>Segments analyzed:</strong> ${result.segmentsAnalyzed}</p>
            <p><strong>Object detections:</strong> ${foundCount}</p>
            ${foundCount > 0 ? '<p style="color: #00b894; font-weight: bold;">🎉 Objects found!</p>' : '<p style="color: #d63031;">❌ Objects not detected in this image</p>'}
        `;
        
        if (foundCount > 0) {
            summary.classList.add('found');
        }
        
        // Display image with bounding boxes
        this.displayResultImage(result);
        
        // Display detection details for all results
        this.displayDetections(result.allResults);
    }
    
    displayResultImage(result) {
        const canvas = this.resultCanvas;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        const originalImg = document.getElementById('originalImage');

        img.onload = () => {
            // Set canvas size
            const maxWidth = 800;
            const scale = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            // Draw image
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Draw heatmap overlay for all results (both detected and not detected)
            this.drawHeatmapOverlay(ctx, result.allResults, scale);
        };

        // Create object URL from selected file
        const imageUrl = URL.createObjectURL(this.selectedFile);
        img.src = imageUrl;

        // Also set the original reference image
        originalImg.src = imageUrl;
    }
    
    drawHeatmapOverlay(ctx, detections, scale) {
        // Create a heatmap based on detection feature counts
        detections.forEach((detection, index) => {
            const det = detection.detection;
            if (det) {
                const x = det.x1 * scale;
                const y = det.y1 * scale;
                const width = (det.x2 - det.x1) * scale;
                const height = (det.y2 - det.y1) * scale;

                // Always show grid numbers for all segments, but heatmap only for probability > 20%
                const showHeatmap = det.probability >= 20;

                if (showHeatmap) {
                    // Calculate heat intensity based on probability (0-100 scale)
                    const intensity = det.probability / 100;

                    // Create gradient from center outward
                    const centerX = x + width / 2;
                    const centerY = y + height / 2;
                    const radius = Math.max(width, height) / 2;

                    const gradient = ctx.createRadialGradient(
                        centerX, centerY, 0,
                        centerX, centerY, radius
                    );

                    // Color gradient based on probability score
                    if (det.probability >= 80) { // 80-100% (extremely hot - very likely Waldo!)
                        // Extremely hot - white hot center
                        gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(intensity * 1.2, 0.9)})`); // White center
                        gradient.addColorStop(0.1, `rgba(255, 255, 0, ${Math.min(intensity * 1.0, 0.8)})`); // Bright yellow
                        gradient.addColorStop(0.3, `rgba(255, 150, 0, ${Math.min(intensity * 0.9, 0.7)})`); // Orange
                        gradient.addColorStop(0.6, `rgba(255, 0, 0, ${Math.min(intensity * 0.8, 0.6)})`); // Red
                        gradient.addColorStop(1, 'rgba(255, 0, 0, 0.1)'); // Slightly visible edge
                    } else if (det.probability >= 60) { // 60-79% (very hot)
                        // Very hot - yellow center
                        gradient.addColorStop(0, `rgba(255, 255, 0, ${Math.min(intensity * 1.0, 0.8)})`); // Yellow center
                        gradient.addColorStop(0.3, `rgba(255, 150, 0, ${Math.min(intensity * 0.8, 0.7)})`); // Orange
                        gradient.addColorStop(0.7, `rgba(255, 0, 0, ${Math.min(intensity * 0.7, 0.6)})`); // Red
                        gradient.addColorStop(1, 'rgba(255, 0, 0, 0.1)'); // Slightly visible edge
                    } else if (det.probability >= 40) { // 40-59% (hot)
                        // Hot - orange to red
                        gradient.addColorStop(0, `rgba(255, 150, 0, ${Math.min(intensity * 0.8, 0.7)})`); // Orange center
                        gradient.addColorStop(0.5, `rgba(255, 100, 0, ${Math.min(intensity * 0.7, 0.6)})`); // Darker orange
                        gradient.addColorStop(1, 'rgba(200, 50, 0, 0.05)'); // Slightly visible edge
                    } else if (det.probability >= 25) { // 25-39% (warm)
                        // Warm - light orange
                        gradient.addColorStop(0, `rgba(255, 180, 0, ${Math.min(intensity * 0.7, 0.6)})`); // Light orange center
                        gradient.addColorStop(0.6, `rgba(200, 120, 0, ${Math.min(intensity * 0.6, 0.5)})`); // Darker orange
                        gradient.addColorStop(1, 'rgba(150, 80, 0, 0.05)'); // Slightly visible edge
                    } else { // 5-24% (cool - low probability)
                        // Cool - blue to indicate low probability
                        gradient.addColorStop(0, `rgba(0, 150, 255, ${Math.min(intensity * 0.6, 0.5)})`); // Light blue center
                        gradient.addColorStop(0.5, `rgba(0, 100, 200, ${Math.min(intensity * 0.5, 0.4)})`); // Darker blue
                        gradient.addColorStop(1, 'rgba(0, 50, 150, 0.05)'); // Slightly visible edge
                    }

                    // Draw the heatmap circle
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(x + width / 2, y + height / 2, radius, 0, 2 * Math.PI);
                    ctx.fill();
                }

                // Always draw grid number for all segments
                const gridNumber = index + 1;
                const centerX = x + width / 2;
                const centerY = y + height / 2;

                // Draw background circle for grid number
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
                ctx.fill();

                // Draw white border
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
                ctx.stroke();

                // Draw grid number text
                ctx.fillStyle = 'white';
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(gridNumber.toString(), centerX, centerY);
            }
        });
    }
    
    displayDetections(detections) {
        const detectionsList = document.getElementById('detectionsList');

        if (detections.length === 0) {
            detectionsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No object detections found</div>';
            return;
        }

        // Display the high-probability detections first, then show grid details
        const highProbDetections = detections.filter(d => d.found);
        const detectionHtml = highProbDetections.length > 0 ?
            `<h3>🎯 High-Probability Detections</h3>
             ${highProbDetections.map((detection, index) => {
                const det = detection.detection;
                const gridNumber = detections.indexOf(detection) + 1;
                return `
                    <div class="detection-item found">
                        <div class="detection-number">${gridNumber}</div>
                        <div class="detection-details">
                            <h4>Grid Segment #${gridNumber} - ${det.probability}% Probability</h4>
                            <div class="detection-attribute">
                                <strong>Coordinates:</strong> (${det.x1}, ${det.y1}) to (${det.x2}, ${det.y2})
                            </div>
                            <div class="probability-info">
                                <div class="probability-bar" style="background-color: #ddd; border-radius: 10px; height: 20px; margin: 10px 0;">
                                    <div class="probability-fill" style="width: ${det.probability}%; height: 100%; border-radius: 10px; background-color: ${det.probability >= 80 ? '#fff' : det.probability >= 60 ? '#ffff00' : det.probability >= 40 ? '#ff9600' : det.probability >= 25 ? '#ffb400' : '#0096ff'}; transition: width 0.3s ease;"></div>
                                </div>
                                <div class="reasoning" style="margin-top: 10px; padding: 10px; background-color: #f8f9fa; border-radius: 5px; font-size: 0.9em;">
                                    <strong>AI Analysis:</strong> ${det.reasoning}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}` : '';

        // Always show the complete grid mapping
        const gridMappingHtml = `
            <h3>📋 Complete Grid Analysis</h3>
            <div class="grid-mapping" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; margin-top: 20px;">
                ${detections.map((detection, index) => {
                    const det = detection.detection;
                    const gridNumber = index + 1;
                    const isHighProb = detection.found;
                    return `
                        <div class="grid-item ${isHighProb ? 'high-prob' : 'low-prob'}" style="border: 2px solid ${isHighProb ? '#00b894' : '#ddd'}; border-radius: 8px; padding: 15px; background: ${isHighProb ? '#f0fff4' : '#f8f9fa'};">
                            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                <div class="grid-number-badge" style="width: 30px; height: 30px; border-radius: 50%; background: ${isHighProb ? '#00b894' : '#6c757d'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 10px;">${gridNumber}</div>
                                <div>
                                    <strong>Grid ${gridNumber}</strong>
                                    <div style="color: ${isHighProb ? '#00b894' : '#6c757d'}; font-size: 0.9em;">${det.probability}% probability</div>
                                </div>
                            </div>
                            <div style="font-size: 0.85em; color: #666;">
                                <strong>Position:</strong> (${det.x1}, ${det.y1}) to (${det.x2}, ${det.y2})
                            </div>
                            ${det.reasoning ? `
                                <div style="margin-top: 8px; font-size: 0.8em; color: #555; font-style: italic;">
                                    "${det.reasoning.substring(0, 100)}${det.reasoning.length > 100 ? '...' : ''}"
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        detectionsList.innerHTML = detectionHtml + gridMappingHtml;
    }
    
    showError(message) {
        this.errorSection.style.display = 'block';
        document.getElementById('errorMessage').textContent = message;
    }
    
    hideError() {
        this.errorSection.style.display = 'none';
    }
    
    hideResults() {
        this.resultsSection.style.display = 'none';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WaldoFinder();
});