// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Mail, Lock, Upload, X, Save, UserCircle, Shield, Plus, Key, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { uploadAvatarToGoogleDrive } from "@/types/googleDriveUploader";
type SettingsTab = 'profile' | 'password';
import { getGoogleDriveImageUrl, isGoogleDriveUrl } from '@/utils/imageUtils';

// Profile Settings Content
const ProfileSettings = () => {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{firstName?: string; lastName?: string; email?: string}>({});
  
  const hasChanges = firstName !== user?.firstName || 
                  lastName !== user?.lastName || 
                  (user?.authProvider === 'local' && email !== user?.email) ||
                  selectedAvatarFile !== null;

  // Update avatar when user profile changes
  useEffect(() => {
    if (user?.avatar) {
      setPreviewAvatar(user.avatar);
      console.log('Loaded user avatar:', user.avatar);
    }
  }, [user?.avatar]);

  // Fix Google Drive URLs for display using thumbnails
  const getFixedAvatarUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    
    console.log('Original avatar URL:', url);
    
    // If it's already a thumbnail URL, use it directly
    if (url.includes('drive.google.com/thumbnail')) {
      console.log('Using existing thumbnail URL');
      return url;
    }
    
    // If it's a regular Google Drive URL, convert to thumbnail
    if (url.includes('drive.google.com')) {
      const fileIdMatch = url.match(/[-\w]{25,}/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[0];
        const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
        console.log('Converted to thumbnail URL:', thumbnailUrl);
        return thumbnailUrl;
      }
    }
    
    console.log('Using direct URL (not Google Drive):', url);
    return url;
  };

  // Test if image loads
  const testImageLoad = (url: string) => {
    const img = new Image();
    img.onload = () => console.log('✅ Test: Image loads successfully');
    img.onerror = () => console.log('❌ Test: Image failed to load');
    img.src = url;
  };

  // Get the current avatar URL for display
  const currentAvatarUrl = getFixedAvatarUrl(previewAvatar || user?.avatar);

  // Test the URL when it changes
  useEffect(() => {
    if (currentAvatarUrl) {
      console.log('Testing image URL:', currentAvatarUrl);
      testImageLoad(currentAvatarUrl);
    }
  }, [currentAvatarUrl]);

  // Validate form fields
  const validateForm = () => {
    const newErrors: {firstName?: string; lastName?: string; email?: string} = {};
    
    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    
    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    
    if (user?.authProvider === 'local') {
      if (!email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        newErrors.email = 'Please enter a valid email address';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProfileUpdate = async () => {
    // Validate form first
    if (!validateForm()) {
      toast.error("Please fill in all required fields correctly");
      return;
    }

    // Check if there are any changes
    const hasChanges = firstName !== user?.firstName || 
                      lastName !== user?.lastName || 
                      (user?.authProvider === 'local' && email !== user?.email) ||
                      selectedAvatarFile !== null;

    if (!hasChanges) {
      toast.error("Nothing to update");
      return;
    }

    try {
      // Only set uploading state if we're actually uploading an avatar
      const hasAvatarToUpload = selectedAvatarFile !== null;
      
      if (hasAvatarToUpload) {
        setIsUploading(true);
      }

      // Prepare update data - EXACTLY what backend expects
      const updateData: any = {};
      
      // Only include fields that have changed
      if (firstName !== user?.firstName) {
        updateData.firstName = firstName.trim();
      }
      
      if (lastName !== user?.lastName) {
        updateData.lastName = lastName.trim();
      }

      // Only include email for local auth users (if changed)
      if (user?.authProvider === 'local' && email !== user?.email) {
        updateData.email = email.trim().toLowerCase(); // Backend expects lowercase
      }

      // Only upload and include avatar if a NEW file is selected
      let avatarUrl = user?.avatar;
      if (selectedAvatarFile) {
        const userId = user?.email || user?.id || 'anonymous';
        const uploadedUrl = await uploadAvatarToGoogleDrive(
          selectedAvatarFile, 
          userId,
          (progress) => {
            // Only update progress if we're in uploading state
            if (hasAvatarToUpload) {
              setUploadProgress(progress);
            }
          }
        );
        
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
          updateData.avatar = uploadedUrl;
          console.log('✅ Avatar uploaded successfully:', uploadedUrl);
        } else {
          toast.error("Failed to upload avatar to Google Drive");
          if (hasAvatarToUpload) {
            setIsUploading(false);
          }
          return;
        }
      }

      // Check if we actually have data to send
      if (Object.keys(updateData).length === 0) {
        toast.error("No changes to save");
        if (hasAvatarToUpload) {
          setIsUploading(false);
        }
        return;
      }

      console.log('📤 Sending update data to server:', updateData);

      // Update profile with the data
      const updatedUser = await updateProfile(updateData);
      
      // Reset avatar states only if we uploaded a new avatar
      if (selectedAvatarFile) {
        setPreviewAvatar(avatarUrl || user?.avatar || null);
        setSelectedAvatarFile(null);
      }
      
      console.log('✅ Profile update complete:', updatedUser);
      toast.success("Profile updated successfully!");
      
    } catch (err) {
      console.error("Profile update error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      // Only reset uploading states if they were set
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAvatarUploadClick = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      toast.error("Missing Google API credentials (Client ID).");
      return;
    }

    // Check for cached token first (silent)
    const storedTokenData = localStorage.getItem('google_oauth_token');
    if (storedTokenData) {
      try {
        const { expires_at } = JSON.parse(storedTokenData);
        if (Date.now() < (expires_at - 300000)) {
          // Token is still valid, just open the picker
          fileInputRef.current?.click();
          return;
        }
      } catch (e) {}
    }

    // No valid token, trigger auth popup DIRECTLY from button click
    const toastId = toast.loading("Authenticating with Google...");
    try {
      const token = await getGoogleAccessToken(clientId);
      toast.dismiss(toastId);
      if (token) {
        fileInputRef.current?.click();
      }
    } catch (error) {
      toast.dismiss(toastId);
      console.error("Google Auth Error:", error);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, GIF, WebP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Create preview and set file for upload
    const previewUrl = URL.createObjectURL(file);
    setPreviewAvatar(previewUrl);
    setSelectedAvatarFile(file);
    
    // Reset file input to allow selecting same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancelUpload = () => {
    if (abortController) {
      abortController.abort();
      setIsUploading(false);
      setUploadProgress(0);
      setAbortController(null);
    }
    
    // Reset to original avatar
    setPreviewAvatar(user?.avatar || null);
    setSelectedAvatarFile(null);
  };

  return (
    <div className="space-y-6 w-full">
      {/* Profile Details Header with Icon */}
      <div className="text-left">
        <div className="flex items-center gap-3 mb-2">
          <UserCircle className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold">Profile Details</h2>
        </div>
        <p className="text-sm text-muted-foreground">Update your personal information</p>
      </div>

      {/* Avatar - Compact Row */}
      <div className="flex items-center justify-center sm:justify-start gap-6 p-6 glass rounded-xl border border-border/50">
        <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-border flex-shrink-0 shadow-lg">
          <AvatarImage
            src={getFixedAvatarUrl(previewAvatar || user?.avatar)}
            className="object-cover"
            onError={(e) => {
              console.log('Avatar image failed to load:', e.currentTarget.src);
              // Try alternative format if it's a Google Drive URL
              const currentSrc = e.currentTarget.src;
              if (currentSrc.includes('drive.google.com')) {
                const fileIdMatch = currentSrc.match(/[-\w]{25,}/);
                if (fileIdMatch) {
                  const fileId = fileIdMatch[0];
                  // Try thumbnail format
                  e.currentTarget.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
                }
              }
            }}
            onLoad={() => console.log('Avatar image loaded successfully')}
          />
          <AvatarFallback className="text-2xl gradient-primary text-white">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col gap-2 flex-1">
          <div className="flex gap-3 items-center">
            <Button
              variant="outline"
              size="default"
              className="glass h-10 text-sm px-6 rounded-lg"
              onClick={handleAvatarUploadClick}
              disabled={isUploading}
            >
              {isUploading ? (
                <>Uploading... {uploadProgress}%</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Upload Photo</>
              )}
            </Button>
            {isUploading && (
              <Button
                variant="outline"
                size="default"
                className="glass text-destructive hover:text-destructive h-10 text-sm px-6 rounded-lg"
                onClick={handleCancelUpload}
              >
                <X className="w-4 h-4 mr-2" /> Cancel
              </Button>
            )}
          </div>
          {isUploading && (
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden max-w-xs">
              <div 
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Max size: 5MB (JPG, PNG, GIF) • Saved to Google Drive
          </p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleAvatarUpload}
          accept="image/*"
          className="hidden"
        />
      </div>

      {/* Form Fields - Compact Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-sm font-medium flex items-center gap-2">
            First Name <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                if (errors.firstName) {
                  setErrors({...errors, firstName: undefined});
                }
              }}
              className="pl-10 glass h-12 text-sm sm:text-base rounded-lg"
              placeholder="First Name"
              required
            />
          </div>
          {errors.firstName && (
            <p className="text-xs text-destructive mt-1.5">{errors.firstName}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-sm font-medium flex items-center gap-2">
            Last Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              if (errors.lastName) {
                setErrors({...errors, lastName: undefined});
              }
            }}
            className="glass h-12 text-sm sm:text-base rounded-lg px-4"
            placeholder="Last Name"
            required
          />
          {errors.lastName && (
            <p className="text-xs text-destructive mt-1.5">{errors.lastName}</p>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
            Email Address <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) {
                  setErrors({...errors, email: undefined});
                }
              }}
              className="pl-10 glass h-12 text-sm sm:text-base rounded-lg"
              placeholder="Email Address"
              disabled={user?.authProvider === 'google'}
              required={user?.authProvider === 'local'}
            />
          </div>
          {user?.authProvider === 'google' ? (
            <p className="text-xs text-muted-foreground mt-1.5 ml-1">Managed by Google Authentication</p>
          ) : errors.email && (
            <p className="text-xs text-destructive mt-1.5">{errors.email}</p>
          )}
        </div>
      </div>

      <div className="pt-4 flex justify-center sm:justify-start">
        <Button
          onClick={handleProfileUpdate}
          size="lg"
          className="gradient-primary hover-glow h-12 text-sm sm:text-base px-10 w-full sm:w-auto rounded-xl transition-all shadow-lg"
          disabled={isUploading || (!hasChanges && !selectedAvatarFile) || 
                   !firstName.trim() || !lastName.trim() || 
                   (user?.authProvider === 'local' && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))}
        >
          {isUploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2.5"></div>
              Uploading... {uploadProgress}%
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2.5" />
              Save Profile Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

// Password Settings Content - Handles both Google and Local auth
const PasswordSettings = () => {
  const { user, changePassword, addPassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showHints, setShowHints] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordAdded, setPasswordAdded] = useState(false);
  const [errors, setErrors] = useState<{currentPassword?: string; newPassword?: string; confirmPassword?: string}>({});
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Check if user signed in with Google
  const isGoogleAuth = user?.authProvider === 'google';
  const isGoogleAuthWithoutPassword = isGoogleAuth && !user?.hasPassword;
  const hasExistingPassword = user?.hasPassword || user?.authProvider === 'local';

  if (isGoogleAuth) {
    return (
      <div className="space-y-6 w-full">
        <div className="text-left">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Security Settings</h2>
          </div>
          <p className="text-sm text-muted-foreground">Manage your account security</p>
        </div>

        <div className="p-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-col items-center text-center gap-6 shadow-lg">
          <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Key className="w-8 h-8 text-blue-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-blue-300">Signed in with Google</h3>
            <p className="text-sm text-blue-200/70 max-w-md mx-auto">
              Your account is authenticated through Google. Password management, two-factor authentication, and other security settings are handled by Google for your protection.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="lg" 
            className="mt-4 glass text-sm h-12 px-8 rounded-xl"
            onClick={() => window.open('https://myaccount.google.com/security', '_blank')}
          >
            Manage Google Security Settings
          </Button>
        </div>
      </div>
    );
  }

  const passwordChecks = [
    { label: "At least 8 characters", valid: newPassword.length >= 8 },
    { label: "Lowercase letter", valid: /[a-z]/.test(newPassword) },
    { label: "Uppercase letter", valid: /[A-Z]/.test(newPassword) },
    { label: "Include a number", valid: /[0-9]/.test(newPassword) },
    { label: "Special character", valid: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const isStrongPassword = passwordChecks.every(check => check.valid);

  // Validate password form
  const validatePasswordForm = () => {
    const newErrors: {currentPassword?: string; newPassword?: string; confirmPassword?: string} = {};
    
    if (hasExistingPassword && !currentPassword.trim()) {
      newErrors.currentPassword = 'Current password is required';
    }
    
    if (!newPassword.trim()) {
      newErrors.newPassword = 'New password is required';
    } else if (!isStrongPassword) {
      newErrors.newPassword = 'Password does not meet requirements';
    }
    
    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordChange = async () => {
    // Check if password was already added in this session and recommend refresh
    if (passwordAdded) {
      toast.info("Password already added. Please refresh the page to update your settings interface.");
      return;
    }

    if (!validatePasswordForm()) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      
      if (isGoogleAuthWithoutPassword) {
        // Add new password for Google user
        await addPassword(newPassword);
        setPasswordAdded(true);
        toast.success('Password added successfully! 🔒 Please refresh the page to use full password settings.');
      } else {
        // Change existing password
        await changePassword(currentPassword, newPassword);
        toast.success('Password changed successfully! 🔒');
      }
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Password Settings Header with Icon */}
      <div className="text-left">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold">
            {isGoogleAuthWithoutPassword ? 'Add Password' : 'Password Settings'}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {isGoogleAuthWithoutPassword 
            ? 'Add a password to enable email/password login alongside Google' 
            : 'Manage your account security'}
        </p>
      </div>

      {/* Google Auth Info Banner */}
      {user?.authProvider === 'google' && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3 shadow-sm">
          <Key className="w-5 h-5 text-blue-400 mt-1 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-blue-300">Signed in with Google</p>
            <p className="text-blue-200/70 mt-1">
              {isGoogleAuthWithoutPassword 
                ? 'You can add a password to also log in with email and password.' 
                : 'You have added a password. You can now log in with either Google or email/password.'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Only show current password if user has an existing password */}
        {hasExistingPassword && (
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              Current Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input 
                type={showCurrentPassword ? "text" : "password"} 
                value={currentPassword} 
                onChange={e => {
                  setCurrentPassword(e.target.value);
                  if (errors.currentPassword) {
                    setErrors({...errors, currentPassword: undefined});
                  }
                }}
                className="glass h-12 text-sm sm:text-base pr-12 rounded-lg px-4" 
                placeholder="Enter current password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
              >
                {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.currentPassword && (
              <p className="text-xs text-destructive mt-1.5">{errors.currentPassword}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              New Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input 
                type={showNewPassword ? "text" : "password"} 
                value={newPassword} 
                onFocus={() => setShowHints(true)}
                onBlur={() => !newPassword && setShowHints(false)}
                onChange={e => {
                  setNewPassword(e.target.value);
                  if (errors.newPassword) {
                    setErrors({...errors, newPassword: undefined});
                  }
                }}
                className="glass h-12 text-sm sm:text-base pr-12 rounded-lg px-4" 
                placeholder={isGoogleAuthWithoutPassword ? 'Create a password' : 'Enter new password'}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
              >
                {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-xs text-destructive mt-1.5">{errors.newPassword}</p>
            )}

            {/* Show password requirements */}
            {showHints && (
              <div className="mt-3 p-4 rounded-xl bg-muted/20 border border-border/30">
                <p className="text-xs font-bold text-muted-foreground mb-2.5">Security Requirements:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {passwordChecks.map((check, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className={check.valid ? "text-green-500" : "text-muted-foreground"}>
                        {check.valid ? "✓" : "○"}
                      </span>
                      <span className={check.valid ? "text-green-600 font-bold" : "text-muted-foreground"}>
                        {check.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              Confirm Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) {
                    setErrors({...errors, confirmPassword: undefined});
                  }
                }}
                className="glass h-12 text-sm sm:text-base pr-12 rounded-lg px-4"
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-destructive mt-1.5">{errors.confirmPassword}</p>
            )}
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-center sm:justify-start">
        <Button
          onClick={handlePasswordChange}
          size="lg"
          className="gradient-primary hover-glow h-12 text-sm sm:text-base px-10 w-full sm:w-auto rounded-xl transition-all shadow-lg"
          disabled={
            isLoading || 
            (hasExistingPassword && !currentPassword.trim()) || 
            !newPassword.trim() || 
            !confirmPassword.trim() ||
            !isStrongPassword
          }
        >
          {isLoading ? (
            'Processing Security Update...'
          ) : isGoogleAuthWithoutPassword ? (
            <>
              <Plus className="w-4 h-4 mr-2.5" />
              Secure My Account
            </>
          ) : (
            <>
              <Shield className="w-4 h-4 mr-2.5" />
              Update Account Password
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

// Main Profile Component
const Profile = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="h-screen flex flex-col overflow-hidden p-3 sm:p-6 md:p-8 space-y-6">
      <div className="w-full mx-auto flex flex-col h-full space-y-6 max-w-[1600px]"> 

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8 flex-shrink-0 px-4">
          <div className="flex-1 min-w-0 text-left">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gradient truncate">Profile Settings</h1>
            <p className="text-muted-foreground text-sm sm:text-base truncate">Manage your account preferences</p>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-2 p-1.5 bg-muted/20 rounded-xl w-full sm:w-auto glass flex-shrink-0">
            <Button
              variant="ghost"
              onClick={() => setActiveTab('profile')}
              size="default"
              className={`flex-1 sm:flex-none h-10 text-sm px-6 transition-all rounded-lg ${
                activeTab === 'profile' 
                  ? 'gradient-primary text-white hover-glow shadow-md' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <User className="w-4 h-4 mr-2" />
              Profile
            </Button>
            <Button
              variant="ghost"
              onClick={() => setActiveTab('password')}
              size="default"
              className={`flex-1 sm:flex-none h-10 text-sm px-6 transition-all rounded-lg ${
                activeTab === 'password' 
                  ? 'gradient-primary text-white hover-glow shadow-md' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <Lock className="w-4 h-4 mr-2" />
              Security
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <Card className="glass-strong overflow-hidden border-0 sm:border flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4
            [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40"
          >
            <div className="p-4 sm:p-6 lg:p-8">
               <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-6xl w-full mx-auto">
                 {activeTab === 'profile' && <ProfileSettings />}
                 {activeTab === 'password' && <PasswordSettings />}
               </div>
             </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Profile;