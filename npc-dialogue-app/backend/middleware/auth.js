const jwt = require('jsonwebtoken');
const User = require('../models/User');
const mongoose = require('mongoose');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // If MongoDB is not connected, allow access in development mode
  if (mongoose.connection.readyState !== 1) {
    console.log('[AUTH] MongoDB not connected, allowing access in dev mode');
    req.user = { _id: 'dev-user', name: 'Developer', email: 'dev@example.com' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // If MongoDB is not connected, set a dev user in development mode
  if (mongoose.connection.readyState !== 1) {
    console.log('[OPTIONAL_AUTH] MongoDB not connected, setting dev user');
    req.user = { _id: 'dev-user', name: 'Developer', email: 'dev@example.com' };
    return next();
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = user;
      }
    } catch (error) {
      // Token invalid, but continue without user
    }
  }
  
  next();
};

module.exports = { authenticateToken, optionalAuth }; 