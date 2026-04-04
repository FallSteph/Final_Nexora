import mongoose from 'mongoose';

const AppSettingsSchema = new mongoose.Schema({
  setting: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
}, { timestamps: true });

const AppSettings = mongoose.model('AppSettings', AppSettingsSchema);
export default AppSettings;