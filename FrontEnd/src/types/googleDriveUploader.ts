import { toast } from "sonner";
import { validateFileSize } from "@/lib/utils";

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface UploadOptions {
  userId?: string; // User ID for organizing files
  onProgress?: (progress: number) => void;
  abortController?: AbortController;
}

// Improved helper function to get user's actual email
const getCurrentUserEmail = (): string => {
  try {
    // PRIORITY 1: Check direct userEmail key first (most common in your app)
    const directEmail = localStorage.getItem('userEmail');
    if (directEmail && directEmail.includes('@')) {
      console.log('Found email in userEmail key:', directEmail);
      return directEmail;
    }
    
    // PRIORITY 2: Try multiple localStorage keys where user data might be stored
    const userKeys = ['user', 'userData', 'currentUser', 'authUser', 'userInfo'];
    
    for (const key of userKeys) {
      const userData = localStorage.getItem(key);
      if (userData) {
        try {
          const user = JSON.parse(userData);
          // Try different email property names
          const email = user.email || user.userEmail || user.googleEmail || 
                       user.Email || user.UserEmail || user.Gmail || user.gmail ||
                       (user.profile && user.profile.email) ||
                       (user.user && user.user.email);
          
          if (email && typeof email === 'string' && email.includes('@')) {
            console.log(`Found email in ${key}:`, email);
            return email;
          }
        } catch (e) {
          // Continue to next key
        }
      }
    }
    
    // Also check sessionStorage as fallback
    for (const key of userKeys) {
      const userData = sessionStorage.getItem(key);
      if (userData) {
        try {
          const user = JSON.parse(userData);
          const email = user.email || user.userEmail || user.googleEmail;
          if (email && typeof email === 'string' && email.includes('@')) {
            console.log(`Found email in sessionStorage ${key}:`, email);
            return email;
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    console.warn('No valid email found in localStorage/sessionStorage - returning empty to prevent "New Folder" creation');
    return '';
  } catch (error) {
    console.error('Error getting user email:', error);
    return '';
  }
};

// --- TOKEN CACHING ---
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;
let activeTokenRequest: Promise<string | null> | null = null;

/**
 * Gets a valid Google Access Token, using cache if available.
 * This prevents repeated account selection popups and thundering herd problems.
 * CRITICAL: Must be triggered directly by a user gesture to avoid popup blocking.
 */
export const getGoogleAccessToken = (clientId: string, scope: string = "https://www.googleapis.com/auth/drive.file"): Promise<string | null> => {
  // 1. Check if we have a valid cached token (with 5-minute buffer)
  if (cachedAccessToken && Date.now() < (tokenExpiresAt - 300000)) {
    console.log("Using cached Google access token");
    return Promise.resolve(cachedAccessToken);
  }

  // 2. Check localStorage for token from initial login
  try {
    const storedTokenData = localStorage.getItem('google_oauth_token');
    if (storedTokenData) {
      const { access_token, expires_at } = JSON.parse(storedTokenData);
      // Check if localStorage token is still valid (with 5-minute buffer)
      if (access_token && Date.now() < (expires_at - 300000)) {
        console.log("Using Google access token from localStorage (login session)");
        cachedAccessToken = access_token;
        tokenExpiresAt = expires_at;
        return Promise.resolve(access_token);
      }
    }
  } catch (err) {
    console.error("Error reading google_oauth_token from localStorage:", err);
  }

  // 3. If there's already an active request, wait for it
  if (activeTokenRequest) {
    console.log("Waiting for existing token request to complete...");
    return activeTokenRequest;
  }

  console.log("Requesting new Google access token...");
  
  // 4. Create a new request promise
  activeTokenRequest = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.error("Google authentication timed out");
      activeTokenRequest = null;
      resolve(null);
    }, 60000);

    const startAuth = () => {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: scope,
          callback: (tokenResponse: any) => {
            clearTimeout(timeout);
            activeTokenRequest = null;
            
            if (tokenResponse.error !== undefined) {
              console.error("Google Token error:", tokenResponse.error);
              resolve(null);
              return;
            }

            if (!tokenResponse.access_token) {
              resolve(null);
              return;
            }

            // Cache the token
            cachedAccessToken = tokenResponse.access_token;
            const expiresIn = parseInt(tokenResponse.expires_in) || 3600;
            tokenExpiresAt = Date.now() + (expiresIn * 1000);
            
            localStorage.setItem('google_oauth_token', JSON.stringify({
              access_token: cachedAccessToken,
              expires_at: tokenExpiresAt
            }));
            
            console.log("✅ New Google access token acquired");
            resolve(cachedAccessToken);
          },
        });
        
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (err) {
        clearTimeout(timeout);
        activeTokenRequest = null;
        console.error("Auth process error:", err);
        resolve(null);
      }
    };

    if (window.google?.accounts?.oauth2) {
      startAuth();
    } else {
      const check = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(check);
          startAuth();
        }
      }, 100);
      setTimeout(() => clearInterval(check), 5000);
    }
  });

  return activeTokenRequest;
};
// --- END TOKEN CACHING ---

