const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs', 'model_prompts.log');

function analyzeLogs() {
    try {
        if (!fs.existsSync(LOG_FILE)) {
            console.log('Log file does not exist yet.');
            return;
        }

        const content = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        // Initialize counters
        const stats = {
            totalRequests: 0,
            gptRequests: 0,
            dalleRequests: 0,
            errors: 0,
            averageResponseTime: 0,
            totalResponseTime: 0,
            responseTimes: [],
            errorTypes: {},
            timeDistribution: {
                '00:00-06:00': 0,
                '06:00-12:00': 0,
                '12:00-18:00': 0,
                '18:00-24:00': 0
            },
            prompts: [],
            rawLogs: []
        };

        // Process each log entry
        lines.forEach(line => {
            try {
                // Try to parse as JSON first
                if (line.startsWith('[') || line.startsWith('{')) {
                    const entry = JSON.parse(line);
                    
                    // Handle GPT prompts
                    if (entry.type === 'gpt_prompt') {
                        stats.gptRequests++;
                        if (entry.prompt) {
                            stats.prompts.push({
                                type: 'GPT',
                                timestamp: entry.timestamp,
                                prompt: entry.prompt
                            });
                        }
                    }
                    
                    // Handle DALL-E prompts
                    if (entry.type === 'dalle_prompt') {
                        stats.dalleRequests++;
                        if (entry.prompt) {
                            stats.prompts.push({
                                type: 'DALL-E',
                                timestamp: entry.timestamp,
                                prompt: entry.prompt
                            });
                        }
                    }

                    // Track errors
                    if (entry.type === 'error') {
                        stats.errors++;
                        const errorType = entry.error.split(':')[0];
                        stats.errorTypes[errorType] = (stats.errorTypes[errorType] || 0) + 1;
                    }

                    // Calculate response times
                    if (entry.responseTime) {
                        stats.totalResponseTime += entry.responseTime;
                        stats.responseTimes.push(entry.responseTime);
                    }

                    // Analyze time distribution
                    if (entry.timestamp) {
                        const hour = new Date(entry.timestamp).getHours();
                        if (hour >= 0 && hour < 6) stats.timeDistribution['00:00-06:00']++;
                        else if (hour >= 6 && hour < 12) stats.timeDistribution['06:00-12:00']++;
                        else if (hour >= 12 && hour < 18) stats.timeDistribution['12:00-18:00']++;
                        else stats.timeDistribution['18:00-24:00']++;
                    }
                    
                    stats.totalRequests++;
                } else {
                    // Handle non-JSON logs (like error messages)
                    if (line.includes('Error generating image') || line.includes('Error:')) {
                        stats.errors++;
                        const errorType = line.split(':')[0].trim();
                        stats.errorTypes[errorType] = (stats.errorTypes[errorType] || 0) + 1;
                    }
                    
                    // Store raw logs for display
                    stats.rawLogs.push(line);
                }
            } catch (e) {
                // If JSON parsing fails, store as raw log
                stats.rawLogs.push(line);
            }
        });

        // Calculate averages if we have response times
        if (stats.responseTimes.length > 0) {
            stats.averageResponseTime = stats.totalResponseTime / stats.responseTimes.length;
            stats.responseTimes.sort((a, b) => a - b);
            const medianIndex = Math.floor(stats.responseTimes.length / 2);
            stats.medianResponseTime = stats.responseTimes[medianIndex];
        }

        // Print statistics
        console.log('\nLog Analysis Results:');
        console.log('----------------------------------------');
        console.log(`Total Requests: ${stats.totalRequests}`);
        console.log(`GPT Requests: ${stats.gptRequests}`);
        console.log(`DALL-E Requests: ${stats.dalleRequests}`);
        console.log(`Total Errors: ${stats.errors}`);
        
        if (stats.responseTimes.length > 0) {
            console.log(`Average Response Time: ${stats.averageResponseTime.toFixed(2)}ms`);
            console.log(`Median Response Time: ${stats.medianResponseTime}ms`);
        }
        
        console.log('\nError Types:');
        Object.entries(stats.errorTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });

        console.log('\nTime Distribution:');
        Object.entries(stats.timeDistribution).forEach(([period, count]) => {
            const percentage = ((count / stats.totalRequests) * 100).toFixed(1);
            console.log(`  ${period}: ${count} requests (${percentage}%)`);
        });

        console.log('\nPrompts:');
        console.log('----------------------------------------');
        stats.prompts.forEach((prompt, index) => {
            const date = new Date(prompt.timestamp).toLocaleString();
            console.log(`\n[${index + 1}] ${prompt.type} Prompt (${date}):`);
            console.log(prompt.prompt);
            console.log('----------------------------------------');
        });

        console.log('\nRaw Logs:');
        console.log('----------------------------------------');
        stats.rawLogs.forEach((log, index) => {
            console.log(`\n[${index + 1}] ${log}`);
        });

        console.log('\n');
    } catch (error) {
        console.error('Error analyzing logs:', error);
    }
}

// Run analysis
analyzeLogs(); 