import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import axios from "axios";

// Interfaces
export interface Card {
  id?: string;
  _id?: string;
  title: string;
  description?: string;
  labels: string[];
  assignedMembers: string[];
  dueDate?: string | Date;
  googleEventId?: string;
  memberDeadlines?: { [key: string]: string | Date };
  memberEventIds?: { [key: string]: string };
  attachments: (string | {
    id: string;
    name: string;
    url: string;
    size: string;
    type: string;
    drive?: boolean;
    driveId?: string;
    uploadedBy?: string;
    uploadedAt?: string;
  })[];
  comments: { user: string; text: string; timestamp: Date }[];
}

export interface List {
  id?: string;
  _id?: string;
  title: string;
  cards: Card[];
}

export interface Board {
  id?: string;
  _id?: string;
  title: string;
  description?: string;
  lists: List[];
  members: { email: string; role: "member" | "manager" | "instructor"; _id?: string }[];
  userEmail?: string;
  createdAt?: string;
  dueDate?: string | Date;
  googleEventId?: string;
  color: string;
  status?: 'ongoing' | 'done';
}

export interface Notification {
  id?: string;
  _id?: string;
  userEmail: string;
  message: string;
  type: 'welcome' | 'board_added' | 'card_assigned' | 'card_comment' | 'new_signup' | 'board_created';
  read: boolean;
  createdAt: string;
  timestamp?: string;
  boardId?: string;
  boardTitle?: string;
  addedBy?: string;
}

interface AppContextType {
  boards: Board[];
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  notifications: Notification[];
  fetchNotifications: (userEmail: string) => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
  markNotificationRead: (id: string) => Promise<boolean>;
  markAllNotificationsRead: (userEmail: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: (userEmail?: string) => Promise<void>;
  updateBoardMembers: (
    boardId: string,
    members: { email: string; role: "member" | "manager" | "instructor" }[]
  ) => Promise<void>;
  searchUsers: (query: string) => Promise<any[]>;
  refreshData: () => void;
  lastRefresh: number;
  fetchBoards: (email?: string, role?: string) => Promise<void>;

  addBoard: (board: Board) => void;
  updateBoard: (id: string, updates: Partial<Board>) => Promise<void>;
  deleteBoard: (id: string) => void;

  addList: (boardId: string, title: string) => Promise<void>;
  updateList: (boardId: string, listId: string, title: string) => Promise<void>;
  deleteList: (boardId: string, listId: string) => Promise<void>;
  reorderLists: (boardId: string, lists: List[]) => Promise<void>;

  addCard: (boardId: string, listId: string, card: Omit<Card, "id">) => Promise<void>;
  updateCard: (boardId: string, listId: string, cardId: string, updates: Partial<Card>) => Promise<void>;
  deleteCard: (boardId: string, listId: string, cardId: string) => Promise<void>;
  moveCard: (
    boardId: string,
    cardId: string,
    fromListId: string,
    toListId: string,
    newIndex: number
  ) => Promise<void>;
  normalizeLists: (lists: any[]) => any[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};

// Use the same API_URL as in AuthContext
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Helper function to get authentication headers - FIXED VERSION
const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  // Use the same validation logic as AuthContext
  if (token && token !== 'null' && token !== 'undefined' && token.startsWith('eyJ')) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn('⚠️ No valid token found for API request');
  }
  
  return headers;
};