let gapiInitialized = false;

const initGapiClient = async (apiKey: string) => {
  if (gapiInitialized && window.gapi?.client?.drive) return;

  return new Promise<void>((resolve, reject) => {
    const setup = async () => {
      try {
        await window.gapi.client.init({
          apiKey,
          discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        });
        gapiInitialized = true;
        resolve();
      } catch (err) {
        console.error("GAPI init error:", err);
        reject(err);
      }
    };

    if (!window.gapi) {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('client', setup);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    } else if (!window.gapi.client) {
      window.gapi.load('client', setup);
    } else {
      setup();
    }
  });
};

export const uploadFileToGoogleDrive = async (file: File, options?: UploadOptions): Promise<any | null> => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  
  if (!clientId || !apiKey) {
    toast.error("Missing Google API credentials.");
    return null;
  }

  try {
    await initGapiClient(apiKey);
    console.log("✅ Google API initialized successfully");
    
    // Rest of your upload logic...
  } catch (error) {
    console.error("❌ Google API initialization error:", error);
    toast.error("Google Drive service is currently unavailable.");
    return null;
  }
};

/**
 * Helper to ensure a folder exists and return its ID.
 * Improved to handle shared centralized storage better.
 */
const getOrCreateFolder = async (name: string, parentId?: string): Promise<string> => {
  // Check if we have a Master Folder ID in environment variables for NexoraUploads
  let folderId: string | null = null;
  if (name === "NexoraUploads" && !parentId) {
    folderId = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || null;
    if (folderId) {
      console.log("Using Master Folder ID from .env:", folderId);
    }
  }

  let folder: any = null;

  if (!folderId) {
    const q = parentId 
      ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      
    const search = await (window as any).gapi.client.drive.files.list({
      q,
      fields: "files(id,name,owners,shared,createdTime)",
      orderBy: "createdTime" // Oldest first to pick the "original" folder if duplicates exist
    });

    // Pick the oldest existing folder if multiple exist
    folder = search.result.files && search.result.files.length > 0 ? search.result.files[0] : null;

    if (!folder) {
      console.log(`Folder '${name}' not found, creating it...`);
      const resource: any = {
        name,
        mimeType: "application/vnd.google-apps.folder",
      };
      if (parentId) resource.parents = [parentId];

      const created = await (window as any).gapi.client.drive.files.create({
        resource,
        fields: "id,name"
      });
      folder = created.result;

      // CRITICAL: Make folder PUBLICLY WRITABLE if it's the main NexoraUploads
      // This allows different users to upload their own subfolders into it.
      try {
        await (window as any).gapi.client.drive.permissions.create({
          fileId: folder.id,
          resource: {
            role: "writer", // "writer" allows others to create subfolders/files
            type: "anyone", // "anyone" makes it easy to share without specific email list
          },
          fields: "id",
        });
        console.log(`✅ Folder '${name}' is now publicly writable for centralized storage.`);
      } catch (err) {
        console.warn(`Could not set public permissions for folder ${name}:`, err);
      }
    }
    folderId = folder.id;
  }

  // NEW: If this is the main NexoraUploads folder, explicitly share with CURRENT USER
  // This makes the folder show up in their "Shared with me" section in Google Drive
  if (name === "NexoraUploads" && !parentId && folderId) {
    try {
      const userEmail = getCurrentUserEmail();
      if (userEmail && userEmail.includes('@')) {
        await (window as any).gapi.client.drive.permissions.create({
          fileId: folderId,
          resource: {
            role: "writer",
            type: "user",
            emailAddress: userEmail
          },
          fields: "id",
        });
        console.log(`✅ Folder '${name}' explicitly shared with user: ${userEmail} (will show in "Shared with me")`);
      }
    } catch (shareErr) {
      // Ignore errors (user might already have explicit permission)
      console.log(`Note: Shared with me permission already exists or could not be set for ${name}`);
    }
  }

  return folderId;
};

