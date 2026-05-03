import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Bell, Save, Settings, RotateCcw, Mail, FileText, Loader2 } from 'lucide-react';
import { getAppConfig, applyAdminSettings } from '@/lib/utils';

interface NotificationSettings {
  emailNotifications: boolean;
  projectUpdates: boolean;
  updatedAt?: string;
  userEmail?: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const SystemSettings = () => {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [appConfig, setAppConfig] = useState({
    MAX_FILE_UPLOAD_MB: '10',
    BOARD_CREATION_LIMIT: '5',
  });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    projectUpdates: true,
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // 1. Load notification settings
      if (user && token) {
        const notifRes = await fetch(`${API_URL}/api/auth/notification-settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (notifRes.ok) {
          const data = await notifRes.json();
          if (data.success && data.settings) {
            setNotificationSettings(data.settings);
          }
        }
      }

      // 2. Load global app settings
      const appRes = await fetch(`${API_URL}/api/admin/settings`);
      if (appRes.ok) {
        const data = await appRes.json();
        setAppConfig(data);
        localStorage.setItem('app_configuration', JSON.stringify(data));
        applyAdminSettings();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user || !token) {
      toast.error("Please log in to save settings");
      return;
    }

    setSaving(true);

    try {
      // Save notification settings
      const notifResponse = await fetch(`${API_URL}/api/auth/notification-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notificationSettings)
      });

      if (!notifResponse.ok) {
        throw new Error('Failed to save notification settings');
      }

      // Save app config settings if admin
      if (isAdmin) {
        const adminRes = await fetch(`${API_URL}/api/admin/settings`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(appConfig)
        });

        if (!adminRes.ok) {
          throw new Error('Failed to save system configuration');
        }