// Helper function to handle fetch errors
const handleFetchError = async (response: Response): Promise<never> => {
  let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
  try {
    const errorData = await response.json();
    errorMessage = errorData.message || errorData.error || errorMessage;
  } catch {
    // If not JSON, try to get text
    try {
      const text = await response.text();
      if (text) errorMessage = text;
    } catch {
      // Ignore if can't read text
    }
  }
  throw new Error(errorMessage);
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // FIXED: Normalize lists from backend with proper attachment URL handling
  const normalizeLists = useCallback((lists: any[]) =>
    (lists || []).map((l: any) => ({
      id: l.id || l._id,
      _id: l._id || l.id,
      title: l.title,
      cards: (l.cards || []).map((c: any) => ({
        id: c.id || c._id,
        _id: c._id || c.id,
        title: c.title,
        description: c.description,
        labels: c.labels || [],
        assignedMembers: c.assignedMembers || [],
        // FIXED: Proper date handling with timezone consideration
        dueDate: c.dueDate
          ? new Date(c.dueDate).toISOString()
          : "",
        googleEventId: c.googleEventId || "",
        // ✅ FIXED: Properly normalize attachments for both new and existing cards
        attachments: (c.attachments || []).map((att: any) => {
          if (!att) return null;
          // Handle string attachments (legacy format)
          if (typeof att === 'string') {
            return att;
          }
          
          // Handle object attachments - check if it's already a properly formatted object
          if (att.url && (att.id || att.driveId)) {
            // Already has proper format from frontend
            return {
              id: att.id || att.driveId,
              name: att.name,
              url: att.url,
              size: att.size || 'Unknown',
              type: att.type || 'file',
              drive: att.drive !== undefined ? att.drive : true,
              driveId: att.driveId || att.id,
              uploadedBy: att.uploadedBy,
              uploadedAt: att.uploadedAt,
            };
          }
          
          // Handle backend response format
          const driveId = att.id || att.driveId || att._id;
          let url = att.url || att.directLink || att.webViewLink || att.previewUrl || '';
          
          // If we have a drive ID but no proper URL, construct one
          if (driveId && (!url || url === '')) {
            const fileType = att.type || att.mimeType || '';
            if (fileType.startsWith('image/')) {
              url = `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;
            } else {
              url = `https://drive.google.com/file/d/${driveId}/preview`;
            }
          }
          
          return {
            id: driveId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)),
            name: att.name || att.originalName || 'Unknown',
            url: url,
            size: att.size || 'Unknown',
            type: att.type || att.mimeType || 'file',
            drive: att.drive !== undefined ? att.drive : (!!driveId || !!att.webViewLink),
            driveId: driveId,
            uploadedBy: att.uploadedBy,
            uploadedAt: att.uploadedAt,
          };
        }).filter(Boolean),

        comments: (c.comments || []).map((comment: any) => ({
          ...comment,
          id: comment.id || comment._id,
          _id: comment._id || comment.id,
          // FIXED: Ensure timestamp is preserved correctly
          timestamp: comment.timestamp ? new Date(comment.timestamp).toISOString() : new Date().toISOString(),
        })),
      })),
    })), []);

  const fetchBoards = useCallback(async (email?: string, role?: string) => {
    try {
      // Check if offline before starting
      if (!navigator.onLine) {
        return;
      }

      const url = role === "admin"
        ? `${API_URL}/api/boards`
        : `${API_URL}/api/boards?userEmail=${email}&includeMembers=true`;
      
      const res = await fetch(url, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error("Failed to fetch boards");
      }
      
      const data = await res.json();
      const normalized = data.map((b: any) => ({
        ...b,
        id: b._id || b.id,
        lists: normalizeLists(b.lists)
      }));
      
      setBoards(normalized);
    } catch (error: any) {
      console.error("Error fetching boards:", error);
    }
  }, [normalizeLists]);


  // Board Methods
  const addBoard = (board: Board) => {
    setBoards((prev) => [...prev, board]);
  };

  const updateBoard = async (boardId: string, updates: any) => {
    try {
      const response = await fetch(`${API_URL}/api/boards/${boardId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        await handleFetchError(response);
      }
      
      const updatedBoard = await response.json();
      
      const normalizedBoard = {
        ...updatedBoard,
        id: updatedBoard.id || updatedBoard._id,
        _id: updatedBoard._id || updatedBoard.id,
        lists: normalizeLists(updatedBoard.lists || []),
      };
      
      setBoards(prev => prev.map(b => 
        (b.id === boardId || b._id === boardId) ? normalizedBoard : b
      ));
      
      return normalizedBoard;
    } catch (error) {
      console.error('Error updating board:', error);
      throw error;
    }
  };

  const deleteBoard = (id: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== id));
  };

  // List Methods
  const addList = async (boardId: string, title: string) => {
    try {
      const res = await fetch(`${API_URL}/api/boards/${boardId}/lists`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        await handleFetchError(res);
      }

      const updatedBoard = await res.json();
      const normalizedLists = normalizeLists(updatedBoard.lists);

      setBoards(prev =>
        prev.map(b => (b.id === boardId || b._id === boardId) ? { ...b, lists: normalizedLists } : b)
      );
    } catch (err) {
      console.error("❌ addList error:", err);
      throw err;
    }
  };

  const updateList = async (boardId: string, listId: string, title: string) => {
    try {
      const res = await fetch(`${API_URL}/api/boards/${boardId}/lists/${listId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        await handleFetchError(res);
      }

      const updatedBoard = await res.json();
      const normalizedLists = normalizeLists(updatedBoard.lists);

      setBoards(prev =>
        prev.map(b => (b.id === boardId || b._id === boardId) ? { ...b, lists: normalizedLists } : b)
      );
    } catch (err) {
      console.error("❌ updateList error:", err);
      throw err;
    }
  };

  const deleteList = async (boardId: string, listId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/boards/${boardId}/lists/${listId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        await handleFetchError(res);
      }

      const updatedBoard = await res.json();
      const normalizedLists = normalizeLists(updatedBoard.lists);

      setBoards(prev =>
        prev.map(b => (b.id === boardId || b._id === boardId) ? { ...b, lists: normalizedLists } : b)
      );
    } catch (err) {
      console.error("❌ deleteList error:", err);
      throw err;
    }
  };