/**
 * Gets the target folder ID for a user and category.
 * Structure: NexoraUploads > UserEmail > Category (Avatars/Attachments)
 */
const getTargetFolderId = async (userEmail: string, category: 'Avatars' | 'Attachments'): Promise<string> => {
  try {
    const mainFolderId = await getOrCreateFolder("NexoraUploads");
    const userFolderId = await getOrCreateFolder(userEmail, mainFolderId);
    const categoryFolderId = await getOrCreateFolder(category, userFolderId);
    return categoryFolderId;
  } catch (error) {
    console.error(`Error getting target folder for ${userEmail} / ${category}:`, error);
    throw error;
  }
};

// Upload to NexoraUploads with user folder structure and progress tracking
export const uploadToNexoraUploads = async (
  file: File, 
  userId?: string,
  onProgress?: (progress: number) => void,
  abortController?: AbortController
): Promise<any | null> => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

  if (!clientId || !apiKey) {
    toast.error("Missing Google API credentials.");
    return null;
  }

  // ✅ VALIDATE FILE SIZE based on Admin Settings
  const validation = validateFileSize(file);
  if (!validation.valid) {
    const errorMsg = validation.error || "File is too large";
    toast.error(errorMsg);
    throw new Error(errorMsg); // ✅ THROW ERROR instead of returning null
  }

  // Use provided userId or get from localStorage
  const userEmail = userId || getCurrentUserEmail();

  // Validate email
  if (!userEmail || !userEmail.includes('@')) {
    console.error('Invalid or missing user email for Google Drive upload:', userEmail);
    toast.error("Please log in to upload files.");
    return null;
  }
  
  console.log('uploadToNexoraUploads for user:', userEmail);

  // Load Google API
  await initGapiClient(apiKey);

  // ✅ Use the new token caching logic
  const accessToken = await getGoogleAccessToken(clientId);
  
  if (!accessToken) {
    toast.error("Google Drive authentication failed.");
    return null;
  }

  // Set the token for gapi client
  if (window.gapi && window.gapi.client) {
    window.gapi.client.setToken({ access_token: accessToken });
  }

  return new Promise(async (resolve, reject) => {
    try {
      // Determine category based on file type or prefix - default to Attachments
      const category = file.name.startsWith('avatar_') ? 'Avatars' : 'Attachments';
      const targetFolderId = await getTargetFolderId(userEmail, category);

      // 3. Generate unique filename
      const uniqueId = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const fileExtension = file.name.split('.').pop();
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const uniqueFileName = `${uniqueId}_${fileNameWithoutExt}.${fileExtension}`;

      const metadata = {
        name: uniqueFileName,
        mimeType: file.type,
        parents: [targetFolderId],
      };

      const form = new FormData();
      form.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" })
      );
      form.append("file", file);

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete);
        }
      });

      // Handle abort
      if (abortController) {
        abortController.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const uploadedFile = JSON.parse(xhr.responseText);
          
          // FIXED: Use proper preview/thumbnail URLs based on file type
          let fileUrl;
          if (file.type.startsWith('image/')) {
            // For images, use thumbnail URL for viewing
            fileUrl = `https://drive.google.com/thumbnail?id=${uploadedFile.id}&sz=w1000`;
          } else {
            // For other files, use preview URL
            fileUrl = `https://drive.google.com/file/d/${uploadedFile.id}/preview`;
          }
          
          // Make file publicly accessible
          try {
            await window.gapi.client.drive.permissions.create({
              fileId: uploadedFile.id,
              resource: {
                role: "reader",
                type: "anyone",
              },
              fields: "id",
            });
          } catch (permError) {
            console.log("Note: File permissions not set, but file might still be accessible");
          }

          // FIXED: Return proper URLs for viewing
          resolve({
            id: uploadedFile.id,
            name: file.name, // Use original filename for display
            originalName: file.name,
            url: fileUrl,
            directLink: `https://drive.google.com/uc?export=view&id=${uploadedFile.id}`,
            downloadLink: `https://drive.google.com/uc?export=download&id=${uploadedFile.id}`,
            webViewLink: `https://drive.google.com/file/d/${uploadedFile.id}/view`,
            mimeType: file.type,
            size: file.size,
            uploadedBy: userEmail,
            userEmail: userEmail,
            userFolder: userEmail,
            uploadedAt: new Date(),
            isImage: file.type.startsWith('image/'),
            drive: true
          });
        } else {
          reject('Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        reject('Upload failed');
      });

      xhr.addEventListener('abort', () => {
        reject('Upload cancelled');
      });

      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType,size');
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.send(form);
    } catch (error) {
      console.error(error);
      toast.error("Error uploading to NexoraUploads.");
      reject(error);
    }
  });
};

