const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOGS_DIR, `${date}.log`);
}

function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(getLogFilePath(), logMessage);
}

function logRequest(req, res, next) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${req.method} ${req.url}`;
  logToFile(logMessage);
  next();
}

function logError(message, error) {
  const errorMessage = `${message}: ${error.message}\n${error.stack}`;
  logToFile(`[ERROR] ${errorMessage}`);
  console.error(`[ERROR] ${message}:`, error);
}

function logInfo(message) {
  logToFile(`[INFO] ${message}`);
  console.log(`[INFO] ${message}`);
}

module.exports = {
  logRequest,
  logError,
  logInfo
}; 