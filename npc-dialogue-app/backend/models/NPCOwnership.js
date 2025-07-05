const mongoose = require('mongoose');

const npcOwnershipSchema = new mongoose.Schema({
  npcId: {
    type: String,
    required: true,
    unique: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  shareToken: {
    type: String,
    unique: true,
    sparse: true
  }
});

module.exports = mongoose.model('NPCOwnership', npcOwnershipSchema); 