// Upload avatar specifically to user's folder with progress tracking
export const uploadAvatarToGoogleDrive = async (
  file: File, 
  userId?: string,
  onProgress?: (progress: number) => void,
  abortController?: AbortController
): Promise<string | null> => {
  try {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

    if (!clientId || !apiKey) {
      toast.error("Missing Google API credentials.");
      return null;
    }

    // ✅ VALIDATE FILE SIZE based on Admin Settings
    const validation = validateFileSize(file);
    if (!validation.valid) {
      const errorMsg = validation.error || "File is too large";
      toast.error(errorMsg);
      throw new Error(errorMsg); // ✅ THROW ERROR
    }

    // Use provided userId or get from localStorage
    const userEmail = userId || getCurrentUserEmail();

    // Validate email
    if (!userEmail || !userEmail.includes('@')) {
      console.error('Invalid or missing user email for Google Drive avatar upload:', userEmail);
      toast.error("Please log in to upload an avatar.");
      return null;
    }
    
    console.log('uploadAvatarToGoogleDrive for user:', userEmail);

    // Load Google API
    await initGapiClient(apiKey);

    // ✅ Use the new token caching logic
    const accessToken = await getGoogleAccessToken(clientId);
    
    if (!accessToken) {
      toast.error("Google Drive authentication failed.");
      return null;
    }

    // Set the token for gapi client
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: accessToken });
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Use refactored folder logic with Category
        const targetFolderId = await getTargetFolderId(userEmail, 'Avatars');

        // 3. Generate unique filename - prefixed with 'avatar_' for easy identification
        const uniqueName = `avatar_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${file.name.split(".").pop()}`;

        const metadata = {
          name: uniqueName,
          mimeType: file.type,
          parents: [targetFolderId],
        };

        const form = new FormData();
        form.append(
          "metadata",
          new Blob([JSON.stringify(metadata)], { type: "application/json" })
        );
        form.append("file", file);

        // Use XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            onProgress(percentComplete);
          }
        });

        // Handle abort
        if (abortController) {
          abortController.signal.addEventListener('abort', () => {
            xhr.abort();
          });
        }

        xhr.addEventListener('load', async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const uploadedFile = JSON.parse(xhr.responseText);
            
            // ✅ USE THUMBNAIL URL - THIS WORKS!
            const thumbnailUrl = `https://drive.google.com/thumbnail?id=${uploadedFile.id}&sz=w1000`;
            
            console.log("Avatar uploaded successfully. Thumbnail URL:", thumbnailUrl);
            
            // Make file publicly accessible
            try {
              await window.gapi.client.drive.permissions.create({
                fileId: uploadedFile.id,
                resource: {
                  role: "reader",
                  type: "anyone",
                },
                fields: "id",
              });
            } catch (permError) {
              console.log("Note: File permissions not set, but thumbnail might still work");
            }

            resolve(thumbnailUrl);
          } else {
            reject('Upload failed');
          }
        });

        xhr.addEventListener('error', () => {
          reject('Upload failed');
        });

        xhr.addEventListener('abort', () => {
          reject('Upload cancelled');
        });

        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name');
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.send(form);
      } catch (error) {
        console.error(error);
        toast.error("Error uploading avatar.");
        reject(error);
      }
    });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return null;
  }
};

// Upload attachment to Google Drive under NexoraUploads/<userId>/ with progress tracking
export interface AttachmentUploadOptions {
  userId?: string;
  onProgress?: (progress: { percentage: number }) => void;
  signal?: AbortSignal;
}

