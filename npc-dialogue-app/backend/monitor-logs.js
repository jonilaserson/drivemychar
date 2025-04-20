const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs', 'model_prompts.log');

// Keep track of the last position we read from
let lastPosition = 0;

function displayLastLines(numLines = 10) {
    try {
        if (!fs.existsSync(LOG_FILE)) {
            console.log('Log file does not exist yet.');
            return;
        }

        const stats = fs.statSync(LOG_FILE);
        const fileSize = stats.size;
        
        // If file size is smaller than last position, file was truncated
        if (fileSize < lastPosition) {
            lastPosition = 0;
        }
        
        // If we've already read everything, just return
        if (lastPosition >= fileSize) {
            return;
        }
        
        // Read only the new content
        const newContent = fs.readFileSync(LOG_FILE, { start: lastPosition, end: fileSize });
        lastPosition = fileSize;
        
        if (newContent.length === 0) {
            return;
        }
        
        // Split into lines and filter out empty ones
        const lines = newContent.toString().split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            return;
        }
        
        console.log('\nNew log entries:');
        console.log('----------------------------------------');
        
        // Process each line
        lines.forEach(line => {
            try {
                // Try to parse as JSON if it looks like JSON
                if (line.startsWith('[') || line.startsWith('{')) {
                    const entry = JSON.parse(line);
                    console.log(JSON.stringify(entry, null, 2));
                } else {
                    // Just print the line as is
                    console.log(line);
                }
            } catch (e) {
                // If parsing fails, just print the line
                console.log(line);
            }
        });
        
        console.log('----------------------------------------');
    } catch (error) {
        console.error('Error reading log file:', error);
    }
}

// Initial display of last lines
console.log('Starting log monitor...');
console.log('Press Ctrl+C to exit');
console.log('----------------------------------------');

// Display initial content
if (fs.existsSync(LOG_FILE)) {
    const stats = fs.statSync(LOG_FILE);
    lastPosition = Math.max(0, stats.size - 5000); // Start from last 5000 bytes
    displayLastLines(20);
}

// Set up file watcher
const watcher = fs.watch(LOG_FILE, (eventType) => {
    if (eventType === 'change') {
        displayLastLines();
    }
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping log monitor...');
    watcher.close();
    process.exit(0);
}); 