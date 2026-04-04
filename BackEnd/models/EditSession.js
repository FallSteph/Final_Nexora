import mongoose from 'mongoose';

const editSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminName: {
    type: String,
    required: true
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'completed'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for faster queries
editSessionSchema.index({ userId: 1, status: 1 });

// Method to check if session is active
editSessionSchema.methods.isActive = function() {
  const now = new Date();
  const isNotExpired = this.expiresAt > now;
  // Heartbeat is sent every 30 seconds from frontend.
  // We allow 2 minutes of inactivity before clearing the session automatically.
  const isRecent = now - this.lastActivity < 2 * 60 * 1000; 
  return isNotExpired && isRecent && this.status === 'active';
};

const EditSession = mongoose.model('EditSession', editSessionSchema);
export default EditSession;