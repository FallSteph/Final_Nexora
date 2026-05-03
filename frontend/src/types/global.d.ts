declare global {
  interface Window {
    gapi: any;
    google: any;
    APP_NAME: string;
    SUPPORT_EMAIL: string;
    AUTO_LOGOUT_MINUTES: number;
    MAX_FILE_UPLOAD_MB: number;
    APP_THEME: string;
  }

  const google: any;
}

export {};