const reorderLists = async (boardId: string, lists: List[]) => {
  setBoards((prev) =>
    prev.map((b) => (b.id === boardId || b._id === boardId) ? { ...b, lists } : b)
  );
  
  try {
    const listOrder = lists.map(list => list._id || list.id).filter(Boolean);
    
    const res = await fetch(`${API_URL}/api/boards/${boardId}/lists/reorder`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ listOrder }),
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to save list order');
    }
    
    const response = await res.json();
    
    if (!response.success) {
      throw new Error(response.message || 'Backend reported failure');
    }
  } catch (err) {
    console.error("❌ reorderLists error:", err);
    refreshData();
    throw err;
  }
};


  // Card Methods
const addCard = async (boardId: string, listId: string, card: Omit<Card, "id">) => {
  try {
    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    const senderName = storedUser?.firstName && storedUser?.lastName
      ? `${storedUser.firstName} ${storedUser.lastName}`
      : storedUser?.email || "System";

    const payload = {
      title: card.title || 'Untitled Card',
      description: card.description || "",
      labels: card.labels || [],
      assignedMembers: card.assignedMembers || [],
      attachments: card.attachments || [],
      comments: card.comments || [],
      dueDate: card.dueDate && card.dueDate !== '' ? new Date(card.dueDate).toISOString() : null,
      googleEventId: (card as any).googleEventId || null,
      memberDeadlines: (card as any).memberDeadlines || {},
      memberEventIds: (card as any).memberEventIds || {},
      senderName,
    };

    const res = await fetch(
      `${API_URL}/api/boards/${boardId}/lists/${listId}/cards`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      await handleFetchError(res);
    }

    const userEmail = localStorage.getItem("userEmail");
    if (userEmail) fetchNotifications(userEmail);

    const updatedBoard = await res.json();
    const normalizedLists = normalizeLists(updatedBoard.lists);

    setBoards(prev =>
      prev.map(b => (b.id === boardId || b._id === boardId) ? { ...b, lists: normalizedLists } : b)
    );

    return updatedBoard;
  } catch (err) {
    console.error("❌ addCard error:", err);
    throw err;
  }
};

  const updateCard = async (
    boardId: string,
    listId: string,
    cardId: string,
    updates: Partial<Card>
  ) => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      const senderName = storedUser?.firstName && storedUser?.lastName
        ? `${storedUser.firstName} ${storedUser.lastName}`
        : storedUser?.email || "System";

      const payload = {
        ...updates,
        dueDate: updates.dueDate && updates.dueDate !== '' ? new Date(updates.dueDate).toISOString() : updates.dueDate === null ? null : undefined,
        senderName,
      };
      
      const res = await fetch(
        `${API_URL}/api/boards/${boardId}/lists/${listId}/cards/${cardId}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        await handleFetchError(res);
      }

      const userEmail = localStorage.getItem("userEmail");
      if (userEmail) fetchNotifications(userEmail);

      const updatedBoard = await res.json();
      const normalizedLists = normalizeLists(updatedBoard.lists);

      setBoards(prev =>
        prev.map(b => (b.id === boardId || b._id === boardId) ? { ...b, lists: normalizedLists } : b)
      );
    } catch (err) {
      console.error("❌ updateCard error:", err);
      throw err;
    }
  };

  const deleteCard = async (boardId: string, listId: string, cardId: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/boards/${boardId}/lists/${listId}/cards/${cardId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      if (!res.ok) {
        await handleFetchError(res);
      }

      const updatedBoard = await res.json();
      const normalizedLists = normalizeLists(updatedBoard.lists);

      setBoards(prev =>
        prev.map(b => (b.id === boardId || b._id === boardId) ? { ...b, lists: normalizedLists } : b)
      );
    } catch (err) {
      console.error("❌ deleteCard error:", err);
      throw err;
    }
  };

  const moveCard = async (
    boardId: string,
    cardId: string,
    fromListId: string,
    toListId: string,
    newIndex: number
  ) => {
    try {
      const res = await fetch(
        `${API_URL}/api/boards/${boardId}/lists/${fromListId}/cards/${cardId}/move`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({ 
            toListId, 
            newIndex,
          }),
        }
      );

      if (!res.ok) {
        await handleFetchError(res);
      }

      const updatedBoard = await res.json();
      const normalizedLists = normalizeLists(updatedBoard.lists);

      setBoards(prev =>
        prev.map(b => (b.id === boardId || b._id === boardId) ? { ...b, lists: normalizedLists } : b)
      );
    } catch (err) {
      console.error("❌ moveCard error:", err);
      throw err;
    }
  };

  // Board Member Methods
  const searchUsers = async (query: string): Promise<any[]> => {
    try {
      if (!query.trim()) return [];
      
      const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        await handleFetchError(res);
      }
      
      return await res.json();
    } catch (error) {
      console.error("Error searching users:", error);
      return [];
    }
  };

  const updateBoardMembers = async (boardId: string, members: any[]) => {
    try {
      const response = await fetch(`${API_URL}/api/boards/${boardId}/members`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ members }),
      });
      
      if (!response.ok) {
        await handleFetchError(response);
      }
      
      const data = await response.json();
      
      setBoards(prev => prev.map(b => 
        (b.id === boardId || b._id === boardId) 
          ? { ...b, members: members } 
          : b
      ));
      
      return data;
    } catch (error) {
      console.error('Error updating members:', error);
      throw error;
    }
  };

  // Notification Methods
  const fetchNotifications = async (userEmail: string) => {
    if (!userEmail) return;

    try {
      const res = await fetch(`${API_URL}/api/notifications/${encodeURIComponent(userEmail)}`, {
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        await handleFetchError(res);
      }
      
      const data = await res.json();
      setNotifications(data.map((n: any) => {
        const normalizedId = String(n._id || n.id || '').trim();
        return {
          ...n,
          id: normalizedId,
          _id: normalizedId
        };
      }));
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  const addNotification = async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
    try {
      const res = await fetch(`${API_URL}/api/notifications`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(notification),
      });
      
      if (!res.ok) {
        await handleFetchError(res);
      }
      
      const newNotif = await res.json();
      const currentUser = localStorage.getItem("userEmail");
      
      if (currentUser && notification.userEmail === currentUser) {
        const normalizedId = String(newNotif._id || newNotif.id || '').trim();
        setNotifications(prev => [{
          ...newNotif,
          id: normalizedId,
          _id: normalizedId
        }, ...prev]);
      }
    } catch (err) {
      console.error("Failed to add notification:", err);
      throw err;
    }
  };

  const markNotificationRead = async (notificationId: string): Promise<boolean> => {
    if (!notificationId) {
      console.error("❌ markNotificationRead called with empty ID");
      throw new Error("Invalid notification ID");
    }

    const idToUpdate = String(notificationId).trim();

    try {
      const response = await fetch(`${API_URL}/api/notifications/${idToUpdate}/read`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        await handleFetchError(response);
      }
      
      setNotifications((prev) => 
        prev.map((notif) => {
          const notifId = String(notif._id || notif.id || '').trim();
          if (notifId === idToUpdate) {
            return { ...notif, read: true };
          }
          return notif;
        })
      );
      
      return true;
    } catch (err: any) {
      console.error("❌ Failed to mark notification as read:", err);
      throw err;
    }
  };

  const markAllNotificationsRead = async (userEmail: string): Promise<void> => {
    if (!userEmail) return;
    
    try {
      const response = await fetch(`${API_URL}/api/notifications/mark-all-read/${encodeURIComponent(userEmail)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        await handleFetchError(response);
      }
      
      setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })));
    } catch (err) {
      console.error("❌ Failed to mark all notifications as read:", err);
      throw err;
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        await handleFetchError(response);
      }
      
      setNotifications(prev => prev.filter(notif => notif._id !== id && notif.id !== id));
    } catch (err) {
      console.error("Failed to delete notification:", err);
      throw err;
    }
  };

  const clearAllNotifications = async (userEmail?: string) => {
    if (!userEmail) return;
    try {
      const response = await fetch(`${API_URL}/api/notifications/clear/${encodeURIComponent(userEmail)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        await handleFetchError(response);
      }
      
      setNotifications([]);
    } catch (err) {
      console.error("Failed to clear notifications:", err);
      throw err;
    }
  };

  const refreshData = () => {
    setLastRefresh(Date.now());
  };

  useEffect(() => {
    const userEmail = localStorage.getItem("userEmail");
    if (userEmail) {
      fetchNotifications(userEmail);
    }

    const handleAuthChange = (e: any) => {
      if (e.detail?.userEmail) {
        fetchNotifications(e.detail.userEmail);
      }
    };

    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, []);

  const value: AppContextType = {
    boards,
    setBoards,
    notifications,
    fetchNotifications,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
    normalizeLists,
    addBoard,
    updateBoard,
    deleteBoard,
    addList,
    updateList,
    deleteList,
    reorderLists,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    searchUsers,
    updateBoardMembers,
    refreshData,
    lastRefresh,
    fetchBoards,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
