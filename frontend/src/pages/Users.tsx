import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Shield, 
  User, 
  ArrowUpDown, 
  Menu, 
  X, 
  Archive,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Check,
  History,
  Filter,
  AlertCircle,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT = 60000; // 1 minute inactivity timeout
const PRIORITY_CHECK_INTERVAL = 1500; // Check priority status every 1.5 seconds for faster updates

interface UserType {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'user';
  updatedAt: string;
  lockedByAdmin?: boolean;
  isArchived?: boolean;
  lockExpiresAt?: string;
  lockReason?: string;
  lockedByAdminName?: string;
  lockedByAdminAt?: string;
}

type SortField = 'name' | 'email' | 'role' | 'status';
type SortDirection = 'asc' | 'desc';

const Users = () => {
  const { addNotification } = useApp();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserType[]>([]);
  const [hasPriority, setHasPriority] = useState<boolean>(true);
  const [firstEditorName, setFirstEditorName] = useState<string>("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null);
  const [closedDueToInactivity, setClosedDueToInactivity] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const [customLockHours, setCustomLockHours] = useState<string>('');
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [mobileSortOpen, setMobileSortOpen] = useState(false);
  
  // Lock/Unlock confirmation dialogs
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [userToLock, setUserToLock] = useState<UserType | null>(null);
  const [userToUnlock, setUserToUnlock] = useState<UserType | null>(null);
  const [lockDuration, setLockDuration] = useState<string>('permanent');
  const [lockReason, setLockReason] = useState<string>('');
  const [lockHistoryDialogOpen, setLockHistoryDialogOpen] = useState(false);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<UserType | null>(null);
  const [lockHistory, setLockHistory] = useState<any[]>([]);
  const [showLockedOnly, setShowLockedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(10);

  // Inactivity tracking refs
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const priorityCheckRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user',
  });

  // Track user activity (mouse movement, keyboard input)
  const handleUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Send heartbeat to server to maintain priority
  const sendHeartbeat = useCallback(async () => {
    if (!editingUser || !hasPriority) return;
    
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      await fetch(`${API_URL}/api/users/${editingUser.id}/heartbeat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ adminId: currentUser?._id }),
      });
    } catch (err) {
      console.error("Error sending heartbeat:", err);
    }
  }, [editingUser, hasPriority, API_URL, currentUser]);

  // Extract fetchUsers so it can be reused for auto-refresh
  const fetchUsers = useCallback(async () => {
  try {
    // Check if offline before starting
    if (!navigator.onLine) {
      toast.error("No internet connection", {
        description: "Please check your connection and try again."
      });
      return [];
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.error("No authentication token found");
      toast.error("Please log in again");
      return [];
    }

    console.log("🔍 Fetching users from:", `${API_URL}/api/users`);
    console.log("📝 Using token:", token.substring(0, 20) + "...");

    const res = await fetch(`${API_URL}/api/users`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log("📨 Users response status:", res.status, res.statusText);

    // Check content type
    const contentType = res.headers.get('content-type');
    console.log("📄 Content-Type:", contentType);

    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error("❌ Non-JSON response received:", text.substring(0, 500));
      
      if (res.status === 404) {
        throw new Error(`Users API endpoint not found. Check if backend is running on ${API_URL}/api/users`);
      }
      throw new Error(`Server returned HTML instead of JSON. Status: ${res.status}`);
    }

    if (!res.ok) {
      const errorData = await res.json();
      console.error("❌ API error:", errorData);
      throw new Error(errorData.message || `Failed to fetch users: ${res.status}`);
    }

    const data = await res.json();
    console.log("✅ Users data received:", data);

    const fetchedUsers = (Array.isArray(data) ? data : data.users || []).map(
      (u: any) => {
        // Robust check for boolean value from various possible formats
        const isArchived = u.isArchived === true || u.isArchived === 'true';
        console.log(`User ${u.email}: raw_isArchived=${u.isArchived}, normalized=${isArchived}`);
        
        return {
          id: u._id,
          firstName: u.firstName || "",
          lastName: u.lastName || "",
          email: u.email || "",
          role: u.role || "user",
          updatedAt: u.updatedAt,
          lockedByAdmin: u.lockedByAdmin === true || u.lockedByAdmin === 'true',
          isArchived: isArchived,
          lockExpiresAt: u.lockExpiresAt,
          lockReason: u.lockReason,
          lockedByAdminName: u.lockedByAdminName,
          lockedByAdminAt: u.lockedByAdminAt,
        };
      }
    );
    
    console.log("📊 Normalized users:", fetchedUsers.length, "users");
    setUsers(fetchedUsers);
    return fetchedUsers;
    
  } catch (err: any) {
    console.error("💥 Error fetching users:", err);
    
    // Check if it's a network error
    if (err.name === 'TypeError' && err.message.includes('fetch') || !navigator.onLine) {
      toast.error("No internet connection", {
        description: "Please check your network and try again."
      });
    } else {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    }
    
    return [];
  }
}, [API_URL]);

  // Check if current user still has priority (for non-priority users to detect when they get priority)
  const checkPriorityStatus = useCallback(async () => {
    // If dialog is closed or no user is being edited, don't check
    if (!dialogOpen || !editingUser) return;
    
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const resp = await fetch(`${API_URL}/api/users/${editingUser.id}/edit-status?adminId=${currentUser?._id}`, {
        method: "GET",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
      });
      
      const data = await resp.json();
      
      // If we didn't have priority but now session is available, claim it!
      if (!hasPriority && (!data.hasActiveSession || data.canClaimPriority)) {
        // Try to claim priority by starting a new edit session
        try {
          const claimResp = await fetch(`${API_URL}/api/users/${editingUser.id}/start-edit`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              adminId: currentUser?._id,
              adminName: `${currentUser?.firstName || "Admin"} ${currentUser?.lastName || ""}`.trim(),
            }),
          });
          
          const claimData = await claimResp.json();
          
          if (claimData.hasPriority) {
            // Successfully claimed priority - fetch fresh user data
            const freshUsers = await fetchUsers();
            const freshUserData = freshUsers?.find((u: UserType) => u.id === editingUser.id);
            
            if (freshUserData) {
              // Update form with latest data
              setFormData({
                firstName: freshUserData.firstName,
                lastName: freshUserData.lastName,
                email: freshUserData.email,
                password: "",
                role: freshUserData.role,
              });
              setEditingUser(freshUserData);
            }
            
            setHasPriority(true);
            setFirstEditorName("");
            setSessionExpiresAt(claimData.expiresAt ? new Date(claimData.expiresAt) : null);
            lastActivityRef.current = Date.now(); // Reset activity timer
            // Only show toast once when claiming priority
            toast.success("You now have edit priority for this user!", { duration: 3000, id: `priority-${editingUser.id}` });
          }
        } catch (claimErr) {
          console.error("Error claiming priority:", claimErr);
        }
      } else if (!hasPriority && data.hasActiveSession) {
        // Still no priority - update the editor name in case it changed
        setFirstEditorName(data.firstEditor?.adminName || "Another admin");
      }
      
      // If we had priority but lost it (force released or expired)
      if (hasPriority && (!data.hasActiveSession || !data.hasPriority)) {
        setHasPriority(false);
        setFirstEditorName(data.firstEditor?.adminName || "Another admin");
        toast.error("⚠️ Your edit session was force-released by another admin. You can no longer save changes.", { duration: 8000 });
      }
      
      // Update session expiry if provided
      if (data.expiresAt) {
        setSessionExpiresAt(new Date(data.expiresAt));
      }
    } catch (err) {
      console.error("Error checking priority status:", err);
    }
  }, [dialogOpen, editingUser, hasPriority, API_URL, currentUser, fetchUsers]);

  // Inactivity check - close modal if user is inactive for too long
  useEffect(() => {
    if (!dialogOpen || !editingUser || !hasPriority) return;

    const checkInactivity = () => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      
      if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
        // User has been inactive - close the modal and release priority
        setClosedDueToInactivity(true);
        handleCloseDialog();
        toast.error("Your edit session was closed due to inactivity. Priority has been released.", { duration: 5000 });
      }
    };

    // Check inactivity every 10 seconds
    inactivityTimerRef.current = setInterval(checkInactivity, 10000);

    // Send heartbeat every 30 seconds to maintain priority
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);

    return () => {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [dialogOpen, editingUser, hasPriority, sendHeartbeat]);

  // Priority check interval for ALL users (to detect force release or claim priority)
  useEffect(() => {
    if (!dialogOpen || !editingUser) {
      if (priorityCheckRef.current) {
        clearInterval(priorityCheckRef.current);
        priorityCheckRef.current = null;
      }
      return;
    }

    // Check frequently to detect priority changes (both gaining and losing)
    checkPriorityStatus();
    priorityCheckRef.current = setInterval(checkPriorityStatus, PRIORITY_CHECK_INTERVAL);

    return () => {
      if (priorityCheckRef.current) {
        clearInterval(priorityCheckRef.current);
        priorityCheckRef.current = null;
      }
    };
  }, [dialogOpen, editingUser, checkPriorityStatus]);

  // Add activity listeners when dialog is open
  useEffect(() => {
    if (!dialogOpen) return;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    
    events.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [dialogOpen, handleUserActivity]);

  // Force release edit session
  const handleForceRelease = async () => {
    if (!editingUser) return;
    
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("Authentication required");
      return;
    }

    try {
      const resp = await fetch(`${API_URL}/api/users/${editingUser.id}/force-release`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          adminId: currentUser?._id,
          adminName: `${currentUser?.firstName || "Admin"} ${currentUser?.lastName || ""}`.trim(),
        }),
      });

      if (resp.ok) {
        toast.success("Edit session released. You can now claim priority!");
        checkPriorityStatus();
      } else {
        throw new Error("Failed to release session");
      }
    } catch (err) {
      console.error("Error releasing session:", err);
      toast.error("Failed to release session");
    }
  };

  // Filter and sort users
  const filteredUsers = users.filter((user) => {
    const q = searchQuery.toLowerCase();
    const firstName = user.firstName?.toLowerCase() || "";
    const lastName = user.lastName?.toLowerCase() || "";
    const email = user.email?.toLowerCase() || "";
    
    // Search filter
    if (!firstName.includes(q) && !lastName.includes(q) && !email.includes(q)) {
      return false;
    }

    // Archive filter
    if (showArchived) {
      if (!user.isArchived) return false;
    } else {
      if (user.isArchived) return false;
    }
    
    // Lock status filter
    if (showLockedOnly && !user.lockedByAdmin) {
      return false;
    }
    
    return true;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aValue: string | boolean;
    let bValue: string | boolean;

    switch (sortField) {
      case 'name':
        aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
        bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
        break;
      case 'email':
        aValue = a.email.toLowerCase();
        bValue = b.email.toLowerCase();
        break;
      case 'role':
        aValue = a.role;
        bValue = b.role;
        break;
      case 'status':
        aValue = a.lockedByAdmin || false;
        bValue = b.lockedByAdmin || false;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = sortedUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(sortedUsers.length / usersPerPage);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setMobileSortOpen(false);
  };

  const generateRandomPassword = (length = 10) => {
    if (length < 8) length = 8;

    const upperCase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowerCase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const specialChars = "!@#$%^&*()_+[]{}|;:,.<>?";

    let password = '';
    password += upperCase[Math.floor(Math.random() * upperCase.length)];
    password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];

    const allChars = upperCase + lowerCase + numbers + specialChars;
    for (let i = password.length; i < length; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }

    password = password.split('').sort(() => Math.random() - 0.5).join('');
    return password;
  };

  // Lock account functions
  const handleOpenLockDialog = (user: UserType) => {
    if (user.id === currentUser?._id) {
      toast.error("You cannot lock your own account");
      return;
    }
    if (user.role === 'admin') {
      toast.error("You cannot lock other admin accounts");
      return;
    }
    setUserToLock(user);
    setLockDialogOpen(true);
  };

  // Open unlock confirmation dialog
  const handleOpenUnlockDialog = (user: UserType) => {
    setUserToUnlock(user);
    setUnlockDialogOpen(true);
  };

  const handleLockAccount = async () => {
    if (!userToLock) return;
    
    try {
      // Calculate duration in minutes (convert hours to minutes)
      let durationMinutes = null;
      if (lockDuration === 'custom' && customLockHours) {
        durationMinutes = parseInt(customLockHours) * 60; // hours to minutes
      } else if (lockDuration !== 'permanent') {
        durationMinutes = parseInt(lockDuration) * 60; // hours to minutes
      }
      
      const url = `${API_URL}/api/users/${userToLock.id}/lock`;
      const token = localStorage.getItem('token');
      
      console.log("🔒 Lock request:", {
        url,
        userId: userToLock.id,
        durationMinutes,
        adminId: currentUser?._id,
        adminName: `${currentUser?.firstName} ${currentUser?.lastName}`
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          adminId: currentUser?._id,
          adminName: `${currentUser?.firstName} ${currentUser?.lastName}`,
          duration: durationMinutes, // Send as "duration" not "durationMinutes"
          reason: lockReason
        })
      });

      console.log("📨 Lock response status:", res.status, res.statusText);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ Lock error response:", errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message || errorData.error || `Lock failed: ${res.status}`);
        } catch {
          throw new Error(`Lock failed: ${res.status} ${res.statusText}`);
        }
      }

      const data = await res.json();
      console.log("✅ Lock success:", data);

      let successMessage = 'Account locked ';
      if (lockDuration === 'permanent') {
        successMessage += 'permanently';
      } else if (lockDuration === 'custom') {
        successMessage += `for ${customLockHours} hours`;
      } else {
        successMessage += `for ${lockDuration} hours`;
      }
      
      // Use server message if provided, otherwise use client message
      // Use unique toast ID to prevent duplicates
      toast.success(data.message || successMessage, { id: `lock-${userToLock.id}` });
      fetchUsers();
      setLockDialogOpen(false);
      setUserToLock(null);
      setLockReason('');
      setLockDuration('permanent');
      setCustomLockHours('');
    } catch (err: any) {
      console.error("💥 Lock exception:", err);
      toast.error(err.message || 'Failed to lock account');
    }
  };

  const handleUnlockAccount = async () => {
    if (!userToUnlock) return;
    
    try {
      const res = await fetch(`${API_URL}/api/users/${userToUnlock.id}/unlock`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          adminId: currentUser?._id,
          adminName: `${currentUser?.firstName} ${currentUser?.lastName}`
        })
      });

      if (res.ok) {
        toast.success('Account unlocked successfully', { id: `unlock-${userToUnlock.id}` });
        fetchUsers();
        setUnlockDialogOpen(false);
        setUserToUnlock(null);
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to unlock account');
      }
    } catch (err) {
      toast.error('Failed to unlock account');
    }
  };

  const handleViewLockDetails = async (user: UserType) => {
    try {
      const res = await fetch(`${API_URL}/api/users/${user.id}/lock-status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      
      if (data.lockedByAdmin) {
        toast.info(
          <div className="space-y-1">
            <p className="font-semibold">Account Lock Details</p>
            <p>Reason: {data.lockReason || 'No reason provided'}</p>
            <p>Locked by: {data.lockedByAdminName}</p>
            <p>Locked at: {new Date(data.lockedByAdminAt).toLocaleString()}</p>
            {data.lockExpiresAt && (
              <p>Expires: {new Date(data.lockExpiresAt).toLocaleString()}</p>
            )}
          </div>,
          { duration: 10000 }
        );
      }
    } catch (err) {
      console.error('Error fetching lock status:', err);
    }
  };

  const handleViewLockHistory = async (user: UserType) => {
    setSelectedUserForHistory(user);
    try {
      const res = await fetch(`${API_URL}/api/users/${user.id}/lock-history`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      setLockHistory(data.lockHistory || []);
      setLockHistoryDialogOpen(true);
    } catch (err) {
      console.error('Error fetching lock history:', err);
      toast.error('Failed to load lock history');
    }
  };

  const handleBulkLock = async () => {
    if (selectedUsers.length === 0) {
      toast.error('No users selected');
      return;
    }
    
    try {
      for (const userId of selectedUsers) {
        await fetch(`${API_URL}/api/users/${userId}/lock`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            adminId: currentUser?._id,
            adminName: `${currentUser?.firstName} ${currentUser?.lastName}`,
            reason: 'Bulk lock action'
          })
        });
      }
      toast.success(`Locked ${selectedUsers.length} account(s)`);
      setSelectedUsers([]);
      fetchUsers();
    } catch (err) {
      toast.error('Failed to lock accounts');
    }
  };

  const handleBulkUnlock = async () => {
    if (selectedUsers.length === 0) {
      toast.error('No users selected');
      return;
    }
    
    try {
      for (const userId of selectedUsers) {
        await fetch(`${API_URL}/api/users/${userId}/unlock`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            adminId: currentUser?._id,
            adminName: `${currentUser?.firstName} ${currentUser?.lastName}`
          })
        });
      }
      toast.success(`Unlocked ${selectedUsers.length} account(s)`);
      setSelectedUsers([]);
      fetchUsers();
    } catch (err) {
      toast.error('Failed to unlock accounts');
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === currentUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(currentUsers.map(user => user.id));
    }
  };

  const handleOpenDialog = async (user?: UserType) => {
    // Reset inactivity flag
    setClosedDueToInactivity(false);
    lastActivityRef.current = Date.now();
    
    if (user) {
      // Edit existing user — ask backend to register edit session
      setEditingUser(null);

      const token = localStorage.getItem('token');
      if (!token) {
        toast.error("Authentication required");
        return;
      }

      try {
        const resp = await fetch(`${API_URL}/api/users/${user.id}/start-edit`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            adminId: currentUser?._id,
            adminName: `${currentUser?.firstName || "Admin"} ${currentUser?.lastName || ""}`.trim(),
          }),
        });

        const data = await resp.json();

        // Backend responds with hasPriority and firstEditor info
        setHasPriority(Boolean(data.hasPriority));
        setFirstEditorName(data.firstEditor?.adminName || "");
        
        // Set session expiry if provided
        if (data.expiresAt) {
          setSessionExpiresAt(new Date(data.expiresAt));
        }

        // Pre-fill form
        setFormData({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          password: "",
          role: user.role,
        });

        setEditingUser(user);
        setDialogOpen(true);

        // Only show toast for non-priority users (priority users see plain modal)
        // Toast is shown via the DialogDescription, no need for duplicate toast here
      } catch (err) {
        console.error("Error starting edit session:", err);
        toast.error("Failed to start edit session");
      }
    } else {
      // Add new user
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        password: generateRandomPassword(),
        role: "user",
      });
      setHasPriority(true);
      setFirstEditorName("");
      setEditingUser(null);
      setSessionExpiresAt(null);
      setDialogOpen(true);
    }
  };

  // Close dialog and end edit session (if any)
  const handleCloseDialog = async () => {
    // Clear all timers FIRST to prevent any pending checks from firing
    if (inactivityTimerRef.current) {
      clearInterval(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    
    if (priorityCheckRef.current) {
      clearInterval(priorityCheckRef.current);
      priorityCheckRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Always end edit session when closing - whether we have priority or not
    // This releases the concurrency lock so other admins can edit
    if (editingUser) {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          await fetch(`${API_URL}/api/users/${editingUser.id}/end-edit`, {
            method: "DELETE",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ adminId: currentUser?._id }),
          });
        } catch (err) {
          console.error("Error ending edit session:", err);
        }
      }
    }

    setDialogOpen(false);
    setEditingUser(null);
    setHasPriority(true);
    setFirstEditorName("");
    setSessionExpiresAt(null);
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      role: "user",
    });
  };
  

  // Save (create or update)
  const handleSaveUser = async () => {
    // Basic validation
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast.error("All fields are required");
      return;
    }

    if (/\d/.test(formData.firstName) || /\d/.test(formData.lastName)) {
      toast.error("First and last name cannot contain numbers.");
      return;
    }

     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(formData.email)) {
    toast.error("Please enter a valid email address (e.g., user@example.com)");
    return;
  }

  // Additional email validation for specific patterns
  const invalidPatterns = [
    /^gmail$/i, // Just "gmail" without domain
    /@gmail$/i, // "@gmail" without .com
    /^[^@]*$/i, // No @ symbol
    /@[^.]*$/i, // No dot after @
    /\s/ // Contains spaces
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(formData.email)) {
      toast.error("Please enter a complete valid email address (e.g., user@gmail.com)");
      return;
    }
  }

    if (!editingUser && !formData.password) {
      toast.error("Password is required for new users");
      return;
    }

    // If editing, frontend will check the hasPriority flag (backend is authoritative)
    if (editingUser && !hasPriority) {
      toast.error(`❌ Save rejected! ${firstEditorName || "Another admin"} has priority.`);
      handleCloseDialog();
      return;
    }

    if (isSavingUser) return;
    setIsSavingUser(true);

    try {
      const url = `${API_URL}/api/users`;
      let res: Response;
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error("Authentication required");
        return;
      }

      if (editingUser) {
        res = await fetch(`${url}/${editingUser.id}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            ...formData,
            lastUpdatedAt: editingUser.updatedAt,
            adminId: currentUser?._id,
          }),
        });
      } else {
        res = await fetch(url, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(formData),
        });
      }

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 403 || result.code === "NO_PRIORITY") {
          toast.error(result.message || "Save rejected due to priority");
          handleCloseDialog();
          return;
        }
        if (res.status === 409 || result.code === "TIMESTAMP_CONFLICT") {
          toast.error(result.message || "Record changed by another admin. Refresh and try again.");
          fetchUsers();
          handleCloseDialog();
          return;
        }
        throw new Error(result.message || "Failed to save user");
      }

      const u = result.user || result;
      const normalizedUser: UserType = {
        id: u._id,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        email: u.email || "",
        role: u.role || "user",
        updatedAt: u.updatedAt,
        lockedByAdmin: u.lockedByAdmin || false,
        lockExpiresAt: u.lockExpiresAt,
        lockReason: u.lockReason,
        lockedByAdminName: u.lockedByAdminName,
        lockedByAdminAt: u.lockedByAdminAt,
      };

      if (editingUser) {
        setUsers((prev) => prev.map((p) => (p.id === editingUser.id ? normalizedUser : p)));
        toast.success("User updated successfully!", { duration: 3000, id: `update-${editingUser.id}` });
      } else {
        setUsers((prev) => [...prev, normalizedUser]);
        addNotification({
          _id: `notif-${Date.now()}`,
          userEmail: normalizedUser.email,
          message: `Welcome! Your account was created by ${currentUser?.firstName || "Admin"}.`,
          type: "welcome",
          read: false,
        });

        users
          .filter((u) => u.role === "admin")
          .forEach((admin) => {
            addNotification({
              _id: `notif-${Date.now()}-${admin.id}`,
              userEmail: admin.email,
              message: `New user ${normalizedUser.firstName} ${normalizedUser.lastName} (${normalizedUser.email}) was added.`,
              type: "new_signup",
              read: false,
            });
          });
        
        toast.success("User added successfully!", { id: `add-${normalizedUser.id}` });
      }

      fetchUsers();
      handleCloseDialog();
    } catch (error: any) {
      console.error("Error saving user:", error);
      toast.error(error.message || "Failed to save user");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteClick = (user: UserType) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      const res = await fetch(`${API_URL}/api/users/${userToDelete.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to archive user");
      }

      toast.success(`User ${userToDelete.firstName} ${userToDelete.lastName} has been archived`);
      fetchUsers();
    } catch (error: any) {
      console.error("Error archiving user:", error);
      toast.error(error.message || "Failed to archive user");
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleUnarchiveUser = async (user: UserType) => {
    try {
      const res = await fetch(`${API_URL}/api/users/${user.id}/unarchive`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to unarchive user");
      }

      toast.success(`User ${user.firstName} ${user.lastName} has been restored`);
      fetchUsers();
    } catch (error: any) {
      console.error("Error unarchiving user:", error);
      toast.error(error.message || "Failed to unarchive user");
    }
  };

  const handleChangeRole = async (id: string, newRole: 'admin' | 'user') => {
    try {
      const res = await fetch(`${API_URL}/api/users/${id}/role`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update role");
      }

      setUsers(prev =>
        prev.map(user =>
          user.id === id ? { ...user, role: newRole } : user
        )
      );

      toast.success(`Role updated to ${newRole}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 sm:w-4 sm:h-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUpDown className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
    ) : (
      <ArrowUpDown className="w-3 h-3 sm:w-4 sm:h-4 ml-1 transform rotate-180" />
    );
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortField, sortDirection, showLockedOnly, showArchived]);

  // Initial fetch
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Auto-refresh every 5 seconds
  useAutoRefresh({
    interval: 5000,
    enabled: true,
    onRefresh: fetchUsers,
  });

  return (
    <div className="h-screen flex flex-col overflow-hidden p-2 sm:p-3 md:p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gradient truncate">
            Manage Users
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm truncate">
            Add, edit, and manage user accounts
          </p>
        </div>

        <Dialog 
          open={dialogOpen} 
          onOpenChange={(open) => {
            // Only allow opening via button click (which calls handleOpenDialog)
            // Closing is handled via Cancel button (handleCloseDialog)
            if (open) {
              handleOpenDialog();
            }
            // Don't close via X button - only allow Cancel button for proper cleanup
          }}
        >
          <DialogTrigger asChild>
            <Button 
              className="gradient-primary hover-glow w-full sm:w-auto mt-2 sm:mt-0 h-8"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                handleOpenDialog();
              }}
            >
              <Plus className="w-3 h-3 mr-1.5" />
              <span className="text-xs">Add User</span>
            </Button>
          </DialogTrigger>
          <DialogContent 
            className="glass-strong border-border max-w-[95vw] rounded-lg sm:rounded-xl sm:max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar [&>button]:hidden"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onMouseMove={handleUserActivity}
            onKeyDown={handleUserActivity}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">
                {editingUser ? 'Edit User' : 'Add New User'}
              </DialogTitle>
              <DialogDescription className="text-sm sm:text-base" asChild>
                <div>
                  {editingUser ? (
                    !hasPriority ? (
                      <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        <div className="flex items-center justify-between">
                          <span>
                            ⏳ Waiting for edit access... <strong>{firstEditorName || "Another admin"}</strong> is currently editing.
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-xs hover:bg-destructive/20"
                            onClick={() => checkPriorityStatus()}
                            title="Check if priority is available"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Check
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={handleForceRelease}
                            title="Forcefully release other admin's session"
                          >
                            Force Release
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Update user information</span>
                    )
                  ) : (
                    <span>Create a new user account</span>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5 sm:space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label htmlFor="firstName" className="text-xs sm:text-sm">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    className="glass text-xs sm:text-sm h-8 sm:h-9"
                    placeholder="Enter first name"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="lastName" className="text-xs sm:text-sm">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    className="glass text-xs sm:text-sm h-8 sm:h-9"
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label htmlFor="email" className="text-xs sm:text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="glass text-xs sm:text-sm h-8 sm:h-9"
                    placeholder="Enter email address"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="role" className="text-xs sm:text-sm">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: 'admin' | 'user') =>
                      setFormData({ ...formData, role: value })
                    }
                  >
                    <SelectTrigger className="glass text-xs sm:text-sm h-8 sm:h-9">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-border z-50">
                      <SelectItem value="user" className="text-xs sm:text-sm">Normal User</SelectItem>
                      <SelectItem value="admin" className="text-xs sm:text-sm">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!editingUser && (
                <div className="space-y-0.5">
                  <Label htmlFor="password" className="text-xs sm:text-sm">
                    Auto-Generated Password
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      type="text"
                      value={formData.password}
                      readOnly
                      className="glass text-xs sm:text-sm bg-muted cursor-not-allowed h-8 sm:h-9 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 sm:h-9 text-xs whitespace-nowrap"
                      onClick={() =>
                        setFormData({ ...formData, password: generateRandomPassword() })
                      }
                    >
                      Regenerate
                    </Button>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    This password is automatically generated.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
                <Button variant="outline" onClick={handleCloseDialog} className="glass w-full sm:w-auto order-2 sm:order-1 text-xs sm:text-sm h-8 sm:h-9" size="sm">
                Cancel
              </Button>
              <Button 
                onClick={handleSaveUser} 
                disabled={isSavingUser}
                className="gradient-primary hover-glow w-full sm:w-auto order-1 sm:order-2 text-xs sm:text-sm h-8 sm:h-9"
                size="sm"
              >
                {isSavingUser ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>{editingUser ? 'Update' : 'Create'} User</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Archive Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] rounded-lg sm:rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl text-destructive">
              Archive User
            </DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              {userToDelete && (
                <>
                  Are you sure you want to archive <strong>{userToDelete.firstName} {userToDelete.lastName}</strong>?
                  This action will disable their account but preserve their data.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
            <Button 
              variant="outline" 
              onClick={handleCancelDelete}
              className="glass w-full sm:w-auto order-2 sm:order-1 text-sm sm:text-base"
              size="sm"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto order-1 sm:order-2 text-sm sm:text-base"
              size="sm"
            >
              <Archive className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Archive User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Account Dialog */}
      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] rounded-lg sm:rounded-xl sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Lock User Account</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Are you sure you want to lock account for <strong>{userToLock?.firstName} {userToLock?.lastName}</strong>?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lock Duration</Label>
              <Select 
                value={lockDuration} 
                onValueChange={(value) => {
                  setLockDuration(value);
                  // Reset custom hours if switching away from custom
                  if (value !== 'custom') {
                    setCustomLockHours('');
                  }
                }}
              >
                <SelectTrigger className="glass">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent className="glass-strong border-border">
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="custom">Custom duration</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {lockDuration === 'custom' && (
              <div className="space-y-2">
                <Label>Custom Duration (hours)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max="8760" // Max 1 year
                  placeholder="Enter hours"
                  value={customLockHours}
                  onChange={(e) => setCustomLockHours(e.target.value)}
                  className="glass"
                />
                <p className="text-xs text-muted-foreground">
                  Enter number of hours to lock account
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Reason for Lock (Optional)</Label>
              <Textarea 
                placeholder="Enter reason for locking this account"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                className="glass resize-none"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => {
              setLockDialogOpen(false);
              setCustomLockHours('');
              setLockReason('');
            }} className="glass w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              onClick={handleLockAccount}
              className="bg-amber-600 hover:bg-amber-700 w-full sm:w-auto"
              disabled={lockDuration === 'custom' && (!customLockHours || parseInt(customLockHours) <= 0)}
            >
              <Lock className="w-4 h-4 mr-2" />
              Lock Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock Account Dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] rounded-lg sm:rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Unlock User Account</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Are you sure you want to unlock account for <strong>{userToUnlock?.firstName} {userToUnlock?.lastName}</strong>?
              <br />
              <span className="text-muted-foreground text-xs">
                This will allow the user to access their account immediately.
              </span>
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setUnlockDialogOpen(false)}
              className="glass w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUnlockAccount}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              <Unlock className="w-4 h-4 mr-2" />
              Unlock Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock History Dialog */}
      <Dialog open={lockHistoryDialogOpen} onOpenChange={setLockHistoryDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] rounded-lg sm:rounded-xl sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Lock History</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Lock/unlock history for {selectedUserForHistory?.firstName} {selectedUserForHistory?.lastName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {lockHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No lock history found</p>
              </div>
            ) : (
              lockHistory.map((entry, index) => (
                <div key={index} className="p-3 rounded-lg border border-border bg-card/50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center">
                      {(entry.action || "").toLowerCase() === 'locked' ? (
                        <Lock className="w-4 h-4 text-amber-500 mr-2" />
                      ) : (
                        <Unlock className="w-4 h-4 text-green-500 mr-2" />
                      )}
                      <span className="font-medium capitalize">{entry.action}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>By: {entry.adminName}</p>
                    {entry.reason && <p>Reason: {entry.reason}</p>}
                    {entry.duration && <p>Duration: {entry.duration} minutes</p>}
                    {entry.expiresAt && (
                      <p>Expires: {new Date(entry.expiresAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockHistoryDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Actions */}
      {selectedUsers.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <AlertCircle className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkLock}
            className="text-amber-700 border-amber-200 hover:bg-amber-50"
          >
            <Lock className="w-3 h-3 mr-1" />
            Lock Selected
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkUnlock}
            className="text-green-700 border-green-200 hover:bg-green-50"
          >
            <Unlock className="w-3 h-3 mr-1" />
            Unlock Selected
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedUsers([])}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between items-stretch sm:items-center flex-shrink-0">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 glass w-full text-xs h-8 sm:text-sm"
          />
        </div>

        <div className="flex gap-2">
          {/* Archive Filter Button */}
          <Button
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived(!showArchived)}
            className="glass flex items-center gap-1.5 text-xs h-8"
            size="sm"
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? 'Show Active' : 'Show Archived'}
          </Button>

          {/* Lock Filter Button */}
          <Button
            variant={showLockedOnly ? "default" : "outline"}
            onClick={() => setShowLockedOnly(!showLockedOnly)}
            className="glass flex items-center gap-1.5 text-xs h-8"
            size="sm"
          >
            <Filter className="w-3.5 h-3.5" />
            {showLockedOnly ? 'Show All' : 'Show Locked Only'}
          </Button>

          {/* Desktop Sort Buttons */}
          <div className="hidden sm:flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSort('name')}
              className="glass flex items-center justify-center text-xs h-8 px-3"
              size="sm"
            >
              Name
              {getSortIcon('name')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSort('email')}
              className="glass flex items-center justify-center text-xs h-8 px-3"
              size="sm"
            >
              Email
              {getSortIcon('email')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSort('role')}
              className="glass flex items-center justify-center text-xs h-8 px-3"
              size="sm"
            >
              Role
              {getSortIcon('role')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSort('status')}
              className="glass flex items-center justify-center text-xs h-8 px-3"
              size="sm"
            >
              Status
              {getSortIcon('status')}
            </Button>
          </div>

          {/* Mobile Sort Dropdown */}
          <div className="sm:hidden relative">
            <Button
              variant="outline"
              onClick={() => setMobileSortOpen(!mobileSortOpen)}
              className="glass w-full flex items-center justify-between text-xs h-8"
              size="sm"
            >
              <span>Sort by: {sortField}</span>
              {mobileSortOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
            </Button>
            
            {mobileSortOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover/95 border border-border rounded-lg shadow-lg z-10 backdrop-blur-sm">
                <div className="p-1 space-y-0.5">
                  <button
                    onClick={() => handleSort('name')}
                    className="w-full text-left px-3 py-1.5 rounded-md hover:bg-accent/30 transition-colors flex items-center justify-between text-xs"
                  >
                    Name {getSortIcon('name')}
                  </button>
                  <button
                    onClick={() => handleSort('email')}
                    className="w-full text-left px-3 py-1.5 rounded-md hover:bg-accent/30 transition-colors flex items-center justify-between text-xs"
                  >
                    Email {getSortIcon('email')}
                  </button>
                  <button
                    onClick={() => handleSort('role')}
                    className="w-full text-left px-3 py-1.5 rounded-md hover:bg-accent/30 transition-colors flex items-center justify-between text-xs"
                  >
                    Role {getSortIcon('role')}
                  </button>
                  <button
                    onClick={() => handleSort('status')}
                    className="w-full text-left px-3 py-1.5 rounded-md hover:bg-accent/30 transition-colors flex items-center justify-between text-xs"
                  >
                    Status {getSortIcon('status')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Minimal Top Pagination */}
      {sortedUsers.length > 0 && (
        <div className="flex items-center justify-between py-1 flex-shrink-0">
          <span className="text-[10px] sm:text-xs text-muted-foreground font-medium pl-1">
             {indexOfFirstUser + 1}-{Math.min(indexOfLastUser, sortedUsers.length)} of {sortedUsers.length} users
          </span>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="h-6 w-6 sm:h-7 sm:w-7"
            >
              <ChevronLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="sr-only">Previous</span>
            </Button>
            
            <div className="flex items-center gap-1 mx-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNumber;
                if (totalPages <= 5) {
                  pageNumber = i + 1;
                } else if (currentPage <= 3) {
                  pageNumber = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNumber = totalPages - 4 + i;
                } else {
                  pageNumber = currentPage - 2 + i;
                }

                if (pageNumber > totalPages) return null;

                return (
                  <Button
                    key={pageNumber}
                    variant={currentPage === pageNumber ? "default" : "ghost"}
                    size="sm"
                    onClick={() => handlePageChange(pageNumber)}
                    className={`text-[10px] sm:text-xs h-5 min-w-[1.25rem] sm:h-6 sm:min-w-[1.5rem] px-1 rounded-full ${
                      currentPage === pageNumber 
                        ? "gradient-primary" 
                        : "hover:bg-muted"
                    }`}
                  >
                    {pageNumber}
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="h-6 w-6 sm:h-7 sm:w-7"
            >
              <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="sr-only">Next</span>
            </Button>
          </div>
        </div>
      )}

      {/* Users Table Card */}
      <Card className="glass-strong overflow-hidden border-0 sm:border flex-1 flex flex-col min-h-0">
        
        {/* Desktop Table */}
        <div className="hidden sm:flex flex-col flex-1 min-h-0">
          {/* Fixed Header */}
          <div className="grid grid-cols-12 gap-2 p-2 border-b border-border glass text-xs font-medium text-foreground sticky top-0 z-20">
            <div className="col-span-1 pl-2">
              <input
                type="checkbox"
                checked={selectedUsers.length === currentUsers.length && currentUsers.length > 0}
                onChange={handleSelectAll}
                className="rounded border-border"
              />
            </div>
            <div className="col-span-3">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right pr-2">Actions</div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="min-w-[600px]">
              {/* Table Body */}
              <div>
                {currentUsers.map((user) => (
                  <div key={user.id} className="grid grid-cols-12 gap-2 p-2 border-b border-border/50 hover:bg-accent/30 transition-colors items-center">
                    <div className="col-span-1 pl-2">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserSelect(user.id)}
                        className="rounded border-border"
                      />
                    </div>
                    <div className="col-span-3 flex items-center space-x-2.5 overflow-hidden">
                      <div className="w-7 h-7 rounded-full gradient-secondary flex items-center justify-center text-white font-bold text-xs flex-shrink-0 relative">
                        {user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
                        {user.lockedByAdmin && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border border-background" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="font-medium text-xs sm:text-sm truncate">
                            {user.firstName} {user.lastName}
                          </p>
                          {user.lockedByAdmin && (
                            <span className="text-xs bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded-full">
                              Locked
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-3 text-muted-foreground text-xs sm:text-sm truncate">
                      {user.email}
                    </div>
                    <div className="col-span-2 flex items-center">
                      {user.role === 'admin' ? (
                        <Shield className="w-3 h-3 mr-1.5 text-primary flex-shrink-0" />
                      ) : (
                        <User className="w-3 h-3 mr-1.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-xs sm:text-sm capitalize truncate">{user.role}</span>
                    </div>
                    <div className="col-span-1">
                      {user.lockedByAdmin ? (
                        <div 
                          className="cursor-pointer" 
                          onClick={() => handleViewLockDetails(user)}
                          title="Click for lock details"
                        >
                          <Lock className="w-4 h-4 text-amber-500" />
                        </div>
                      ) : (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <div className="col-span-2 flex items-center justify-end space-x-1 pr-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenDialog(user)}
                        disabled={user.lockedByAdmin}
                        title={user.lockedByAdmin ? "Cannot edit locked account" : "Edit user"}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      {!user.lockedByAdmin ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700"
                          onClick={() => handleOpenLockDialog(user)}
                          title="Lock account"
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                          onClick={() => handleOpenUnlockDialog(user)}
                          title="Unlock account"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleViewLockHistory(user)}
                        title="View lock history"
                      >
                        <History className="w-3.5 h-3.5" />
                      </Button>
                      {user.isArchived ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                          onClick={() => handleUnarchiveUser(user)}
                          title="Restore user"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(user)}
                          title="Archive user"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="sm:hidden space-y-2 p-3 flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {currentUsers.map((user) => (
            <Card key={user.id} className="glass p-2.5 border-border/50">
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-full gradient-secondary flex items-center justify-center text-white font-bold text-xs flex-shrink-0 relative">
                    {user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
                    {user.lockedByAdmin && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border border-background" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="font-medium text-sm truncate">
                        {user.firstName} {user.lastName}
                      </p>
                      {user.lockedByAdmin && (
                        <span className="text-xs bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded-full">
                          Locked
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {user.role === 'admin' ? (
                    <Shield className="w-3 h-3 mr-1.5 text-primary" />
                  ) : (
                    <User className="w-3 h-3 mr-1.5 text-muted-foreground" />
                  )}
                  <span className="text-xs capitalize">{user.role}</span>
                  <div className="ml-3">
                    {user.lockedByAdmin ? (
                      <Lock className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Check className="w-3 h-3 text-green-500" />
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleOpenDialog(user)}
                    disabled={user.lockedByAdmin}
                    title={user.lockedByAdmin ? "Cannot edit locked account" : "Edit user"}
                  >
                    <Edit className="w-3 h-3" />
                  </Button>
                  {!user.lockedByAdmin ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-amber-600 hover:text-amber-700"
                      onClick={() => handleOpenLockDialog(user)}
                      title="Lock account"
                    >
                      <Lock className="w-3 h-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                      onClick={() => handleOpenUnlockDialog(user)}
                      title="Unlock account"
                    >
                      <Unlock className="w-3 h-3" />
                    </Button>
                  )}
                  {user.isArchived ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                      onClick={() => handleUnarchiveUser(user)}
                      title="Restore user"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(user)}
                      title="Archive user"
                    >
                      <Archive className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {sortedUsers.length === 0 && (
          <div className="p-4 sm:p-6 text-center flex-1 flex flex-col justify-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 rounded-full gradient-secondary flex items-center justify-center">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h3 className="text-sm sm:text-base font-bold mb-1">
              {showArchived ? 'No archived users' : 'No users found'}
            </h3>
            <p className="text-muted-foreground text-xs sm:text-sm mb-3">
              {searchQuery 
                ? 'Try adjusting your search terms' 
                : showArchived 
                  ? 'Archived users will appear here' 
                  : 'No users have been added yet'
              }
            </p>
            {!searchQuery && (
              <Button 
                onClick={() => handleOpenDialog()} 
                className="gradient-primary hover-glow text-xs sm:text-sm h-8"
                size="sm"
              >
                <Plus className="w-3 h-3 mr-1.5" />
                Add First User
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.4);
        }
        .custom-scrollbar::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>
    </div>
  );
};

export default Users;