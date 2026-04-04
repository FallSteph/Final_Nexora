export const getGoogleDriveImageUrl = (url: string): string => {
  if (!url) return '';
  
  // If it's a data URL or blob, return as is
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  
  // If it's already a thumbnail URL, ensure it has a good size
  if (url.includes('drive.google.com/thumbnail')) {
    if (!url.includes('sz=')) {
      return `${url}&sz=w1000`;
    }
    return url;
  }
  
  // If it's a regular Google Drive URL, convert to thumbnail
  if (url.includes('drive.google.com')) {
    const fileIdMatch = url.match(/[-\w]{25,}/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[0];
      // Use thumbnail with good quality (w1000 = width 1000px)
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    }
  }
  
  // For other Google-hosted images (like user profile pictures from Google Auth)
  if (url.includes('googleusercontent.com')) {
    // If it's a Google profile pic, we can often request a larger size by appending =s1000
    if (url.includes('=s')) {
      return url.replace(/=s\d+/, '=s1000');
    }
    return `${url}=s1000`;
  }
  
  return url;
};

export const isGoogleDriveUrl = (url: string): boolean => {
  return url.includes('drive.google.com');
};