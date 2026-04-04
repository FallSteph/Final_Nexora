declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
];

let tokenClient: any = null;
let gapiInited = false;
let gisInited = false;

/* ----------------------------------------
 ✅ 1. Initialize GAPI client (Calendar)
---------------------------------------- */
export async function initGoogleAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.gapi) {
      reject("❌ gapi not found on window");
      return;
    }

    window.gapi.load("client", async () => {
      try {
        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;
        console.log("✅ GAPI client initialized");
        resolve();
      } catch (err) {
        console.error("❌ Failed to initialize gapi:", err);
        reject(err);
      }
    });
  });
}

/* ----------------------------------------
 ✅ 2. Initialize Google Identity (GIS)
---------------------------------------- */
export async function initTokenClient() {
  if (!window.google || gisInited) return;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    // Remove fixed prompt to allow the requestAccessToken to handle it based on session state
    callback: (tokenResponse: any) => {
      if (tokenResponse.error) {
        console.error("❌ Token error:", tokenResponse);
        return;
      }
      window.gapi.client.setToken(tokenResponse);
      
      // Also store it if received via this callback
      if (tokenResponse.access_token) {
        const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);
        localStorage.setItem('google_oauth_token', JSON.stringify({
          access_token: tokenResponse.access_token,
          expires_at: expiresAt,
          ...tokenResponse
        }));
      }
      console.log("✅ Token received and set");
    },
  });

  gisInited = true;
  console.log("✅ GIS client initialized");
}

/* ----------------------------------------
 ✅ 3. Ensure authorization before API calls
---------------------------------------- */
export async function ensureAuthorized(): Promise<void> {
  if (!gapiInited) await initGoogleAPI();
  if (!gisInited) await initTokenClient();

  const currentToken = window.gapi.client.getToken();
  
  // If we already have a token, check if it's still valid
  if (currentToken && currentToken.access_token) {
    const now = Date.now();
    // If we have an expiration time, check it
    if (!currentToken.expires_at || currentToken.expires_at > now + 300000) {
        console.log("✅ Using existing Google OAuth token");
        return;
    }
  }

  // Try to get from localStorage if available
  const storedTokenStr = localStorage.getItem('google_oauth_token');
  if (storedTokenStr) {
    try {
      const storedToken = JSON.parse(storedTokenStr);
      const now = Date.now();
      
      // If token is still valid (with 5 min buffer)
      if (storedToken.expires_at > now + 300000) {
        window.gapi.client.setToken(storedToken);
        console.log("✅ Restored Google OAuth token from storage");
        return;
      }
    } catch (e) {
      console.warn("Failed to parse stored Google token");
    }
  }

  // Get user email for login_hint to reduce prompts
  const userEmail = localStorage.getItem('userEmail') || '';

  console.log("🔄 Requesting new Google OAuth token for:", userEmail);

  return new Promise<void>((resolve, reject) => {
    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        console.error("❌ Token request error:", resp);
        // Standardize the error as a string for easier matching in frontend
        reject(resp.error);
        return;
      }
      if (resp.access_token) {
        const expiresAt = Date.now() + (resp.expires_in * 1000);
        const tokenToStore = {
          access_token: resp.access_token,
          expires_at: expiresAt,
          ...resp
        };
        
        window.gapi.client.setToken(tokenToStore);
        localStorage.setItem('google_oauth_token', JSON.stringify(tokenToStore));
        
        console.log("✅ New access token received and stored");
        resolve();
      }
    };

    // Use login_hint if available, but ALWAYS use 'select_account' if we are here (meaning no token)
    tokenClient.requestAccessToken({
        prompt: "select_account", 
        scope: SCOPES,
        login_hint: userEmail,
    });
  });
}

/* ----------------------------------------
 ✅ 4. Create new Calendar event
---------------------------------------- */
/**
 * Formats a Date object to a string like "2026-04-02T10:00:00" (Local Wall-Clock Time).
 * We send this WITHOUT an offset but WITH the explicit timeZone property to Google.
 * This is the most robust way to ensure the time stays exactly as the user set it.
 */


export async function addEventToGoogleCalendar(card: {
  title: string;
  description?: string;
  dueDate: string | Date;
  assignedMembers?: string[];
}): Promise<string | null> {
  try {
    await ensureAuthorized();

    const token = window.gapi.client.getToken();
    if (!token?.access_token) throw new Error("No valid OAuth token found");

    const start = new Date(card.dueDate);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const formatRFC3339WithOffset = (date: Date) => {
      const tzo = -date.getTimezoneOffset();
      const dif = tzo >= 0 ? '+' : '-';
      const pad = (num: number) => {
          const norm = Math.floor(Math.abs(num));
          return (norm < 10 ? '0' : '') + norm;
      };
      
      const isoLocal = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().substring(0, 19);
      return `${isoLocal}${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`;
    };

    const event = {
      summary: card.title,
      description: card.description || "",
      start: { 
        dateTime: formatRFC3339WithOffset(start)
      },
      end: { 
        dateTime: formatRFC3339WithOffset(end)
      },
      attendees: card.assignedMembers?.map((email) => ({ email })) || [],
    };

    // use fetch with OAuth bearer token instead of API key
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify(event),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    console.log("✅ Calendar event created:", data.id);
    return data.id;
  } catch (err: any) {
    console.error("❌ Failed to create calendar event:", err);
    throw err;
  }
}

export async function updateGoogleCalendarEvent(
  eventId: string,
  updates: { title: string; description?: string; dueDate: string | Date; assignedMembers?: string[] },
  assignedMembers?: string[]
) {
  const members = updates.assignedMembers || assignedMembers;
  try {
    await ensureAuthorized();

    const token = window.gapi.client.getToken();
    if (!token?.access_token) throw new Error("No valid OAuth token found");

    const start = new Date(updates.dueDate);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const formatRFC3339WithOffset = (date: Date) => {
      const tzo = -date.getTimezoneOffset();
      const dif = tzo >= 0 ? '+' : '-';
      const pad = (num: number) => {
          const norm = Math.floor(Math.abs(num));
          return (norm < 10 ? '0' : '') + norm;
      };
      
      const isoLocal = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().substring(0, 19);
      return `${isoLocal}${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`;
    };

    const updatedEvent = {
      summary: updates.title,
      description: updates.description || "",
      start: { 
        dateTime: formatRFC3339WithOffset(start)
      },
      end: { 
        dateTime: formatRFC3339WithOffset(end)
      },
      attendees: members?.map((email) => ({ email })) || [],
    };

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify(updatedEvent),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      throw new Error(JSON.stringify(data));
    }

    console.log("🔄 Google Calendar event updated");
  } catch (err: any) {
    console.error("❌ Failed to update event:", err);
    throw err;
  }
}

/* ----------------------------------------
 ✅ 6. Delete Calendar event
---------------------------------------- */
export async function deleteGoogleCalendarEvent(eventId: string) {
  try {
    await ensureAuthorized();

    const token = window.gapi.client.getToken();
    if (!token?.access_token) throw new Error("No valid OAuth token found");

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      }
    );

    if (!res.ok && res.status !== 404) { // Ignore if already deleted
      const data = await res.json();
      throw new Error(JSON.stringify(data));
    }

    console.log("🗑️ Google Calendar event deleted");
  } catch (err) {
    console.error("❌ Failed to delete calendar event:", err);
  }
}
