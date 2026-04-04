import AppSettings from '../models/AppSettings.js';

// @desc    Get all application settings
// @route   GET /api/admin/settings
// @access  Public (so all users can apply theme/etc)
export const getSettings = async (req, res) => {
  try {
    const settings = await AppSettings.find({});
    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.setting] = setting.value;
      return acc;
    }, {});
    
    // Return default values if not found in DB
    const defaults = {
      MAX_FILE_UPLOAD_MB: '10',
      APP_THEME: 'default',
      BOARD_CREATION_LIMIT: '5'
    };

    res.json({ ...defaults, ...settingsMap });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update application settings
// @route   PUT /api/admin/settings
// @access  Private (Admin)
export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    const updatePromises = Object.keys(updates).map(key => 
      AppSettings.findOneAndUpdate(
        { setting: key }, 
        { value: updates[key] }, 
        { upsert: true, new: true }
      )
    );
    
    await Promise.all(updatePromises);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};