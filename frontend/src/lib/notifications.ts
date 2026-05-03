
export interface NotificationSettings {
  emailNotifications: boolean;
  projectUpdates: boolean;
  updatedAt?: string;
  userEmail?: string;
}

export interface SystemNotificationConfig {
  EMAIL_NOTIFICATIONS_ENABLED: boolean;
}

// Default settings
const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailNotifications: true,
  projectUpdates: true,
};

const DEFAULT_SYSTEM_CONFIG: SystemNotificationConfig = {
  EMAIL_NOTIFICATIONS_ENABLED: true,
};

// Load user notification settings
export const loadUserNotificationSettings = (): NotificationSettings => {
  try {
    const stored = localStorage.getItem('notification_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        emailNotifications: parsed.emailNotifications ?? true,
        projectUpdates: parsed.projectUpdates ?? true,
        userEmail: parsed.userEmail,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch (error) {
    console.error('Error loading notification settings:', error);
  }
  return { ...DEFAULT_NOTIFICATION_SETTINGS };
};

// Save user notification settings
export const saveUserNotificationSettings = (settings: NotificationSettings): void => {
  try {
    localStorage.setItem('notification_settings', JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving notification settings:', error);
  }
};

// Load system notification config
export const loadSystemNotificationConfig = (): SystemNotificationConfig => {
  try {
    const stored = localStorage.getItem('app_configuration');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        EMAIL_NOTIFICATIONS_ENABLED: parsed.EMAIL_NOTIFICATIONS_ENABLED === 'true',
      };
    }
  } catch (error) {
    console.error('Error loading system config:', error);
  }
  return { ...DEFAULT_SYSTEM_CONFIG };
};

// Check if email notifications are enabled (both system-wide and user-specific)
export const shouldSendEmailNotification = (): boolean => {
  const systemConfig = loadSystemNotificationConfig();
  const userSettings = loadUserNotificationSettings();
  
  // Both system-wide and user-specific must be enabled
  return systemConfig.EMAIL_NOTIFICATIONS_ENABLED && userSettings.emailNotifications;
};

// Check if project update notifications are enabled
export const shouldSendProjectUpdateNotification = (): boolean => {
  const userSettings = loadUserNotificationSettings();
  return userSettings.projectUpdates;
};

// Send email notification (mock function - replace with real email service)
export const sendEmailNotification = async (to: string, subject: string, body: string): Promise<boolean> => {
  if (!shouldSendEmailNotification()) {
    console.log('Email notifications are disabled. Skipping email to:', to);
    return false;
  }
  
  try {
    // Here you would integrate with your email service (Nodemailer, SendGrid, etc.)
    console.log('📧 Sending email notification:');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Body:', body);
    
    // Mock implementation - replace with real email sending logic
    // await fetch('/api/send-email', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ to, subject, body }),
    // });
    
    return true;
  } catch (error) {
    console.error('Error sending email notification:', error);
    return false;
  }
};

// Send project update notification
export const sendProjectUpdateNotification = async (
  userId: string, 
  projectId: string, 
  projectName: string, 
  updateType: string
): Promise<boolean> => {
  if (!shouldSendProjectUpdateNotification()) {
    console.log('Project update notifications are disabled for user:', userId);
    return false;
  }
  
  try {
    // Get user email (you would fetch this from your database)
    const userSettings = loadUserNotificationSettings();
    const userEmail = userSettings.userEmail;
    
    if (!userEmail) {
      console.warn('No user email found for notifications');
      return false;
    }
    
    const subject = `Project Update: ${projectName}`;
    const body = `
      Hello,
      
      There has been an update to the project "${projectName}".
      
      Update Type: ${updateType}
      Project ID: ${projectId}
      
      Please check the project dashboard for more details.
      
      Best regards,
      Your Application Team
    `;
    
    return await sendEmailNotification(userEmail, subject, body);
  } catch (error) {
    console.error('Error sending project update notification:', error);
    return false;
  }
};

// Send generic notification (for other types of notifications)
export const sendNotification = async (
  userId: string,
  type: 'info' | 'warning' | 'success' | 'error',
  title: string,
  message: string,
  sendEmail: boolean = false
): Promise<boolean> => {
  try {
    // 1. Store notification in database (you would implement this)
    console.log(`📢 Storing ${type} notification for user ${userId}: ${title}`);
    
    // 2. Send email if requested and enabled
    if (sendEmail && shouldSendEmailNotification()) {
      const userSettings = loadUserNotificationSettings();
      const userEmail = userSettings.userEmail;
      
      if (userEmail) {
        const emailBody = `
          ${message}
          
          Notification Type: ${type}
          Title: ${title}
          
          Best regards,
          Your Application Team
        `;
        
        return await sendEmailNotification(userEmail, title, emailBody);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
};