        localStorage.setItem('app_configuration', JSON.stringify(appConfig));
        applyAdminSettings();
      }

      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: string, value: string) => {
    setAppConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateNotificationSetting = (key: keyof NotificationSettings, value: boolean) => {
    setNotificationSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const resetToDefaults = async () => {
    if (!user || !token) {
      toast.error("Please log in to reset settings");
      return;
    }
    
    setResetting(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/notification-settings/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.settings) {
          setNotificationSettings(data.settings);
          
          localStorage.setItem('notification_settings', JSON.stringify(data.settings));
          
          toast.success("Notification settings reset to defaults!", {
            description: "Default settings restored"
          });
        }
      }
    } catch (error) {
      console.error('Error resetting settings:', error);
      
      // Fallback to local reset
      const defaultNotifications: NotificationSettings = {
        emailNotifications: true,
        projectUpdates: true,
        userEmail: user?.email,
        updatedAt: new Date().toISOString()
      };
      
      setNotificationSettings(defaultNotifications);
      localStorage.setItem('notification_settings', JSON.stringify(defaultNotifications));
      
      toast.info("Settings reset locally", {
        description: "Default settings restored locally"
      });
    }
    
    if (isAdmin) {
      const defaultConfig = {
        MAX_FILE_UPLOAD_MB: '10',
        BOARD_CREATION_LIMIT: '5',
      };
      
      try {
        await fetch(`${API_URL}/api/admin/settings`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(defaultConfig)
        });
      } catch (e) {
        console.error('Failed to reset admin settings on server', e);
      }
      
      setAppConfig(defaultConfig);
      localStorage.setItem('app_configuration', JSON.stringify(defaultConfig));
      applyAdminSettings();
    }
    
    setResetting(false);
  };

  const testEmailNotification = async () => {
    try {
      toast.info("Testing email notification...");
      
      setTimeout(() => {
        if (notificationSettings.emailNotifications) {
          toast.success("Test passed!", {
            description: "Email notifications are enabled and would send"
          });
          
          console.log('📧 Test Email would be sent to:', user?.email);
        } else {
          toast.warning("Email notifications are disabled");
        }
      }, 1000);
      
    } catch (error) {
      console.error('Test notification error:', error);
      toast.error("Failed to test notification");
    }
  };

  const testProjectUpdateNotification = async () => {
    try {
      toast.info("Testing project update notification...");
      
      setTimeout(() => {
        if (notificationSettings.projectUpdates) {
          toast.success("Test passed!", {
            description: "Project update notifications are enabled"
          });
          
          console.log('📋 Project update would be sent for user:', user?.email);
        } else {
          toast.warning("Project updates are disabled");
        }
      }, 1000);
      
    } catch (error) {
      console.error('Test project update error:', error);
      toast.error("Failed to test project update");
    }
  };

  const handleEmailToggle = (checked: boolean) => {
    updateNotificationSetting('emailNotifications', checked);
    
    if (!checked) {
      toast.info("Email notifications disabled");
    } else {
      toast.success("Email notifications enabled");
    }
  };

  const handleProjectUpdatesToggle = (checked: boolean) => {
    updateNotificationSetting('projectUpdates', checked);
    
    if (!checked) {
      toast.info("Project updates disabled");
    } else {
      toast.success("Project updates enabled");
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden p-3 sm:p-6 md:p-8 space-y-6">
      <div className="w-full mx-auto flex flex-col h-full space-y-6 max-w-[1600px]">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8 flex-shrink-0 px-4">
          <div className="flex-1 min-w-0 text-left">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gradient truncate">System Settings</h1>
            <p className="text-muted-foreground text-sm sm:text-base truncate">
              {isAdmin ? 'Manage application configuration' : 'Manage your notification preferences'}
            </p>
          </div>
          
          {isAdmin && (
            <div className="flex gap-3 w-full sm:w-auto">
              <Button 
                variant="outline" 
                size="default"
                onClick={resetToDefaults}
                disabled={resetting}
                className="glass h-10 text-sm px-6 flex-1 sm:flex-none hover:bg-muted/50 transition-colors rounded-lg"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset
                  </>
                )}
              </Button>
              <Button 
                onClick={handleSaveSettings}
                disabled={saving}
                className="gradient-primary hover-glow h-10 text-sm px-6 flex-1 sm:flex-none transition-all duration-200 rounded-lg"
                size="default"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <Card className="glass-strong overflow-hidden border-0 sm:border flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4
            [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40"
          >
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-6xl w-full mx-auto space-y-8">
                
                {/* 🔔 NOTIFICATION SETTINGS */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-border/40 pb-3">
                    <Bell className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-bold">Notification Settings</h3>
                    {notificationSettings.updatedAt && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Updated: {new Date(notificationSettings.updatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-5 rounded-xl glass border border-border/50 transition-all hover:border-border/70 hover:shadow-md">
                      <div className="space-y-1">
                        <Label htmlFor="email-notifications" className="text-base font-medium">Email Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive important updates and alerts via email
                        </p>
                        {!notificationSettings.emailNotifications && (
                          <p className="text-xs text-amber-600 font-medium mt-1.5 flex items-center gap-1.5">
                            <span>⚠️</span> No emails will be sent to you
                          </p>
                        )}
                      </div>
                      <Switch
                        id="email-notifications"
                        checked={notificationSettings.emailNotifications}
                        onCheckedChange={handleEmailToggle}
                        className="scale-110 data-[state=checked]:bg-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between p-5 rounded-xl glass border border-border/50 transition-all hover:border-border/70 hover:shadow-md">
                      <div className="space-y-1">
                        <Label htmlFor="project-updates" className="text-base font-medium">Project Updates</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified when projects you're involved in have changes
                        </p>
                      </div>
                      <Switch
                        id="project-updates"
                        checked={notificationSettings.projectUpdates}
                        onCheckedChange={handleProjectUpdatesToggle}
                        className="scale-110 data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* ⚙️ ADMIN SECTIONS */}
                {isAdmin && (
                  <>
                    {/* Behavior Settings */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 border-b border-border/40 pb-3">
                        <Settings className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-bold">System Configuration</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="max-file-size" className="text-sm font-medium">Max File Upload (MB)</Label>
                          <Input
                            id="max-file-size"
                            type="number"
                            min="1"
                            max="100"
                            value={appConfig.MAX_FILE_UPLOAD_MB}
                            onChange={(e) => updateConfig('MAX_FILE_UPLOAD_MB', e.target.value)}
                            className="glass h-12 text-sm sm:text-base focus:ring-2 focus:ring-primary/20 rounded-lg px-4"
                          />
                          <p className="text-xs text-muted-foreground">
                            Maximum size for file uploads
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="board-limit" className="text-sm font-medium">Board Creation Limit (per User)</Label>
                          <Input
                            id="board-limit"
                            type="number"
                            min="1"
                            max="50"
                            value={appConfig.BOARD_CREATION_LIMIT || '5'}
                            onChange={(e) => updateConfig('BOARD_CREATION_LIMIT', e.target.value)}
                            className="glass h-12 text-sm sm:text-base focus:ring-2 focus:ring-primary/20 rounded-lg px-4"
                          />
                          <p className="text-xs text-muted-foreground">
                            Maximum number of boards a regular member can create
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Admin Info */}
                    <div className="p-5 rounded-xl glass border border-border/50 bg-muted/10 shadow-inner">
                      <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-primary" />
                        Admin Information
                      </h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm text-muted-foreground">Logged in as:</span>
                          <span className="text-xs sm:text-sm font-semibold">{user?.email}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm text-muted-foreground">Role:</span>
                          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primary">{user?.role}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-border/20 pt-2 mt-2">
                          <span className="text-xs sm:text-sm text-muted-foreground">Settings Storage:</span>
                          <span className="text-xs sm:text-sm text-green-500 font-bold">Cloud Database</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SystemSettings;