export const uploadAttachmentToGoogleDrive = async (
  file: File, 
  options?: AttachmentUploadOptions | string | { userId?: string; onProgress?: (progress: any) => void; signal?: AbortSignal },
  onProgressLegacy?: (progress: number) => void,
  abortControllerLegacy?: AbortController
): Promise<any | null> => {
  // Support both old signature (userId as string) and new signature (options object)
  let userId: string | undefined;
  let onProgress: ((progress: { percentage: number }) => void) | undefined;
  let signal: AbortSignal | undefined;

  if (typeof options === 'string') {
    // Legacy call: uploadAttachmentToGoogleDrive(file, userId, onProgress, abortController)
    userId = options;
    onProgress = onProgressLegacy ? (p) => onProgressLegacy(p.percentage) : undefined;
    signal = abortControllerLegacy?.signal;
  } else if (options) {
    // New call: uploadAttachmentToGoogleDrive(file, { userId, onProgress, signal })
    userId = options.userId;
    onProgress = options.onProgress;
    signal = options.signal;
  }

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

  if (!clientId || !apiKey) {
    toast.error("Missing Google API credentials.");
    return null;
  }

  // ✅ VALIDATE FILE SIZE based on Admin Settings
  const validation = validateFileSize(file);
  if (!validation.valid) {
    const errorMsg = validation.error || "File is too large";
    toast.error(errorMsg);
    throw new Error(errorMsg); // ✅ THROW ERROR
  }

  // Use provided userId or get from localStorage
  const userEmail = userId || getCurrentUserEmail();
  
  // CRITICAL: Validate that we have a proper email before proceeding
  if (!userEmail || !userEmail.includes('@')) {
    console.error('Invalid or missing user email for Google Drive upload:', userEmail);
    toast.error("Please log in to upload files to Google Drive.");
    return null;
  }
  
  console.log('uploadAttachmentToGoogleDrive for user:', userEmail);

  // Load Google API
  await initGapiClient(apiKey);

  // ✅ Use the new token caching logic
  const accessToken = await getGoogleAccessToken(clientId);
  
  if (!accessToken) {
    toast.error("Google Drive authentication failed.");
    return null;
  }

  // Set the token for gapi client
  if (window.gapi && window.gapi.client) {
    window.gapi.client.setToken({ access_token: accessToken });
  }

  return new Promise(async (resolve, reject) => {
    try {
      // Use refactored folder logic with Category
      const targetFolderId = await getTargetFolderId(userEmail, 'Attachments');

      // 3. Generate Unique Filename - prefixed with 'attachment_' for easy identification
      const uniqueId = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const ext = file.name.split('.').pop();
      const base = file.name.replace(/\.[^/.]+$/, "");

      const uniqueFileName = `attachment_${base}_${uniqueId}.${ext}`;

      // 4. Upload file into user folder
      const metadata = {
        name: uniqueFileName,
        mimeType: file.type,
        parents: [targetFolderId],
      };

      const form = new FormData();
      form.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" })
      );
      form.append("file", file);

      // Use XMLHttpRequest for progress tracking and cancellation
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress({ percentage: percentComplete });
        }
      });

      // Handle abort
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const uploaded = JSON.parse(xhr.responseText);

          // 5. Make file public (anyone can download)
          try {
            await window.gapi.client.drive.permissions.create({
              fileId: uploaded.id,
              resource: {
                role: "reader",
                type: "anyone",
              },
              fields: "id",
            });
          } catch (permErr) {
            console.error("Permission error:", permErr);
          }

          // FIXED: Return proper URLs for viewing based on file type
          let viewUrl;
          if (file.type.startsWith('image/')) {
            viewUrl = `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w1000`;
          } else {
            viewUrl = `https://drive.google.com/file/d/${uploaded.id}/preview`;
          }

          resolve({
            id: uploaded.id,
            name: file.name, // Use original filename for display
            originalName: file.name,
            url: viewUrl,
            directLink: `https://drive.google.com/uc?export=view&id=${uploaded.id}`,
            downloadLink: `https://drive.google.com/uc?export=download&id=${uploaded.id}`,
            webViewLink: `https://drive.google.com/file/d/${uploaded.id}/view`,
            mimeType: file.type,
            size: file.size,
            uploadedBy: userEmail,
            userEmail: userEmail,
            userFolder: userEmail,
            uploadedAt: new Date(),
            drive: true,
            isImage: file.type.startsWith('image/')
          });
        } else {
          reject('Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        reject('Upload failed');
      });

      xhr.addEventListener('abort', () => {
        reject('Upload cancelled');
      });

      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType,size');
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.send(form);

    } catch (err) {
      console.error(err);
      toast.error("Error uploading to Google Drive.");
      reject(err);
    }
  });
};

export default uploadFileToGoogleDrive;
