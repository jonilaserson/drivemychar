const RATE_LIMIT = 10; // requests per minute
const WINDOW_SIZE = 60 * 1000; // 1 minute in milliseconds

const requestCounts = new Map();
const lastResetTime = new Map();

function checkRateLimit(npcId) {
  const now = Date.now();
  
  // Initialize or reset counters if needed
  if (!requestCounts.has(npcId) || !lastResetTime.has(npcId)) {
    requestCounts.set(npcId, 0);
    lastResetTime.set(npcId, now);
  }
  
  // Reset counter if window has passed
  if (now - lastResetTime.get(npcId) >= WINDOW_SIZE) {
    requestCounts.set(npcId, 0);
    lastResetTime.set(npcId, now);
  }
  
  // Check if rate limit exceeded
  const currentCount = requestCounts.get(npcId);
  if (currentCount >= RATE_LIMIT) {
    const timeLeft = WINDOW_SIZE - (now - lastResetTime.get(npcId));
    return {
      allowed: false,
      retryAfter: Math.ceil(timeLeft / 1000)
    };
  }
  
  // Increment counter
  requestCounts.set(npcId, currentCount + 1);
  
  return {
    allowed: true,
    retryAfter: 0
  };
}

module.exports = {
  checkRateLimit
}; 