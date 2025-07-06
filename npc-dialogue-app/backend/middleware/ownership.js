const NPCOwnership = require('../models/NPCOwnership');
const mongoose = require('mongoose');

// Check if user owns the NPC
const checkOwnership = async (req, res, next) => {
  const { npcId } = req.params;
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // If MongoDB is not connected, allow access in development mode
  if (mongoose.connection.readyState !== 1) {
    console.log('[OWNERSHIP] MongoDB not connected, allowing access in dev mode');
    req.isOwner = true;
    return next();
  }

  try {
    const ownership = await NPCOwnership.findOne({ npcId, ownerId: userId });
    
    if (!ownership) {
      return res.status(403).json({ error: 'Access denied - you do not own this NPC' });
    }
    
    req.npcOwnership = ownership;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
};

// Check if user can access NPC (owner or public)
const checkAccess = async (req, res, next) => {
  const { npcId } = req.params;
  const userId = req.user?._id;

  // If MongoDB is not connected, allow access in development mode
  if (mongoose.connection.readyState !== 1) {
    console.log('[ACCESS] MongoDB not connected, allowing access in dev mode');
    req.isOwner = true;
    return next();
  }

  try {
    const ownership = await NPCOwnership.findOne({ npcId });
    
    if (!ownership) {
      return res.status(404).json({ error: 'NPC not found' });
    }

    // If user is owner, allow full access
    if (userId && ownership.ownerId.equals(userId)) {
      req.npcOwnership = ownership;
      req.isOwner = true;
      return next();
    }

    // If NPC is public, allow read-only access
    if (ownership.isPublic) {
      req.npcOwnership = ownership;
      req.isOwner = false;
      return next();
    }

    // Check if access is via share token
    const shareToken = req.query.token || req.body.token;
    if (shareToken && ownership.shareToken === shareToken) {
      req.npcOwnership = ownership;
      req.isOwner = false;
      return next();
    }

    return res.status(403).json({ error: 'Access denied' });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
};

module.exports = { checkOwnership, checkAccess }; 