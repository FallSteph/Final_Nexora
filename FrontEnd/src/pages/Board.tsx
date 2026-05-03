import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { addEventToGoogleCalendar, updateGoogleCalendarEvent, deleteGoogleCalendarEvent, ensureAuthorized } from "@/types/google";
import { uploadAttachmentToGoogleDrive, getGoogleAccessToken } from "@/types/googleDriveUploader";
import { ChevronDown } from 'lucide-react';
import {
  ArrowLeft, Share2, Plus, MoreVertical, Pencil, Trash2,
  MessageCircle, Paperclip, Upload, X, User, Search,
  Settings, Filter, Users, Download, Eye, FileText, Menu,
  Calendar, Tag, CheckCircle, Clock, Palette, Move, CalendarIcon, ExternalLink,
  Image, File, FileImage,
  WifiOff, RotateCcw, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card as CardType, List, Board as BoardType } from '@/context/AppContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

// Theme configuration
type ThemeOption = 'default' | 'blue' | 'green' | 'red' | 'yellow' | 'pink' | 'orange' | 'teal';

const themeConfig: Record<ThemeOption, string> = {
  default: 'from-slate-900 via-purple-900 to-slate-900',
  blue: 'from-slate-900 via-blue-900 to-slate-900',
  green: 'from-slate-900 via-emerald-900 to-slate-900',
  red: 'from-slate-900 via-red-900 to-slate-900',
  yellow: 'from-slate-900 via-yellow-900 to-slate-900',
  pink: 'from-slate-900 via-pink-900 to-slate-900',
  orange: 'from-slate-900 via-orange-900 to-slate-900',
  teal: 'from-slate-900 via-teal-900 to-slate-900',
};

// Role-based permission types
type UserRole = 'admin' | 'pm' | 'instructor' | 'member';

// Helper function to check if user can edit board (admin, PM, instructor)
const canEditBoard = (userRole: UserRole | undefined, userEmail: string | undefined, boardUserEmail: string | undefined, boardMembers: { email: string; role?: 'member' | 'manager' | 'instructor' }[]): boolean => {
  // Admin can always edit
  if (userRole === 'admin') return true;

  // Instructor can edit
  if (userRole === 'instructor') return true;

  // PM (board creator) can edit
  if (userEmail && boardUserEmail && userEmail === boardUserEmail) return true;

  // Manager role in board members can edit
  const memberRecord = boardMembers.find(m => m.email === userEmail);
  if (memberRecord?.role === 'manager') return true;

  return false;
};

// Helper function to check if user can change roles (admin, PM, instructor)
const canChangeRoles = (userRole: UserRole | undefined, userEmail: string | undefined, boardUserEmail: string | undefined): boolean => {
  // Admin can always change roles
  if (userRole === 'admin') return true;

  // Instructor can change roles
  if (userRole === 'instructor') return true;

  // PM (board creator) can change roles
  if (userEmail && boardUserEmail && userEmail === boardUserEmail) return true;

  return false;
};

// Helper function to check if user can move cards - FIXED: Everyone can move cards/lists
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const canMoveCards = (_userEmail: string | undefined, _cardAssignedMembers: string[], _isPM: boolean, _isAdmin: boolean, _isInstructor: boolean): boolean => {
  // FIXED: Anyone can move cards or lists regardless of their role or assignment
  return true;
};

// FIXED: Main Board Component
const Board = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    boards,
    setBoards,
    updateBoard,
    addList,
    updateList,
    deleteList,
    reorderLists,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    updateBoardMembers,
    fetchBoards,
    fetchNotifications,
    normalizeLists,
  } = useApp();
  const initialAttachmentsLoadedRef = useRef(false);
  // Derived permission flags
  const isAdmin = user?.role === 'admin';
  const isInstructor = user?.role === 'instructor';
  const { isLoading: isAuthLoading } = useAuth();
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isSubmittingList, setIsSubmittingList] = useState(false);

  // FIXED: Loading timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDataLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (boards && boards.length > 0) {
      setIsDataLoading(false);
    }
  }, [boards]);

  const isPMOfBoard = (board: BoardType | null) => board?.userEmail === user?.email;
  const userCanEdit = (board: BoardType | null) => canEditBoard(user?.role as UserRole, user?.email, board?.userEmail, board?.members || []);
  const userCanChangeRoles = (board: BoardType | null) => canChangeRoles(user?.role as UserRole, user?.email, board?.userEmail);

  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Notification Service - Sends notifications to backend
  const sendNotification = async (
    recipientEmail: string,
    type: 'board_added' | 'board_removed' | 'card_assigned' | 'card_removed' | 'card_comment' | 'board_deadline' | 'board_updated',
    data: {
      boardTitle?: string;
      boardId?: string;
      cardTitle?: string;
      cardId?: string;
      commentText?: string;
      senderName?: string;
      message?: string;
      changeType?: string;
    }
  ) => {
    try {
      const token = localStorage.getItem('token');
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const senderName = currentUser.firstName && currentUser.lastName
        ? `${currentUser.firstName} ${currentUser.lastName}`
        : currentUser.email || 'System';

      // Construct professional message
      let notificationMessage = data.message || '';
      if (!notificationMessage) {
        if (type === 'board_added') {
          notificationMessage = `You have been added to the board "${data.boardTitle}" by ${senderName}.`;
        } else if (type === 'board_removed') {
          notificationMessage = `You have been removed from the board "${data.boardTitle}" by ${senderName}.`;
        } else if (type === 'card_assigned') {
          notificationMessage = `You have been assigned to the card "${data.cardTitle}" in board "${data.boardTitle}" by ${senderName}.`;
        } else if (type === 'card_removed') {
          notificationMessage = `You have been removed from the card "${data.cardTitle}" in board "${data.boardTitle}" by ${senderName}.`;
        } else if (type === 'card_comment') {
          notificationMessage = `${senderName} commented on "${data.cardTitle}": "${data.commentText}"`;
        } else if (type === 'board_deadline') {
          notificationMessage = `Board deadline has been set for "${data.boardTitle}".`;
        } else if (type === 'board_updated') {
          notificationMessage = `${senderName} updated the board "${data.boardTitle}": ${data.changeType}`;
        }
      }

      await axios.post(
        `${API_URL}/api/notifications`,
        {
          userEmail: recipientEmail,
          type,
          message: notificationMessage,
          boardTitle: data.boardTitle,
          boardId: data.boardId,
          cardId: data.cardId,
          addedBy: senderName
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const userEmail = localStorage.getItem('userEmail');
      if (userEmail && userEmail === recipientEmail) {
        try {
          await fetchNotifications(userEmail);
        } catch (err) {
          console.error('Error refreshing notifications:', err);
        }
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  };

  // Log activity function
  const logActivity = async (
    boardId: string,
    action: string,
    details: Record<string, any> = {}
  ) => {
    try {
      const token = localStorage.getItem('token');
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

      await axios.post(
        `${API_URL}/api/boards/${boardId}/activity`,
        {
          action,
          details,
          performedBy: currentUser.email || 'unknown',
          performedByName: currentUser.firstName && currentUser.lastName
            ? `${currentUser.firstName} ${currentUser.lastName}`
            : currentUser.email || 'System'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log(`✅ Activity logged: ${action}`);
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  };

  const scrollbarStyles = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      margin: 2px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(139, 92, 246, 0.4);
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(139, 92, 246, 0.6);
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb:active {
      background: rgba(139, 92, 246, 0.8);
    }
    
    .custom-scrollbar {
      scrollbar-width: thin;
      scrollbar-color: rgba(139, 92, 246, 0.4) rgba(255, 255, 255, 0.05);
    }
    
    .custom-scrollbar-vertical::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }
    
    .custom-scrollbar-vertical::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 2px;
      margin: 1px;
    }
    
    .custom-scrollbar-vertical::-webkit-scrollbar-thumb {
      background: rgba(139, 92, 246, 0.3);
      border-radius: 2px;
      border: 0.5px solid rgba(255, 255, 255, 0.1);
    }
    
    .custom-scrollbar-vertical::-webkit-scrollbar-thumb:hover {
      background: rgba(139, 92, 246, 0.5);
    }

    .custom-scrollbar-vertical::-webkit-scrollbar-thumb:active {
      background: rgba(139, 92, 246, 0.7);
    }
    
    .custom-scrollbar-vertical {
      scrollbar-width: thin;
      scrollbar-color: rgba(139, 92, 246, 0.3) rgba(255, 255, 255, 0.03);
    }

    .modal-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    
    .modal-scrollbar::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 2px;
    }
    
    .modal-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(139, 92, 246, 0.3);
      border-radius: 2px;
    }
    
    .modal-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(139, 92, 246, 0.5);
    }
    
    .hide-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    
    .hide-scrollbar::-webkit-scrollbar {
      display: none;
    }

    .glass {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .glass-strong {
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(15px);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    
    .gradient-primary {
      background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);
    }
    
    .gradient-secondary {
      background: linear-gradient(135deg, #EC4899 0%, #F59E0B 100%);
    }
    
    .hover-glow:hover {
      box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
    }

    .card-hover {
      transition: all 0.2s ease-in-out;
    }
    
    .card-hover:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
    }

    @media (max-width: 640px) {
      .mobile-tap-highlights {
        -webkit-tap-highlight-color: transparent;
      }
      
      .mobile-safe-padding {
        padding-left: max(1rem, env(safe-area-inset-left));
        padding-right: max(1rem, env(safe-area-inset-right));
      }
      
      .mobile-bottom-safe {
        padding-bottom: max(1rem, env(safe-area-inset-bottom));
      }

      .mobile-full-height {
        height: 100vh;
        height: 100dvh;
      }
    }

    .responsive-text {
      font-size: clamp(0.875rem, 2.5vw, 1rem);
    }

    .responsive-heading {
      font-size: clamp(1.25rem, 4vw, 1.5rem);
    }

    @media (max-width: 768px) {
      .touch-button {
        min-height: 40px;
        min-width: 40px;
      }
    }

    .smooth-transition {
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .drag-transition {
      transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    . {
      animation: slideIn 0.2s ease-out;
    }

    .glass-select {
      background: rgba(139, 92, 246, 0.15) !important;
      backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      border-radius: 0.375rem !important;
      color: #ffffff !important;
      padding: 0.375rem 2rem 0.375rem 0.75rem !important;
      transition: all 0.2s ease-in-out !important;
      appearance: none !important;
      font-size: 0.875rem !important;
    }

    .glass-select:focus {
      outline: none !important;
      box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.5) !important;
      border-color: rgba(139, 92, 246, 0.6) !important;
    }

    .glass-select option {
      background: rgba(30, 25, 50, 0.98) !important;
      color: #ffffff !important;
      padding: 0.5rem 0.75rem !important;
      border: none !important;
      margin: 0 !important;
      font-weight: 500 !important;
    }

    .glass-select option:hover {
      background: rgba(139, 92, 246, 0.3) !important;
      color: #ffffff !important;
    }

    .glass-select option:checked {
      background: rgba(139, 92, 246, 0.4) !important;
      color: #ffffff !important;
    }

    .compact-card {
      padding: 0.75rem;
      border-radius: 0.75rem;
    }

    .compact-list {
      padding: 0.75rem;
      border-radius: 0.75rem;
    }

    .compact-header {
      padding: 0.75rem 1rem;
    }

    .compact-button {
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
    }

    .drop-indicator {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%);
      border: 2px dashed rgba(139, 92, 246, 0.6);
      border-radius: 0.75rem;
      height: 4px;
      margin: 4px 0;
      animation: pulse 1.5s infinite;
    }

    .drop-zone-active {
      background: rgba(139, 92, 246, 0.1);
      border: 2px dashed rgba(139, 92, 246, 0.5);
      border-radius: 0.75rem;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    .drag-preview {
      transform: rotate(5deg) scale(1.02);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    }

    .list-drag-preview {
      transform: rotate(3deg) scale(1.01);
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.25);
    }
  `;

  // Interfaces
  interface KanbanListProps {
    list: List;
    editingListId: string | null;
    editingListTitle: string;
    onStartEdit: (id: string, title: string) => void;
    onSaveEdit: (id: string) => void;
    onCancelEdit: () => void;
    onDelete: (id: string) => void;
    onAddCard: (listId: string) => void;
    onCardClick: (card: CardType) => void;
    onDeleteCard: (cardId: string) => void;
    setEditingListTitle: (title: string) => void;
    onViewComments: (card: CardType, e: React.MouseEvent) => void;
    onDownloadAttachment: (attachmentName: string, e: React.MouseEvent) => void;
    onViewDescription: (card: CardType, e: React.MouseEvent) => void;
    onMoveAllCards: (sourceListId: string, targetListId: string) => void;
    availableLists: List[];
  }

  interface KanbanCardProps {
    card: CardType;
    onClick: () => void;
    onDelete: () => void;
    onViewComments: (e: React.MouseEvent) => void;
    onDownloadAttachment: (attachmentName: string, e: React.MouseEvent) => void;
    onViewDescription: (e: React.MouseEvent) => void;
  }

  interface EnhancedCardModalProps {
    card: CardType;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<CardType>) => void;
    onDelete: () => void;
    boardMembers: { email: string; name?: string; role?: 'member' | 'manager' | 'instructor' }[];
    lists?: List[];
    currentListId?: string;
    onMoveCard?: (targetListId: string) => void;
    board?: BoardType;
  }

  interface Attachment {
    id: string;
    name: string;
    size: string;
    type: string;
    url: string;  // Make it required
    drive?: boolean;
    driveId?: string;  // Add missing properties
    uploadedBy?: string;
    uploadedAt?: string;
  }

  interface ModalComment {
    id: string;
    user: string;
    userEmail?: string;
    text: string;
    timestamp: string;
  }

  interface ShareBoardModalProps {
    board: any;
    isOpen: boolean;
    onClose: () => void;
    onUpdateMembers: (members: { email: string; role: 'member' | 'manager' | 'instructor' }[]) => void;
    onRemoveMember: (memberEmail: string) => void;
    canChangeRoles: boolean; // NEW: Permission flag for role changes
  }

  interface CommentsModalProps {
    card: CardType;
    isOpen: boolean;
    onClose: () => void;
  }

  interface DescriptionModalProps {
    card: CardType;
    isOpen: boolean;
    onClose: () => void;
  }

  interface MobileMenuProps {
    onShare: () => void;
    onAddList: () => void;
    isAddingList: boolean;
  }

  // FIXED: Theme Selector Component
  const ThemeSelector = ({
    currentTheme,
    onThemeChange
  }: {
    currentTheme: ThemeOption;
    onThemeChange: (theme: ThemeOption) => void;
  }) => {
    const [isOpen, setIsOpen] = useState(false);

    const themes: { value: ThemeOption; label: string; color: string }[] = [
      { value: 'default', label: 'Purple', color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
      { value: 'blue', label: 'Blue', color: 'bg-gradient-to-r from-blue-500 to-cyan-500' },
      { value: 'green', label: 'Green', color: 'bg-gradient-to-r from-green-500 to-emerald-500' },
      { value: 'red', label: 'Red', color: 'bg-gradient-to-r from-red-500 to-rose-500' },
      { value: 'yellow', label: 'Yellow', color: 'bg-gradient-to-r from-yellow-400 to-orange-400' },
      { value: 'pink', label: 'Pink', color: 'bg-gradient-to-r from-pink-400 to-fuchsia-500' },
      { value: 'orange', label: 'Orange', color: 'bg-gradient-to-r from-orange-400 to-red-400' },
      { value: 'teal', label: 'Teal', color: 'bg-gradient-to-r from-teal-400 to-cyan-400' },
    ];

    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 glass hover-glow compact-button">
            <Palette className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="glass-strong border-white/10 w-44" align="end">
          <div className="px-3 py-1.5 text-xs font-semibold text-purple-300 border-b border-white/10">
            Board Theme
          </div>
          {themes.map((theme) => (
            <DropdownMenuItem
              key={theme.value}
              onClick={() => onThemeChange(theme.value)}
              className={`flex items-center gap-2 py-1.5 cursor-pointer ${currentTheme === theme.value ? 'bg-white/10' : ''
                }`}
            >
              <div className={`w-5 h-5 rounded-full ${theme.color}`} />
              <span className="text-sm">{theme.label}</span>
              {currentTheme === theme.value && (
                <CheckCircle className="w-3.5 h-3.5 ml-auto text-purple-400" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const handleSaveCardWithAttachments = async (
    cardId: string,
    listId: string,
    updates: Partial<CardType>
  ) => {
    if (!boardId || !board) return;

    try {
      await updateCard(boardId, listId, cardId, updates);

      // Sync to Google Calendar if needed
      const { title, description, dueDate, assignedMembers, googleEventId } = updates;

      if (dueDate && assignedMembers && assignedMembers.length > 0) {
        const parsedDate = new Date(dueDate as any);

        if (googleEventId) {
          await updateGoogleCalendarEvent(
            googleEventId,
            { title: title ?? "", description, dueDate: parsedDate, assignedMembers }
          );
        } else {
          const newEventId = await addEventToGoogleCalendar({
            title: title ?? "",
            description,
            dueDate: parsedDate,
            assignedMembers,
          });

          if (newEventId) {
            await updateCard(boardId, listId, cardId, { googleEventId: newEventId });
          }
        }
      }

      toast.success("Card updated successfully");
    } catch (err) {
      console.error("❌ Failed to update card:", err);
      toast.error("Failed to save card changes");
    }
  };

  // NEW: Attachment Thumbnail Viewer Component
  const AttachmentThumbnailViewer = ({
    attachment,
    onClose
  }: {
    attachment: Attachment;
    onClose: () => void;
  }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    // FIXED: Extract Drive ID from various URL formats
    const getDriveId = (url: string): string | null => {
      if (!url) return null;
      const patterns = [
        /\/d\/([a-zA-Z0-9_-]+)/,
        /id=([a-zA-Z0-9_-]+)/,
        /^([a-zA-Z0-9_-]{25,})$/
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    };

    const driveId = attachment.id || getDriveId(attachment.url);

    const getFileIcon = (type: string, name: string) => {
      if (type?.startsWith('image/')) return <FileImage className="w-6 h-6" />;
      if (type === 'application/pdf' || name?.toLowerCase().endsWith('.pdf')) {
        return (
          <div className="relative">
            <FileText className="w-6 h-6" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-[6px] font-bold text-white">PDF</span>
            </div>
          </div>
        );
      }
      if (type?.includes('word') || name?.toLowerCase().match(/\.(doc|docx)$/)) {
        return <FileText className="w-6 h-6 text-blue-500" />;
      }
      if (type?.includes('excel') || name?.toLowerCase().match(/\.(xls|xlsx)$/)) {
        return <File className="w-6 h-6 text-green-500" />;
      }
      return <File className="w-6 h-6" />;
    };

    const renderPreview = () => {
      const fileType = attachment.type?.toLowerCase() || '';
      const fileName = attachment.name?.toLowerCase() || '';

      // Image preview
      if (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName)) {
        const imageUrl = driveId
          ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w2000`
          : attachment.url;

        return (
          <div className="w-full h-full flex items-center justify-center p-2 sm:p-6 bg-checkerboard">
            <div className="relative max-w-full max-h-full shadow-2xl rounded-lg overflow-hidden group">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/20 backdrop-blur-sm z-10">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              )}
              <img
                src={imageUrl}
                alt={attachment.name}
                className="max-w-full max-h-full object-contain"
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setError(true);
                }}
              />
            </div>
          </div>
        );
      }

      // PDF/Document preview
      if (fileType === 'application/pdf' || fileName.endsWith('.pdf') || /\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(fileName)) {
        const docUrl = driveId
          ? `https://drive.google.com/file/d/${driveId}/preview`
          : fileName.endsWith('.pdf')
            ? attachment.url
            : `https://docs.google.com/viewer?url=${encodeURIComponent(attachment.url)}&embedded=true`;

        return (
          <div className="w-full h-full relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/20 backdrop-blur-sm z-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            )}
            <iframe
              src={docUrl}
              className="w-full h-full border-0 bg-white"
              title={attachment.name}
              onLoad={() => setIsLoading(false)}
              allow="autoplay"
            />
          </div>
        );
      }

      // Generic file fallback
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center mb-8 shadow-inner border border-white/5 group hover:scale-105 transition-transform duration-300">
            {getFileIcon(attachment.type, attachment.name)}
          </div>
          <h3 className="text-2xl font-bold mb-3 text-white tracking-tight">{attachment.name}</h3>
          <p className="text-gray-400 mb-8 font-medium bg-white/5 px-4 py-1.5 rounded-full border border-white/5">{attachment.size} • {attachment.type}</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={driveId ? `https://drive.google.com/file/d/${driveId}/view` : attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all font-bold flex items-center gap-2 shadow-lg hover:shadow-blue-500/20"
            >
              <ExternalLink className="w-5 h-5" />
              Open in Google Drive
            </a>
            <a
              href={driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : attachment.url}
              download={attachment.name}
              className="px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-700 transition-all font-bold flex items-center gap-2 shadow-lg"
            >
              <Download className="w-5 h-5" />
              Download
            </a>
          </div>
        </div>
      );
    };

    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[999] flex items-center justify-center p-2 sm:p-4">
        <div className="bg-gray-900 rounded-xl w-full max-w-7xl h-[90vh] sm:h-[95vh] overflow-hidden flex flex-col shadow-2xl border border-white/10">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-purple-600/90 to-blue-600/90 text-white border-b border-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner">
                {getFileIcon(attachment.type, attachment.name)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-lg sm:text-xl truncate tracking-tight">{attachment.name}</h3>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px] sm:text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">
                    {attachment.size}
                  </span>
                  <span className="text-[10px] sm:text-xs text-white/80 truncate font-medium">
                    {attachment.type}
                  </span>
                  {attachment.drive && (
                    <span className="text-[10px] sm:text-xs bg-green-500/30 text-green-300 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      Google Drive
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : attachment.url}
                download={attachment.name}
                className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all group"
                title="Download"
              >
                <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </a>
              <button
                onClick={onClose}
                className="h-10 w-10 rounded-lg bg-white/20 hover:bg-red-500/80 flex items-center justify-center transition-all"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Preview Content */}
          <div className="flex-1 bg-gray-950 relative overflow-hidden">
            {error ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6 shadow-xl border border-red-500/30">
                  <X className="w-12 h-12 text-red-400" />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-white">Preview Unavailable</h3>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">This file format cannot be previewed directly. Please download it or open it in Google Drive to view the contents.</p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <a
                    href={driveId ? `https://drive.google.com/file/d/${driveId}/view` : attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all font-bold flex items-center gap-2 shadow-lg hover:shadow-blue-500/20"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Open in Google Drive
                  </a>
                  <a
                    href={driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : attachment.url}
                    download={attachment.name}
                    className="px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-700 transition-all font-bold flex items-center gap-2 shadow-lg"
                  >
                    <Download className="w-5 h-5" />
                    Download File
                  </a>
                </div>
              </div>
            ) : (
              renderPreview()
            )}
          </div>
        </div>
      </div>
    );
  };

  // Comments Modal Component
  const CommentsModal = ({ card, isOpen, onClose }: CommentsModalProps) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 mobile-safe-padding mobile-bottom-safe">
        <div className={`glass-strong rounded-xl w-full ${isMobile ? 'max-w-full h-full' : 'max-w-md max-h-[80vh]'} overflow-hidden flex flex-col`}>
          <div className="flex items-center justify-between p-4 border-b border-white/10 compact-header">
            <div>
              <h2 className="text-lg font-bold">Comments</h2>
              <p className="text-xs text-purple-300 mt-1 line-clamp-1">{card.title}</p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg glass hover-glow flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto modal-scrollbar p-4">
            {card.comments.length > 0 ? (
              <div className="space-y-3">
                {card.comments.map((comment, index) => (
                  <div key={index} className="glass rounded-lg p-3 compact-card">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="gradient-secondary text-xs">
                          {comment.user[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{comment.user}</p>
                        <p className="text-xs text-purple-300">
                          {comment.timestamp instanceof Date
                            ? comment.timestamp.toLocaleString()
                            : new Date(comment.timestamp).toLocaleString()
                          }
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-purple-100 break-words">{comment.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <MessageCircle className="w-8 h-8 text-purple-300 mx-auto mb-2" />
                <p className="text-purple-300 text-sm">No comments yet</p>
                <p className="text-xs text-purple-400 mt-1">Be the first to add a comment!</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10">
            <Button onClick={onClose} className="w-full glass hover-glow compact-button">
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Description Modal Component
  const DescriptionModal = ({ card, isOpen, onClose }: DescriptionModalProps) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 mobile-safe-padding mobile-bottom-safe">
        <div className={`glass-strong rounded-xl w-full ${isMobile ? 'max-w-full h-full' : 'max-w-md max-h-[80vh]'} overflow-hidden flex flex-col`}>
          <div className="flex items-center justify-between p-4 border-b border-white/10 compact-header">
            <div>
              <h2 className="text-lg font-bold">Description</h2>
              <p className="text-xs text-purple-300 mt-1 line-clamp-1">{card.title}</p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg glass hover-glow flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto modal-scrollbar p-4">
            {card.description ? (
              <div className="glass rounded-lg p-3 compact-card">
                <p className="text-sm text-purple-100 whitespace-pre-wrap">{card.description}</p>
              </div>
            ) : (
              <div className="text-center py-6">
                <FileText className="w-8 h-8 text-purple-300 mx-auto mb-2" />
                <p className="text-purple-300 text-sm">No description yet</p>
                <p className="text-xs text-purple-400 mt-1">Add a description to provide more details</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10">
            <Button onClick={onClose} className="w-full glass hover-glow compact-button">
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // FIXED: ShareBoardModal Component - Role changes restricted by permission
  const EnhancedShareBoardModal = ({
    board,
    isOpen,
    onClose,
    onUpdateMembers,
    onRemoveMember,
    canChangeRoles: hasRoleChangePermission // NEW: Permission prop
  }: ShareBoardModalProps) => {
    const [email, setEmail] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const [pendingMembers, setPendingMembers] = useState<{ email: string; role: 'member' | 'manager' | 'instructor' }[]>(board.members as { email: string; role: 'member' | 'manager' | 'instructor' }[]);
    const [pendingChanges, setPendingChanges] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<{ email: string; role: 'member' | 'manager' | 'instructor' } | null>(null);
    const [isSavingMembers, setIsSavingMembers] = useState(false);

    // User autocomplete state
    const [allUsers, setAllUsers] = useState<Array<{ email: string; firstName: string; lastName: string }>>([]);
    const [filteredUsers, setFilteredUsers] = useState<Array<{ email: string; firstName: string; lastName: string }>>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [newMemberRole, setNewMemberRole] = useState<'member' | 'manager' | 'instructor'>('member'); // FIXED: Default to 'member', not 'manager'

    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Fetch all users for autocomplete
    useEffect(() => {
      const fetchUsers = async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`${API_URL}/api/users`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (!res.ok) throw new Error('Failed to fetch users');
          const data = await res.json();
          setAllUsers(data);
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      };

      if (isOpen) {
        fetchUsers();
      }
    }, [isOpen]);

    // Initialize pending members when modal opens - ALWAYS include PM
    useEffect(() => {
      if (isOpen) {
        const pmEmail = (board as any).userEmail;
        let membersWithPM = [...board.members];

        // Ensure PM is always in the list
        if (pmEmail && !membersWithPM.find(m => m.email === pmEmail)) {
          membersWithPM.unshift({ email: pmEmail, role: 'manager' as const });
        }

        setPendingMembers(membersWithPM);
        setPendingChanges(false);
        setMemberToRemove(null);
        setNewMemberRole('member'); // Reset role to 'member' on open
      }
    }, [isOpen, board.members]);

    // Filter users based on email or name input
    useEffect(() => {
      if (email.trim().length > 0) {
        const searchTerm = email.toLowerCase();
        const filtered = allUsers.filter(user => {
          const matchEmail = user.email.toLowerCase().includes(searchTerm);
          const matchFirstName = user.firstName?.toLowerCase().includes(searchTerm);
          const matchLastName = user.lastName?.toLowerCase().includes(searchTerm);
          const matchFullName = `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm);

          return (matchEmail || matchFirstName || matchLastName || matchFullName) &&
            !pendingMembers.some(m => m.email === user.email);
        });
        setFilteredUsers(filtered);
        setShowSuggestions(filtered.length > 0);
      } else {
        setFilteredUsers([]);
        setShowSuggestions(false);
      }
    }, [email, allUsers, pendingMembers]);

    const handleSelectUser = (userEmail: string) => {
      setEmail(userEmail);
      setShowSuggestions(false);
    };

    const handleAddMember = (e: React.FormEvent) => {
      e.preventDefault();
      const emailTrimmed = email.trim();

      if (!emailTrimmed) {
        toast.error('Please enter an email address');
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        toast.error('Please enter a valid email address');
        return;
      }

      if (pendingMembers.some(m => m.email === emailTrimmed)) {
        toast.error('Member already exists');
        return;
      }

      // FIXED: Use selected role, not hardcoded 'manager'
      const newMember = {
        email: emailTrimmed,
        role: newMemberRole
      };

      setPendingMembers([...pendingMembers, newMember]);
      setEmail('');
      setNewMemberRole('member'); // Reset to 'member' after adding
      setPendingChanges(true);
      setShowSuggestions(false);
      toast.success('Member added to pending changes');
    };

    const handleRemovePendingMember = (member: { email: string; role: 'member' | 'manager' | 'instructor' }) => {
      setMemberToRemove(member);
    };

    const confirmRemoveMember = () => {
      if (memberToRemove) {
        const updatedMembers = pendingMembers.filter(m => m.email !== memberToRemove.email);
        setPendingMembers(updatedMembers);
        setPendingChanges(true);
        setMemberToRemove(null);
        toast.success('Member removed from pending changes');
      }
    };

    const handleSaveChanges = async () => {
      if (isSavingMembers) return;
      setIsSavingMembers(true);
      
      try {
        // Find newly added members
        const originalMemberEmails = board.members.map((m: any) => m.email);

        // Ensure PM is considered an original member so they don't get notified
        const pmEmail = (board as any).userEmail;
        if (pmEmail && !originalMemberEmails.includes(pmEmail)) {
          originalMemberEmails.push(pmEmail);
        }

        const newlyAddedMembers = pendingMembers.filter(
          member => !originalMemberEmails.includes(member.email)
        );

        // Find removed members
        const removedMembers = originalMemberEmails.filter(
          email => !pendingMembers.some(m => m.email === email) && email !== pmEmail
        );

        const senderFullName = user?.firstName ? `${user.firstName} ${user.lastName}` : 'Board Admin';

        // Send notifications to newly added members
        for (const member of newlyAddedMembers) {
          // Don't notify the person making the change
          if (user?.email && member.email === user.email) continue;

          await sendNotification(
            member.email,
            'board_added',
            {
              boardTitle: board.title,
              boardId: board.id,
              senderName: senderFullName
            }
          );
        }

        // Send notifications to removed members
        for (const memberEmail of removedMembers) {
          // Don't notify the person making the change (if they removed themselves)
          if (user?.email && memberEmail === user.email) continue;

          await sendNotification(
            memberEmail,
            'board_removed',
            {
              boardTitle: board.title,
              boardId: board.id,
              senderName: senderFullName,
              message: `You have been removed from the board "${board.title}" by ${senderFullName}.`
            }
          );
        }

        // Log activity
        if (newlyAddedMembers.length > 0 || removedMembers.length > 0) {
          await logActivity(board.id, 'members_updated', {
            addedMembers: newlyAddedMembers.map(m => m.email),
            removedMembers: removedMembers,
            totalMembers: pendingMembers.length
          });
        }

        await onUpdateMembers(pendingMembers);
        setPendingChanges(false);
        if (removedMembers.length > 0) {
          toast.success('Board members updated and removed members notified');
        } else {
          toast.success('Board members updated successfully');
        }
        onClose();
      } catch (error) {
        console.error('Failed to save members:', error);
        toast.error('Failed to save members. Please try again.');
      } finally {
        setIsSavingMembers(false);
      }
    };

    const handleClose = () => {
      if (pendingChanges) {
        if (window.confirm('You have unsaved changes. Are you sure you want to discard them?')) {
          onClose();
        }
      } else {
        onClose();
      }
    };

    if (!isOpen) return null;

    return (
      <>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 mobile-safe-padding mobile-bottom-safe">
          <div className={`glass-strong rounded-xl w-full ${isMobile ? 'max-w-full h-full' : 'max-w-md'} overflow-hidden flex flex-col`}>
            <div className="flex items-center justify-between p-4 border-b border-white/10 compact-header">
              <div>
                <h2 className="text-lg font-bold">Share Board</h2>
                {pendingChanges && (
                  <p className="text-xs text-yellow-400 mt-1">You have unsaved changes</p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-lg glass hover-glow flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto modal-scrollbar p-4 space-y-4">
              <form onSubmit={handleAddMember} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5">Add Team Member</label>
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <Input
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => email.trim().length > 0 && setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Enter email address or name"
                        className="glass h-9 text-sm w-full"
                        autoComplete="off"
                      />
                      {/* User suggestions dropdown */}
                      {showSuggestions && filteredUsers.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-slate-900/95 backdrop-blur-sm rounded-lg border border-purple-500/30 shadow-xl max-h-40 overflow-y-auto modal-scrollbar">
                          {filteredUsers.map((user) => (
                            <button
                              key={user.email}
                              type="button"
                              onClick={() => handleSelectUser(user.email)}
                              className="w-full text-left px-3 py-2 hover:bg-purple-500/20 transition-colors flex items-center gap-2 border-b border-white/5 last:border-0"
                            >
                              <Avatar className="w-6 h-6">
                                <AvatarFallback className="bg-purple-500/30 text-white text-xs font-medium">
                                  {user.email[0].toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-white truncate">
                                  {user.firstName} {user.lastName}
                                </p>
                                <p className="text-xs text-purple-300/80 truncate">{user.email}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* FIXED: Role selection for new member - Only show if user has permission */}
                    {hasRoleChangePermission && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-purple-300">Role:</label>
                        <select
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value as 'member' | 'manager' | 'instructor')}
                          className="glass-select h-8 text-xs"
                        >
                          <option value="member">Team Member</option>
                          <option value="manager">Manager</option>
                          <option value="instructor">Instructor</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                <Button type="submit" className="gradient-primary w-full hover-glow h-9 text-sm">
                  <User className="w-3.5 h-3.5 mr-1.5" />
                  Add Member
                </Button>
              </form>

              <div>
                <h3 className="font-semibold text-sm mb-2">Board Members ({pendingMembers.length})</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto modal-scrollbar">
                  {pendingMembers.map((member) => {
                    const isProjectManager = member.email === board.userEmail;
                    const isOriginalPM = board.userEmail === member.email;
                    const roleLabel = isProjectManager || isOriginalPM
                      ? 'Project Manager'
                      : member.role === 'instructor' ? 'Instructor' : member.role === 'manager' ? 'Manager' : 'Team Member';

                    return (
                      <div
                        key={member.email}
                        className={`flex items-center justify-between p-2 rounded-lg compact-card ${isProjectManager || isOriginalPM
                          ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30'
                          : 'glass'
                          }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Avatar className="w-6 h-6 flex-shrink-0">
                            <AvatarFallback className={`text-xs ${isProjectManager || isOriginalPM
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                              : 'gradient-secondary'
                              }`}>
                              {member.email[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{member.email}</p>
                            <p className={`text-xs ${isProjectManager || isOriginalPM ? 'text-amber-400 font-semibold' : 'text-purple-300'
                              }`}>{roleLabel}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!isProjectManager && !isOriginalPM && (
                            <>
                              {/* Role change dropdown - Only show if user has permission */}
                              {hasRoleChangePermission ? (
                                <select
                                  value={member.role}
                                  onChange={(e) => {
                                    const updatedMembers = pendingMembers.map(m =>
                                      m.email === member.email
                                        ? { ...m, role: e.target.value as 'member' | 'manager' | 'instructor' }
                                        : m
                                    );
                                    setPendingMembers(updatedMembers);
                                    setPendingChanges(true);
                                  }}
                                  className="glass-select h-7 text-xs w-28"
                                >
                                  <option value="member">Member</option>
                                  <option value="manager">Manager</option>
                                  <option value="instructor">Instructor</option>
                                </select>
                              ) : (
                                <span className="text-xs text-purple-300 px-2">
                                  {member.role === 'manager' ? 'Manager' : 'Member'}
                                </span>
                              )}

                              {/* Remove button - Only show if user has permission */}
                              {hasRoleChangePermission && (
                                <button
                                  onClick={() => handleRemovePendingMember(member)}
                                  className="h-6 w-6 rounded-lg glass hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-all border border-white/20"
                                  title="Remove member"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-between p-4 border-t border-white/10 gap-2">
              <Button
                onClick={handleClose}
                variant="ghost"
                className="glass hover-glow flex-1 h-9 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveChanges}
                className="gradient-primary hover-glow flex-1 h-9 text-sm"
                disabled={!pendingChanges || isSavingMembers}
              >
                {isSavingMembers ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>

        {/* Remove Member Confirmation Dialog */}
        {memberToRemove && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="glass-strong rounded-xl p-4 max-w-md w-full mx-4">
              <h3 className="text-base font-bold mb-2">Remove Member</h3>
              <p className="text-purple-200 text-sm mb-4">
                Are you sure you want to remove <span className="font-semibold text-white">{memberToRemove.email}</span> from this board? They will lose access to all board content.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setMemberToRemove(null)}
                  variant="ghost"
                  className="flex-1 glass hover-glow h-9 text-sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmRemoveMember}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white h-9 text-sm"
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // Enhanced Card Modal Component with FIXED issues
  const EnhancedCardModal = ({
    card,
    isOpen,
    onClose,
    onSave,
    onDelete,
    boardMembers,
    lists = [],
    currentListId,
    onMoveCard,
    board
  }: EnhancedCardModalProps) => {
    const [isSavingCard, setIsSavingCard] = useState(false);
    const [title, setTitle] = useState(card.title);
    const [description, setDescription] = useState(card.description || '');
    const [labels, setLabels] = useState(card.labels);
    const [newLabel, setNewLabel] = useState('');
    const [assignedMembers, setAssignedMembers] = useState(card.assignedMembers);
    const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);
    const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
    const [cardDueDate, setCardDueDate] = useState<string>(() => {
      if (card.dueDate) {
        const date = new Date(card.dueDate);
        // Convert to local datetime string for input
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      }
      return '';
    });


    useEffect(() => {
      // Prevent body scroll when preview is open
      if (selectedAttachment) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = 'unset';
      }

      return () => {
        document.body.style.overflow = 'unset';
      };
    }, [selectedAttachment]);

    const [cardGoogleEventId, setCardGoogleEventId] = useState<string>(
      (card as any).googleEventId || ''
    );

    // ✅ FIXED: Sync state when card or modal state changes
    useEffect(() => {
      if (isOpen) {
        setTitle(card.title);
        setDescription(card.description || '');
        setLabels(card.labels);
        setAssignedMembers(card.assignedMembers);
        setCardGoogleEventId((card as any).googleEventId || '');
        setMemberDeadlines((card as any).memberDeadlines || {});
        setMemberEventIds((card as any).memberEventIds || {});

        if (card.dueDate) {
          const date = new Date(card.dueDate);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          setCardDueDate(`${year}-${month}-${day}T${hours}:${minutes}`);
        } else {
          setCardDueDate('');
        }
      }
    }, [isOpen, card]);

    const [memberDeadlines, setMemberDeadlines] = useState<Record<string, string>>(
      (card as any).memberDeadlines || {}
    );




    // FIXED: Add a ref to track initial comments for comparison
    const initialCommentsRef = useRef<ModalComment[]>([]);
    const [comments, setComments] = useState<ModalComment[]>([]);

    // FIXED: Initialize comments properly
    useEffect(() => {
      if (isOpen) {
        const modalComments = card.comments.map(comment => ({
          id: Date.now().toString() + Math.random(),
          user: comment.user,
          userEmail: (comment as any).userEmail || '',
          text: comment.text,
          timestamp: comment.timestamp instanceof Date
            ? comment.timestamp.toISOString()
            : comment.timestamp
        }));
        setComments(modalComments);
        initialCommentsRef.current = [...modalComments]; // Store initial state
      }
    }, [isOpen, card.comments]);

    const [newComment, setNewComment] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchMember, setSearchMember] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const [selectedListId, setSelectedListId] = useState(currentListId || '');
    const [memberEventIds, setMemberEventIds] = useState<Record<string, string>>(
      (card as any).memberEventIds || {}
    );

    // FIXED: Upload state
    const [uploadCancelController, setUploadCancelController] = useState<AbortController | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadToastId, setUploadToastId] = useState<string | number | null>(null);

    // FIXED: Enhanced cancel upload function
    const cancelUpload = () => {
      if (uploadCancelController) {
        uploadCancelController.abort();
        setIsUploading(false);
        setUploadCancelController(null);
        setUploadProgress(0);

        // Clear toast
        if (uploadToastId) {
          toast.dismiss(uploadToastId);
        }

        toast.info("Upload cancelled. Changes have been saved.");

        // Ensure any partially uploaded files are saved
        if (attachments.length > 0 && card.id !== 'temp-new-card') {
          // Save current attachments state
          const updatedCard = {
            ...card,
            attachments: attachments.map(att => att.name)
          };
          onSave({ attachments: updatedCard.attachments });
        }
      }
    };

    // FIXED: Sync attachments from card data when modal opens or card changes
    useEffect(() => {
      if (isOpen) {
        // Initialize attachments only once when modal opens
        const initialAttachments = card.attachments.map((attachment) => {
          // If attachment is already an object with proper structure, use it
          if (typeof attachment === 'object' && attachment !== null && !Array.isArray(attachment)) {
            return {
              id: attachment.id || `att-${crypto.randomUUID()}`,
              name: attachment.name || 'Unknown',
              size: attachment.size || 'Unknown',
              type: attachment.type || 'file',
              url: attachment.url || '',
              drive: attachment.drive || false
            };
          }

          // If attachment is a string (legacy format), convert it
          return {
            id: `att-${crypto.randomUUID()}`,
            name: String(attachment),
            size: 'Unknown',
            type: 'file',
            url: '',
            drive: false
          };
        });

        setAttachments(initialAttachments);
      } else {
        // Clear attachments when modal closes
        setAttachments([]);
      }
    }, [isOpen]); // Only depend on isOpen, not card.attachments

    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // FIXED: Enhanced handleViewAttachment function
    const handleViewAttachment = (attachment: Attachment) => {
      if (!attachment) {
        toast.error('Attachment not found');
        return;
      }

      // Helper to extract drive ID
      const getDriveId = (url: string): string | null => {
        if (!url) return null;
        const patterns = [
          /\/d\/([a-zA-Z0-9_-]+)/,
          /id=([a-zA-Z0-9_-]+)/,
          /^([a-zA-Z0-9_-]{25,})$/
        ];
        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match) return match[1];
        }
        return null;
      };

      const driveId = attachment.id || getDriveId(attachment.url);

      // Check if we have a valid URL or can construct one
      if (attachment.url && (attachment.url.startsWith('http') || attachment.url.startsWith('blob:'))) {
        // If URL looks like it might not work for preview, fix it
        if (driveId && attachment.type?.startsWith('image/')) {
          // Use thumbnail URL for images
          setSelectedAttachment({
            ...attachment,
            url: `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`
          });
        } else if (driveId) {
          // Use preview URL for other files
          setSelectedAttachment({
            ...attachment,
            url: `https://drive.google.com/file/d/${driveId}/preview`
          });
        } else {
          setSelectedAttachment(attachment);
        }
      } else if (driveId) {
        // Construct URL from drive ID
        const url = attachment.type?.startsWith('image/')
          ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`
          : `https://drive.google.com/file/d/${driveId}/preview`;
        setSelectedAttachment({ ...attachment, url });
      } else {
        // Fallback - try to open in viewer anyway
        setSelectedAttachment(attachment);
        toast.info('Preview may not be available for this file');
      }

      // Show the preview modal
      setShowAttachmentPreview(true);
    };


    const handleAddLabel = () => {
      if (newLabel.trim() && !labels.includes(newLabel.trim())) {
        setLabels([...labels, newLabel.trim()]);
        setNewLabel('');
      }
    };

    const handleRemoveLabel = (labelToRemove: string) => {
      setLabels(labels.filter(label => label !== labelToRemove));
    };

    const handleToggleMember = async (member: string) => {
      if (assignedMembers.includes(member)) {
        setAssignedMembers(assignedMembers.filter(m => m !== member));
        // Remove deadline when member is removed
        const updatedDeadlines = { ...memberDeadlines };
        delete updatedDeadlines[member];
        setMemberDeadlines(updatedDeadlines);
      } else {
        setAssignedMembers([...assignedMembers, member]);

        // Removed: Automatic notification during toggle - handled on save in backend
        // toast.success(`${member} has been notified about their assignment`);
      }
    };

    const handleMemberDeadlineChange = async (memberEmail: string, date: string) => {
      setMemberDeadlines(prev => ({ ...prev, [memberEmail]: date }));

      if (!date) return;

      try {
        const existingEventId = memberEventIds[memberEmail];

        // Convert to ISO string for Google Calendar
        const isoDate = new Date(date).toISOString();

        if (existingEventId) {
          // Update existing event
          await updateGoogleCalendarEvent(existingEventId, {
            title: title,
            description: `Deadline for ${memberEmail}`,
            dueDate: isoDate,
            assignedMembers: [memberEmail],
          });
        } else {
          // Create new event
          const newEventId = await addEventToGoogleCalendar({
            title,
            description: `Deadline for ${memberEmail}`,
            dueDate: isoDate,
            assignedMembers: [memberEmail],
          });

          if (newEventId) {
            setMemberEventIds(prev => ({ ...prev, [memberEmail]: newEventId }));
          }
        }

        toast.success(`Deadline synced to Google Calendar for ${memberEmail}`);
      } catch (err: any) {
        console.error(err);
        const errorMsg = typeof err === 'string' ? err : err?.error || err?.message || '';
        const toastId = `google-sync-cancel-${Date.now()}`;

        if (errorMsg === 'popup_closed' || errorMsg.includes('popup_closed')) {
          toast.error(`Google sync cancelled. Deadline for ${memberEmail} saved locally but not synced to Calendar.`, {
            duration: 6000,
            id: toastId
          });
        } else {
          toast.error(`Failed to sync deadline for ${memberEmail}`);
        }
      }
    };

    // FIXED: Enhanced handleAddComment function - uses API_URL and proper board ID resolution
    const handleAddComment = async () => {
      if (!newComment.trim()) return;

      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      const currentUserName = storedUser?.firstName && storedUser?.lastName
        ? `${storedUser.firstName} ${storedUser.lastName}`
        : storedUser?.email || "Unknown User";
      const currentUserEmail = storedUser?.email || "";

      const comment: ModalComment = {
        id: Date.now().toString() + Math.random(),
        user: currentUserName,
        userEmail: currentUserEmail,
        text: newComment.trim(),
        timestamp: new Date().toISOString(),
      };

      // Add to local state immediately
      const updatedComments = [...comments, comment];
      setComments(updatedComments);
      setNewComment("");

      // Get proper board and card IDs
      const boardId = board?.id || board?._id;
      const cardId = card.id || card._id;
      const listId = currentListId;

      // Save to backend
      try {
        if (cardId && cardId !== 'temp-new-card' && boardId && listId) {
          const token = localStorage.getItem('token');
          const currentUser = JSON.parse(localStorage.getItem("user") || "null");
          const userName = currentUser?.firstName && currentUser?.lastName
            ? `${currentUser.firstName} ${currentUser.lastName}`
            : currentUser?.email || "Unknown User";

          const response = await axios.post(
            `${API_URL}/api/boards/${boardId}/lists/${listId}/cards/${cardId}/comments`,
            {
              user: userName,
              text: comment.text,
              timestamp: new Date().toISOString()
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          // FIXED: Backend returns board object with status 201, not {success: true}
          if (response.status === 201 || response.status === 200) {
            // Update the global state with the fresh board from the backend response immediately
            // This ensures the comment is saved in context and persists when the modal is closed and reopened
            const boardData = response.data as any;
            if (boardData && boardData._id) {
              setBoards(prevBoards => prevBoards.map(b => {
                if (b.id !== boardId && b._id !== boardId) return b;
                return {
                  ...boardData,
                  id: boardData._id || boardData.id,
                  lists: normalizeLists(boardData.lists)
                };
              }));
            }

            // Notify assigned members
            for (const member of assignedMembers) {
              if (member !== currentUserEmail) {
                await sendNotification(
                  member,
                  'card_comment',
                  {
                    boardTitle: board?.title,
                    cardTitle: title,
                    cardId: cardId,
                    commentText: comment.text,
                    senderName: currentUserName,
                  }
                );
              }
            }

            toast.success("Comment posted successfully!");
          } else {
            toast.error("Failed to save comment");
            setComments(comments.filter(c => c.id !== comment.id));
          }
        } else {
          console.warn('Cannot save comment: missing boardId, listId, or cardId', { boardId, listId, cardId });
          toast.info("Comment added locally - will be saved when card is created");
        }
      } catch (error: any) {
        console.error('Failed to save comment:', error);
        const errorMessage = error.response?.data?.message || error.message || "Failed to save comment. Please try again.";
        toast.error(errorMessage);
        setComments(comments.filter(c => c.id !== comment.id));
      }
    };

    const handleSave = async () => {
      if (!title.trim()) {
        toast.error('Card title is required');
        return;
      }
      
      if (isSavingCard) return;
      setIsSavingCard(true);

      try {
        // Find removed members for notification
        const removedAssignedMembers = card.assignedMembers.filter(
          m => !assignedMembers.includes(m)
        );
        
        // Find newly assigned members for toast
        const newlyAssignedMembers = assignedMembers.filter(
          m => !card.assignedMembers.includes(m)
        );

        // Prepare updates including all current state
        const updates = {
          title,
          description,
          labels,
          assignedMembers,
          // ✅ FIXED: Convert local datetime-local string to proper ISO string with UTC
          dueDate: cardDueDate ? new Date(cardDueDate).toISOString() : '',
          googleEventId: cardGoogleEventId || undefined,
          memberDeadlines,
          memberEventIds,
          comments: comments.map(comment => ({
            user: comment.user,
            text: comment.text,
            timestamp: new Date(comment.timestamp)
          })),
          // ✅ FIXED: Include ALL attachments for both new and existing cards
          attachments: attachments.map(att => ({
            id: att.id,
            name: att.name,
            url: att.url,
            size: att.size,
            type: att.type,
            drive: att.drive || false,
          })),
        };

        // Save card - this should trigger a re-render with updated card data
        await onSave(updates);

        if (newlyAssignedMembers.length > 0) {
          toast.success("Assigned members notified about their assignment");
        }

        // Notify removed members
        if (removedAssignedMembers.length > 0 && board) {
          toast.success("Removed members notified about being unassigned from card");
          const storedUser = JSON.parse(localStorage.getItem("user") || "null");
          const senderName = storedUser?.firstName && storedUser?.lastName
            ? `${storedUser.firstName} ${storedUser.lastName}`
            : storedUser?.email || "Unknown User";

          for (const member of removedAssignedMembers) {
            // Don't notify the person making the change
            if (member !== storedUser?.email) {
              await sendNotification(
                member,
                'card_removed',
                {
                  boardTitle: board.title,
                  boardId: board.id,
                  cardTitle: title,
                  cardId: card.id,
                  senderName: senderName,
                  message: `You have been removed from the card "${title}" in board "${board.title}" by ${senderName}.`
                }
              );
            }
          }
        }

        // FIX: Send notifications for NEW comments only
        if (card.id !== 'temp-new-card' && board) {
          const originalComments = initialCommentsRef.current || [];
          const newComments = comments.filter(newComment =>
            !originalComments.some(oldComment =>
              oldComment.text === newComment.text &&
              oldComment.user === newComment.user
            )
          );

          if (newComments.length > 0) {
            const storedUser = JSON.parse(localStorage.getItem("user") || "null");
            const senderName = storedUser?.firstName && storedUser?.lastName
              ? `${storedUser.firstName} ${storedUser.lastName}`
              : storedUser?.email || "Unknown User";

            for (const member of assignedMembers) {
              // Don't send to commenter
              if (member !== storedUser?.email) {
                for (const comment of newComments) {
                  await sendNotification(
                    member,
                    'card_comment',
                    {
                      boardTitle: board.title,
                      cardTitle: title,
                      cardId: card.id,
                      commentText: comment.text,
                      senderName: senderName,
                    }
                  );
                }
              }
            }

            if (assignedMembers.length > 1) {
              // toast.success("Assigned members notified about new comments");
            }
          }
        }

        onClose();
      } catch (error) {
        console.error('Failed to save card:', error);
        toast.error('Failed to save card. Please try again.');
      } finally {
        setIsSavingCard(false);
      }
    };

    // FIXED: Pre-authenticate to preserve user gesture context
    const handleUploadFromDevice = async () => {
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
        } catch (e) { }
      }

      // No valid token, trigger auth popup DIRECTLY from button click
      const toastId = toast.loading("Authenticating with Google...");
      try {
        await ensureAuthorized(); // ✅ Use ensureAuthorized for consistent prompt logic
        toast.dismiss(toastId);
        fileInputRef.current?.click();
      } catch (error) {
        toast.dismiss(toastId);
        console.error("Google Auth Error:", error);
        toast.error("Google authentication failed. Calendar sync will be disabled.");
      }
    };

    // FIXED: Enhanced file upload handler with proper persistence
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        toast.error("Missing Google Client ID");
        return;
      }

      // Set up states for progress tracking
      const controller = new AbortController();
      setUploadCancelController(controller);
      setIsUploading(true);
      setUploadProgress(0);

      const toastId = toast.loading("Initializing upload...");
      setUploadToastId(toastId);

      try {
        // This should now be silent/cached because we authed in handleUploadFromDevice
        const accessToken = await getGoogleAccessToken(clientId);
        if (!accessToken) {
          throw new Error("Google Drive access denied. Please try again.");
        }

        // Get proper IDs
        const cardId = card.id || card._id;
        const listId = currentListId;
        const boardId = board?.id || board?._id;
        const userId = user?.email || user?._id || "anonymous";

        const uploadedAttachments: Attachment[] = [];
        const totalFiles = Array.from(files).length;
        let completedCount = 0;

        toast.loading(`Uploading ${totalFiles} file(s) to Google Drive... 0%`, { id: toastId });

        // 2. Upload files in parallel
        const uploadPromises = Array.from(files).map(async (file) => {
          try {
            const uploadedFile = await uploadAttachmentToGoogleDrive(
              file,
              userId as string,
              (progress: number) => {
                // This is per-file progress, we calculate overall below
              },
              controller
            );

            if (uploadedFile) {
              const attachment: Attachment = {
                id: uploadedFile.id || crypto.randomUUID(),
                name: uploadedFile.name || file.name,
                url: uploadedFile.url || `https://drive.google.com/file/d/${uploadedFile.id}/view`,
                size: (file.size / 1024 / 1024).toFixed(2) + "MB",
                type: file.type,
                drive: true,
                driveId: uploadedFile.id,
              };

              // Save to backend immediately for existing cards
              if (cardId && cardId !== 'temp-new-card' && boardId && listId) {
                const token = localStorage.getItem('token');
                await axios.post(
                  `${API_URL}/api/boards/${boardId}/lists/${listId}/cards/${cardId}/attachments`,
                  {
                    id: attachment.id,
                    name: attachment.name,
                    url: attachment.url,
                    size: attachment.size,
                    type: attachment.type,
                    driveId: uploadedFile.id,
                    drive: true,
                  },
                  { headers: { Authorization: `Bearer ${token}` } }
                );
              }

              completedCount++;
              const overallProgress = Math.round((completedCount / totalFiles) * 100);
              setUploadProgress(overallProgress);
              toast.loading(`Uploading... ${overallProgress}% (${completedCount}/${totalFiles})`, { id: toastId });

              return attachment;
            }
            return null;
          } catch (err: any) {
            console.error(`Failed to upload ${file.name}:`, err);
            toast.error(`Failed to upload ${file.name}`);
            return null;
          }
        });

        const results = await Promise.all(uploadPromises);
        const successfulAttachments = results.filter((a): a is Attachment => a !== null);

        if (successfulAttachments.length === 0) {
          throw new Error("No files were uploaded successfully");
        }

        // 3. Update all states once at the end
        const updatedAttachments = [...attachments, ...successfulAttachments];
        setAttachments(updatedAttachments);

        // Update parent state
        if (cardId !== 'temp-new-card') {
          // Create simplified attachment objects for onSave
          const simplifiedAttachments = updatedAttachments.map(att => ({
            id: att.id,
            name: att.name,
            url: att.url,
            size: att.size,
            type: att.type,
            drive: att.drive || false,
          }));

          // Update parent component via onSave
          onSave({ attachments: simplifiedAttachments });

          // Also update selectedCard to reflect changes in current modal
          if (selectedCard && selectedCard.card.id === cardId) {
            setSelectedCard({
              ...selectedCard,
              card: {
                ...selectedCard.card,
                attachments: simplifiedAttachments
              }
            });
          }

          toast.success(`Successfully uploaded ${successfulAttachments.length} file(s) to Google Drive`);
        } else {
          toast.info("Files uploaded. Save the card to attach them.");
        }

        // Success cleanup
        setIsUploading(false);
        setUploadCancelController(null);
        setUploadProgress(0);
        toast.dismiss(toastId);

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error: any) {
        setIsUploading(false);
        setUploadCancelController(null);
        setUploadProgress(0);
        toast.dismiss(toastId);

        if (error.message === "Upload cancelled") {
          toast.info("Upload cancelled");
        } else {
          console.error("Upload failed:", error);
          toast.error(`Upload failed: ${error.message || "Unknown error"}`);
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    // FIXED: Enhanced attachment removal with backend sync
    const handleRemoveAttachment = async (attachmentId: string) => {
      const attachmentToRemove = attachments.find(a => a.id === attachmentId);
      if (!attachmentToRemove) return;

      try {
        // Remove from backend if card exists
        if (card.id !== 'temp-new-card' && board?.id) {
          const token = localStorage.getItem('token');
          await axios.delete(
            `${API_URL}/api/boards/${board.id}/cards/${card.id}/attachments/${attachmentToRemove.name}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          // Update card's attachments list
          await axios.put(
            `${API_URL}/api/boards/${board.id}/cards/${card.id}`,
            { attachments: attachments.filter(a => a.id !== attachmentId).map(att => att.name) },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }

        // Update local state
        const updatedAttachments = attachments.filter(a => a.id !== attachmentId);
        setAttachments(updatedAttachments);

        toast.success('Attachment removed');

      } catch (error) {
        console.error('Failed to remove attachment:', error);
        toast.error('Failed to remove attachment');
      }
    };

    const filteredMembers = boardMembers.filter(member =>
      member.email.toLowerCase().includes(searchMember.toLowerCase())
    );

    if (!isOpen) return null;

    return (
      <div key={`card-modal-${card.id}`} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 mobile-safe-padding mobile-bottom-safe">
        <div className={`glass-strong rounded-xl w-full ${isMobile ? 'max-w-full h-full' : 'max-w-4xl max-h-[90vh]'} overflow-hidden flex flex-col`}>
          <div className="flex items-center justify-between p-4 border-b border-white/10 compact-header">
            <h2 className="text-lg font-bold">
              {card.id === 'temp-new-card' ? 'Add Card' : 'Edit Card'}
            </h2>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg glass hover-glow flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto modal-scrollbar p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-2">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full glass rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                placeholder="Enter card title..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-2">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full glass rounded-lg px-3 py-2 min-h-24 resize-none focus:ring-2 focus:ring-purple-500 text-sm"
                placeholder="Add a detailed description..."
              />
            </div>

            {/* Move Card Section - Only show for existing cards */}
            {card.id !== 'temp-new-card' && lists.length > 1 && onMoveCard && (
              <div>
                <label className="block text-xs font-medium mb-2">Move Card</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    className="glass-select flex-1 h-9 text-xs focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer pr-8"
                  >
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() => {
                      if (selectedListId && selectedListId !== currentListId) {
                        onMoveCard(selectedListId);
                        toast.success('Card moved to ' + lists.find(l => l.id === selectedListId)?.title);
                        onClose();
                      }
                    }}
                    disabled={selectedListId === currentListId}
                    className="gradient-primary px-4 py-2 rounded-lg hover-glow disabled:opacity-50 disabled:cursor-not-allowed text-xs h-9"
                  >
                    Move
                  </Button>
                </div>
                <p className="text-xs text-purple-300/70 mt-1">
                  {selectedListId === currentListId ? 'Card is already in this list' : 'Select a different list to move this card'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-2">Labels</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {labels.map((label, idx) => (
                  <Badge key={idx} className="px-2 py-0.5 gradient-primary text-white flex items-center gap-1 text-xs">
                    {label}
                    <button
                      onClick={() => handleRemoveLabel(label)}
                      className="hover:bg-white/20 rounded-full p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                  className="flex-1 glass rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder="Add new label..."
                />
                <Button
                  onClick={handleAddLabel}
                  className="gradient-primary px-3 py-2 rounded-lg hover-glow text-sm h-9"
                >
                  Add
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Assign Team Members
              </label>
              <div className="glass rounded-lg p-2 mb-2 compact-card">
                <div className="relative mb-2">
                  <Input
                    value={searchMember}
                    onChange={(e) => setSearchMember(e.target.value)}
                    placeholder="Search members..."
                    className="glass pl-8 h-8 text-sm"
                  />
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 transform -translate-y-1/2 text-purple-300" />
                </div>
                <div className={`${isMobile ? 'grid grid-cols-1' : 'grid grid-cols-2'} gap-1.5 max-h-40 overflow-y-auto modal-scrollbar`}>
                  {filteredMembers.map((member, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleToggleMember(member.email)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${assignedMembers.includes(member.email)
                        ? 'gradient-primary text-white'
                        : 'glass hover:bg-white/10'
                        }`}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className={assignedMembers.includes(member.email) ? 'bg-white/20' : 'gradient-secondary text-xs'}>
                          {member.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{member.email}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Card-Level Due Date Section */}
              <div className="mt-3">
                <label className="block text-xs font-medium mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Card Due Date
                </label>
                <div className="glass rounded-lg p-2 compact-card">
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1.5 px-2 py-1.5 text-xs glass hover-glow rounded-lg smooth-transition">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {cardDueDate ? (
                            <span>{new Date(cardDueDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                          ) : (
                            <span className="text-purple-300">Set Due Date</span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass-strong border-white/10" align="start">
                        <div className="p-3 space-y-2">
                          <Input
                            type="datetime-local"
                            value={cardDueDate}
                            onChange={(e) => {
                              const datetime = e.target.value;
                              setCardDueDate(datetime);
                            }}
                            className="glass h-8 text-xs focus:ring-2 focus:ring-purple-500 pointer-events-auto"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    {cardDueDate && (
                      <button
                        onClick={() => {
                          setCardDueDate('');
                        }}
                        className="h-8 w-8 rounded-lg glass hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {cardDueDate && (
                    <p className={`text-xs mt-2 ${new Date(cardDueDate) < new Date() ? 'text-red-400 font-semibold' : 'text-purple-300'
                      }`}>
                      {new Date(cardDueDate) < new Date() && '⚠️ '}
                      {new Date(cardDueDate) < new Date() ? 'Due: ' : 'Due: '}
                      {new Date(cardDueDate).toLocaleString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                      {new Date(cardDueDate) < new Date() && ' - Overdue!'}
                    </p>
                  )}
                </div>
              </div>

              {/* Member Deadlines Section */}
              {assignedMembers.length > 0 && (
                <div className="mt-3">
                  <label className="block text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Member Deadlines
                  </label>
                  <div className="space-y-2">
                    {assignedMembers.map((member, idx) => (
                      <div key={idx} className="glass rounded-lg p-2 compact-card">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Avatar className="w-5 h-5 flex-shrink-0">
                              <AvatarFallback className="gradient-secondary text-xs">
                                {member[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs truncate">{member}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {cardDueDate ? (
                              <div className="text-xs text-purple-300 bg-purple-500/20 px-2 py-1 rounded">
                                {new Date(cardDueDate).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-purple-400">No deadline set</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-purple-400 mt-2">
                    Member deadlines are synced with the card due date above.
                  </p>
                </div>
              )}
            </div>

            {/* Attachments upload */}
            <div>
              <label className="block text-xs font-medium mb-2 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Attachments ({attachments.length})
              </label>
              <div className="space-y-1.5 mb-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="glass rounded-lg p-2 compact-card flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                        <Paperclip className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{attachment.name}</p>
                        <p className="text-xs text-purple-300">{attachment.size}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* View button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewAttachment(attachment);
                        }}
                        className="h-7 w-7 rounded-lg glass hover:bg-blue-500/20 hover:text-blue-400 flex items-center justify-center transition-all"
                        title="View attachment"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                      {/* Remove button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAttachment(attachment.id);
                        }}
                        className="h-7 w-7 rounded-lg glass hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-all flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <input
                ref={fileInputRef}
                id="fileUploadInput"
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              {isUploading ? (
                <div className="space-y-2">
                  <div className="w-full glass rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-purple-300">Uploading... {uploadProgress}%</span>
                      <Button
                        onClick={cancelUpload}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-red-400 hover:text-red-300"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={handleUploadFromDevice}
                  className="w-full glass rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 hover-glow text-sm h-9"
                >
                  <Upload className="w-4 h-4" />
                  Upload From Device
                </Button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" />
                Comments ({comments.length})
              </label>
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto modal-scrollbar">
                {comments.map((comment) => (
                  <div key={comment.id} className="glass rounded-lg p-2 compact-card">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="gradient-secondary text-xs">
                          {comment.user[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{comment.user}</p>
                        <p className="text-xs text-purple-300">
                          {new Date(comment.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-purple-100 break-words">{comment.text}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 glass rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder="Add a comment..."
                />
                <Button
                  onClick={handleAddComment}
                  className="gradient-primary px-3 sm:px-4 py-2 rounded-lg hover-glow text-sm h-9"
                >
                  {isMobile ? 'Post' : 'Post'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border-t border-white/10">
            {card.id !== 'temp-new-card' && (
              <Button
                onClick={onDelete}
                variant="ghost"
                className="text-red-400 hover:bg-red-500/20 px-2 py-1.5 text-xs compact-button"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {isMobile ? 'Delete' : 'Delete Card'}
              </Button>
            )}
            <div className={`flex gap-1.5 ${card.id === 'temp-new-card' ? 'ml-auto' : ''}`}>
              <Button
                onClick={onClose}
                variant="ghost"
                className="px-3 py-1.5 glass hover-glow text-xs compact-button"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="gradient-primary px-4 py-1.5 hover-glow text-xs compact-button relative"
                disabled={isUploading || isSavingCard}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Uploading...
                  </>
                ) : isSavingCard ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    {card.id === 'temp-new-card' ? 'Creating...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    {card.id === 'temp-new-card' ? 'Create Card' : 'Save Changes'}
                    {attachments.length > 0 && (
                      <span className="ml-1.5 bg-white/20 rounded-full px-1.5 py-0.5 text-[10px]">
                        {attachments.length} file{attachments.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* FIXED: Add the AttachmentThumbnailViewer */}
        {selectedAttachment && (
          <AttachmentThumbnailViewer
            attachment={selectedAttachment}
            onClose={() => setSelectedAttachment(null)}
          />
        )}
      </div>
    );
  };

  // Compact Card Footer Component
  const CompactCardFooter = ({
    card,
    onViewComments,
    onDownloadAttachment,
    onViewDescription
  }: {
    card: CardType;
    onViewComments?: (e: React.MouseEvent) => void;
    onDownloadAttachment?: (attachmentName: string, e: React.MouseEvent) => void;
    onViewDescription?: (e: React.MouseEvent) => void;
  }) => {
    const memberDeadlines = (card as any).memberDeadlines || {};
    const hasUpcomingDeadline = Object.values(memberDeadlines).some((deadline: any) => {
      if (!deadline) return false;
      const deadlineDate = new Date(deadline);
      const today = new Date();
      const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 3 && diffDays >= 0;
    });

    return (
      <div className="flex items-center justify-between mt-2">
        {/* Left side: Profile icons */}
        {card.assignedMembers.length > 0 && (
          <div className="flex -space-x-1">
            {card.assignedMembers.slice(0, 3).map((member, idx) => {
              const deadline = memberDeadlines[member];
              const isUrgent = deadline && (() => {
                const deadlineDate = new Date(deadline);
                const today = new Date();
                const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return diffDays <= 3 && diffDays >= 0;
              })();

              return (
                <div key={idx} className="relative">
                  <Avatar className={`w-5 h-5 border-2 ${isUrgent ? 'border-red-500' : 'border-slate-900'} hover:scale-110 smooth-transition`}>
                    <AvatarFallback className="gradient-secondary text-xs font-medium">
                      {member[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {isUrgent && (
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
              );
            })}
            {card.assignedMembers.length > 3 && (
              <Avatar className="w-5 h-5 border-2 border-slate-900">
                <AvatarFallback className="glass text-xs font-medium">
                  +{card.assignedMembers.length - 3}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        )}

        {/* Right side: Clickable Icons */}
        <div className="flex items-center gap-0.5 ml-auto">
          {/* Card Due Date Display */}
          {card.dueDate && (
            <div
              className="flex items-center gap-0.5 text-xs bg-purple-500/20 text-purple-300 rounded px-1.5 py-0.5"
              title={`Due: ${new Date(card.dueDate).toLocaleString()}`}
            >
              <Calendar className="w-2.5 h-2.5" />
              <span className="text-[9px] font-medium">
                {new Date(card.dueDate).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            </div>
          )}
          {/* Deadline Warning Icon */}
          {hasUpcomingDeadline && (
            <div
              className="flex items-center gap-0.5 text-xs text-red-400 bg-red-500/20 rounded px-1.5 py-0.5"
              title="Urgent deadline"
            >
              <Clock className="w-2.5 h-2.5 animate-pulse" />
            </div>
          )}
          {/* Description Icon */}
          {card.description && (
            <button
              onClick={onViewDescription}
              className="flex items-center gap-0.5 text-xs text-purple-300 hover:text-white hover:bg-white/10 rounded px-1.5 py-0.5 smooth-transition group"
              title="View description"
            >
              <FileText className="w-2.5 h-2.5 group-hover:scale-110 smooth-transition" />
            </button>
          )}

          {/* Comments Icon */}
          {card.comments.length > 0 && (
            <button
              onClick={onViewComments}
              className="flex items-center gap-0.5 text-xs text-purple-300 hover:text-white hover:bg-white/10 rounded px-1.5 py-0.5 smooth-transition group"
              title={`View ${card.comments.length} comments`}
            >
              <MessageCircle className="w-2.5 h-2.5 group-hover:scale-110 smooth-transition" />
              <span className="text-[9px] font-medium">{card.comments.length}</span>
            </button>
          )}

          {/* Attachments Icon with dropdown */}
          {card.attachments.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-0.5 text-xs text-purple-300 hover:text-white hover:bg-white/10 rounded px-1.5 py-0.5 smooth-transition group"
                  title={`${card.attachments.length} attachments`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Paperclip className="w-2.5 h-2.5 group-hover:scale-110 smooth-transition" />
                  <span className="text-[9px] font-medium">{card.attachments.length}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="glass-strong w-40 border-white/10"
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1.5 text-xs font-semibold border-b border-white/10 text-purple-300">
                  Attachments ({card.attachments.length})
                </div>
                {card.attachments.map((attachment, index) => {
                  const attachmentName = typeof attachment === 'string' ? attachment : attachment.name;
                  return (
                    <DropdownMenuItem
                      key={index}
                      onClick={(e) => onDownloadAttachment?.(attachmentName, e)}
                      className="flex items-center gap-1.5 cursor-pointer py-1.5 smooth-transition hover:bg-white/10 text-xs"
                    >
                      <div className="w-6 h-6 gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                        <Paperclip className="w-2.5 h-2.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{attachmentName}</p>
                      </div>
                      <Download className="w-2.5 h-2.5 text-purple-300 flex-shrink-0" />
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  };

  // KanbanCard Component
  const KanbanCard = ({
    card,
    onClick,
    onDelete,
    onViewComments,
    onDownloadAttachment,
    onViewDescription
  }: KanbanCardProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: `card-${card.id}`,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.5 : 1,
      scale: isDragging ? 1.05 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`compact-card glass rounded-xl hover-glow cursor-grab active:cursor-grabbing card-hover group smooth-transition drag-transition ${isDragging ? 'drag-preview' : ''
          }`}
        onClick={onClick}
      >
        {/* Card Labels */}
        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {card.labels.slice(0, 2).map((label) => (
              <Badge
                key={label}
                className="px-1.5 py-0.5 text-[9px] gradient-primary text-white truncate max-w-16 font-medium"
              >
                {label}
              </Badge>
            ))}
            {card.labels.length > 2 && (
              <Badge className="px-1.5 py-0.5 text-[9px] glass text-purple-300">
                +{card.labels.length - 2}
              </Badge>
            )}
          </div>
        )}

        {/* Card Title */}
        <h4 className="font-semibold text-xs mb-2 line-clamp-3 pr-6 leading-relaxed group-hover:text-white smooth-transition">
          {card.title}
        </h4>

        {/* Compact Card Footer */}
        <CompactCardFooter
          card={card}
          onViewComments={onViewComments}
          onDownloadAttachment={onDownloadAttachment}
          onViewDescription={onViewDescription}
        />

        {/* Card Options Menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 smooth-transition">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 glass hover-glow"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="glass-strong w-32 border-white/10" align="end">
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className="smooth-transition cursor-pointer hover:bg-white/10 text-xs"
              >
                <Pencil className="w-3 h-3 mr-1.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-red-400 smooth-transition cursor-pointer hover:bg-red-500/20 text-xs"
              >
                <Trash2 className="w-3 h-3 mr-1.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  // KanbanList Component
  const KanbanList = ({
    list,
    editingListId,
    editingListTitle,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDelete,
    onAddCard,
    onCardClick,
    onDeleteCard,
    setEditingListTitle,
    onViewComments,
    onDownloadAttachment,
    onViewDescription,
    onMoveAllCards,
    availableLists,
  }: KanbanListProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: `list-${list.id}`,
    });

    const [isMobile, setIsMobile] = useState(false);
    const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
    const [showMoveAllOptions, setShowMoveAllOptions] = useState(false);

    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const style = {
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.7 : 1,
      scale: isDragging ? 1.02 : 1,
    };

    const otherLists = availableLists.filter(l => l.id !== list.id);

    const handleMoveAllCards = (targetListId: string) => {
      if (targetListId && list.cards.length > 0) {
        onMoveAllCards(list.id, targetListId);
        setShowMoveAllOptions(false);
        setIsMainMenuOpen(false);
      }
    };

    const handleMenuAction = (action: () => void) => {
      action();
      setIsMainMenuOpen(false);
    };

    const handleMoveAllToggle = (e: Event) => {
      e.preventDefault();
      setShowMoveAllOptions(!showMoveAllOptions);
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex-shrink-0 ${isMobile ? 'w-64' : 'w-72'} glass-strong rounded-xl p-3 compact-list flex flex-col h-full smooth-transition drag-transition ${isDragging ? 'list-drag-preview' : ''
          }`}
      >
        {/* Enhanced List Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 mr-2 min-w-0">
            {editingListId === list.id ? (
              <Input
                value={editingListTitle}
                onChange={(e) => setEditingListTitle(e.target.value)}
                onBlur={() => onSaveEdit(list.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit(list.id);
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="glass h-8 rounded-lg text-sm font-semibold border-white/20 focus:border-purple-400 smooth-transition"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <h3
                  className="font-bold text-base cursor-grab flex-1 truncate group-hover:text-white smooth-transition"
                  {...attributes}
                  {...listeners}
                >
                  {list.title}
                </h3>
                <span className="text-xs text-blue-300 bg-white/10 rounded-full px-2 py-0.5 min-w-6 text-center font-medium">
                  {list.cards.length}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Premium Dropdown Menu */}
            <DropdownMenu open={isMainMenuOpen} onOpenChange={setIsMainMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 glass hover-glow smooth-transition group">
                  <MoreVertical className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="glass-strong border-white/15 w-56 backdrop-blur-xl shadow-2xl"
                align="end"
                sideOffset={5}
              >
                {/* Header Section */}
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-xs font-semibold text-blue-300">List Actions</p>
                  <p className="text-xs text-blue-400 truncate">"{list.title}"</p>
                </div>

                <div className="p-1.5 space-y-0.5">
                  {/* Rename List */}
                  <DropdownMenuItem
                    onClick={() => handleMenuAction(() => onStartEdit(list.id, list.title))}
                    className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-all duration-200 hover:bg-white/10 hover:scale-[1.02] group"
                  >
                    <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                      <Pencil className="w-3 h-3 text-blue-300" />
                    </div>
                    <span className="text-xs font-medium">Rename List</span>
                  </DropdownMenuItem>

                  {/* Move All Cards Section */}
                  {list.cards.length > 0 && otherLists.length > 0 && (
                    <div className="space-y-0.5">
                      {/* Move All Toggle */}
                      <DropdownMenuItem
                        onSelect={handleMoveAllToggle}
                        className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-all duration-200 hover:bg-white/10 hover:scale-[1.02] group"
                      >
                        <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
                          <Move className="w-3 h-3 text-indigo-300" />
                        </div>
                        <span className="text-xs font-medium">Move All Cards</span>
                        <div className="ml-auto flex items-center gap-1">
                          <span className="text-xs text-blue-400 bg-white/5 px-1.5 py-0.5 rounded">
                            {list.cards.length}
                          </span>
                          <ChevronDown className={`w-3 h-3 text-blue-400 transition-transform duration-200 ${showMoveAllOptions ? 'rotate-180' : ''}`} />
                        </div>
                      </DropdownMenuItem>

                      {/* Move All Options */}
                      {showMoveAllOptions && (
                        <div className="ml-6 mt-1 space-y-1 ">
                          <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide px-2">
                            Move to:
                          </div>
                          <div className="max-h-40 overflow-y-auto custom-scrollbar-vertical space-y-0.5 pr-1">
                            {otherLists.map((targetList) => (
                              <button
                                key={targetList.id}
                                onClick={() => handleMoveAllCards(targetList.id)}
                                className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs transition-all duration-200 hover:bg-white/10 hover:translate-x-1 group"
                              >
                                <div className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                                  <Move className="w-2 h-2 text-emerald-300" />
                                </div>
                                <span className="flex-1 text-left truncate font-medium">{targetList.title}</span>
                                <span className="text-[10px] text-blue-400 bg-white/5 px-1.5 py-0.5 rounded min-w-6 text-center shrink-0">
                                  {targetList.cards.length}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delete List - Separated with border */}
                  <div className="pt-1 mt-1 border-t border-white/10">
                    <DropdownMenuItem
                      onClick={() => handleMenuAction(() => onDelete(list.id))}
                      className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-all duration-200 hover:bg-red-500/20 hover:scale-[1.02] group text-red-400"
                    >
                      <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30 transition-colors">
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </div>
                      <span className="text-xs font-medium">Delete List</span>
                    </DropdownMenuItem>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-3 py-1.5 border-t border-white/10">
                  <p className="text-[10px] text-blue-400 text-center">
                    {list.cards.length} cards • {otherLists.length} destinations
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Cards Area */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar-vertical pr-0.5 min-h-0"
        >
          <SortableContext
            items={list.cards.map((c) => `card-${c.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 pb-1">
              {list.cards.map((card) => (
                <KanbanCard
                  key={card.id}
                  card={card}
                  onClick={() => onCardClick(card)}
                  onDelete={() => onDeleteCard(card.id)}
                  onViewComments={(e) => onViewComments(card, e)}
                  onDownloadAttachment={(name, e) => onDownloadAttachment(name, e)}
                  onViewDescription={(e) => onViewDescription(card, e)}
                />
              ))}
            </div>
          </SortableContext>
        </div>

        {/* Add Card Button */}
        <div className="mt-3 pt-3 border-t border-white/10 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-blue-300 hover:text-white h-9 text-sm smooth-transition hover:bg-white/5 rounded-lg group"
            onClick={() => onAddCard(list.id)}
          >
            <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
            Add a card
          </Button>
        </div>
      </div>
    );
  };

  // Mobile Menu Component
  const MobileMenu = ({ onShare, onAddList, isAddingList }: MobileMenuProps) => (
    <div className="md:hidden fixed bottom-6 right-6 z-40 ">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-12 w-12 rounded-full gradient-primary hover-glow shadow-lg smooth-transition">
            <Menu className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="glass-strong mb-4 mr-4 w-40 border-white/10"
          align="end"
          side="top"
        >
          <DropdownMenuItem
            onClick={onShare}
            className="flex items-center gap-2 py-2 smooth-transition cursor-pointer hover:bg-white/10 text-xs"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share Board
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onAddList}
            className="flex items-center gap-2 py-2 smooth-transition cursor-pointer hover:bg-white/10 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            {isAddingList ? 'Adding List...' : 'Add List'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  // Confirm Dialog Component
  const ConfirmDialog = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
  }) => {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-strong rounded-xl p-4 max-w-md w-full mx-4">
          <h3 className="text-base font-bold mb-2">{title}</h3>
          <p className="text-purple-200 text-sm mb-4">{description}</p>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="ghost" className="flex-1 glass hover-glow h-9 text-sm">
              Cancel
            </Button>
            <Button onClick={onConfirm} className="flex-1 bg-red-500 hover:bg-red-600 text-white h-9 text-sm">
              Confirm
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Local board state
  const [board, setBoard] = useState<BoardType | null>(null);
  const [boardTitle, setBoardTitle] = useState('Untitled Board');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<{ card: CardType; listId: string } | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [commentsCard, setCommentsCard] = useState<CardType | null>(null);
  const [descriptionCard, setDescriptionCard] = useState<CardType | null>(null);
  const [newListTitle, setNewListTitle] = useState('');
  const [isAddingList, setIsAddingList] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListTitle, setEditingListTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { type: 'list'; id: string }
    | { type: 'card'; id: string; listId: string }
    | { type: 'member'; memberEmail: string; id?: string }
    | null
  >(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [boardDeadline, setBoardDeadline] = useState<string>(() => {
    if (board?.dueDate) {
      const date = new Date(board.dueDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    return '';
  });

  // FIXED: Theme state - better initialization
  const [currentTheme, setCurrentTheme] = useState<ThemeOption>('default');

  // FIXED: Upload states for persistence
  const [uploadStates, setUploadStates] = useState<Record<string, {
    isUploading: boolean;
    progress: number;
    controller: AbortController;
    cardId: string;
  }>>({});

  // FIXED: Load theme from board data when board loads
  useEffect(() => {
    if (board?.color) {
      const themeMap: Record<string, ThemeOption> = {
        'gradient-purple-blue': 'default',
        'from-slate-900 via-purple-900 to-slate-900': 'default',
        'gradient-blue-cyan': 'blue',
        'from-slate-900 via-blue-900 to-slate-900': 'blue',
        'gradient-green-emerald': 'green',
        'from-slate-900 via-emerald-900 to-slate-900': 'green',
        'gradient-red-pink': 'red',
        'from-slate-900 via-red-900 to-slate-900': 'red',
        'gradient-yellow-orange': 'yellow',
        'from-slate-900 via-yellow-900 to-slate-900': 'yellow',
        'gradient-pink-purple': 'pink',
        'from-slate-900 via-pink-900 to-slate-900': 'pink',
        'gradient-orange-red': 'orange',
        'from-slate-900 via-orange-900 to-slate-900': 'orange',
        'gradient-teal-cyan': 'teal',
        'from-slate-900 via-teal-900 to-slate-900': 'teal',
      };

      const theme = themeMap[board.color] || 'default';
      setCurrentTheme(theme);
    }
  }, [board?.color]);

  // FIXED: Sync local board from context - ensure board exists
  useEffect(() => {
    if (!boardId) {
      setBoard(null);
      return;
    }

    const found = boards?.find((b) => b.id === boardId);
    if (found) {
      setBoard(found);
      setBoardTitle(found.title || 'Untitled Board');

      // ✅ FIXED: Format ISO string to local datetime-local format (YYYY-MM-DDTHH:mm)
      if (found.dueDate) {
        const date = new Date(found.dueDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        setBoardDeadline(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setBoardDeadline('');
      }
    } else if (user?.email) {
      // If not found in current boards, try fetching boards
      fetchBoards(user.email, user.role);
    } else {
      setBoard(null);
    }
  }, [boards, boardId, user?.email, user?.role, fetchBoards]);

  // Responsive
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Proper style injection for custom scrollbars
  useEffect(() => {
    if (document.getElementById('custom-scrollbar-styles')) {
      return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = 'custom-scrollbar-styles';
    styleElement.textContent = scrollbarStyles;
    document.head.appendChild(styleElement);

    return () => {
      const existingStyle = document.getElementById('custom-scrollbar-styles');
      if (existingStyle) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);

  // FIXED: Cleanup uploads on unmount
  useEffect(() => {
    return () => {
      // Cancel all ongoing uploads when component unmounts
      Object.values(uploadStates).forEach(state => {
        if (state.isUploading) {
          state.controller.abort();
        }
      });
    };
  }, [uploadStates]);

  // FIXED: Enhanced sensors for both pointer and touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: isMobile ? 15 : 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  // Handler functions
  const handleSaveTitle = useCallback(async () => {
    if (!boardId || !boardTitle.trim() || !board) return;

    try {
      await updateBoard(boardId, { title: boardTitle });
      await logActivity(boardId, 'board_title_updated', {
        oldTitle: board.title,
        newTitle: boardTitle
      });
      toast.success('✅ Board Saved');
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Error saving title:', error);
      toast.error('Failed to save board title');
    }
  }, [boardId, boardTitle, updateBoard, board]);

  const handleSaveBoardDeadline = useCallback(async () => {
    if (!boardId || !board) return;

    try {
      // ✅ FIXED: Convert local datetime-local string to proper ISO string with UTC for database
      const isoDeadline = boardDeadline ? new Date(boardDeadline).toISOString() : '';

      await updateBoard(boardId, { dueDate: isoDeadline } as any);

      // Log activity
      await logActivity(boardId, 'board_deadline_updated', {
        deadline: boardDeadline
      });

      // Push deadline to all member Google Calendars
      const isGoogleUser = user?.authProvider === 'google';

      if (boardDeadline && (board?.members?.length || isGoogleUser)) {
        try {
          // FIXED: Get all member emails (including PM)
          const allMembers = [...(board.members || [])];
          const pmEmail = (board as any).userEmail || user?.email;

          // Add PM if not in members list
          if (pmEmail && !allMembers.some(m => m.email === pmEmail)) {
            allMembers.push({ email: pmEmail, role: 'manager' });
          }

          // Ensure current user is included if they are a google user
          if (isGoogleUser && user?.email && !allMembers.some(m => m.email === user.email)) {
            allMembers.push({ email: user.email, role: 'member' });
          }

          const memberEmails = [...new Set(allMembers.map(m => m.email))];

          // FIXED: Create ONE calendar event for the board
          const eventTitle = `${boardTitle} - Project Deadline`;
          const eventDescription = `Project "${boardTitle}" is due on ${new Date(boardDeadline).toLocaleString()}.`;

          const eventId = await addEventToGoogleCalendar({
            title: eventTitle,
            description: eventDescription,
            dueDate: boardDeadline,
            assignedMembers: memberEmails, // Add to all members' calendars
          });

          if (eventId) {
            // Store event ID on board for future updates
            await updateBoard(boardId, { googleEventId: eventId } as any);
            toast.success(`Board deadline added to team members' calendars ✅`);
          } else {
            toast.warning("Board saved, but failed to sync with Google Calendar.");
          }

          // FIXED: Send notifications to ALL members with clear message
          for (const member of allMembers) {
            await sendNotification(
              member.email,
              'board_deadline',
              {
                boardTitle: board.title,
                boardId: board.id,
                message: `Project deadline set for ${new Date(boardDeadline).toLocaleString()}. The project "${boardTitle}" must be completed by this date.`
              }
            );

            // Send email notification
            try {
              await axios.post(`${API_URL}/api/send-email`, {
                to: member.email,
                subject: `Project Deadline: ${boardTitle}`,
                html: `
                <h2>Project Deadline Alert</h2>
                <p>The project <strong>${boardTitle}</strong> has a deadline set for:</p>
                <h3>${new Date(boardDeadline).toLocaleString()}</h3>
                <p>All team members are expected to complete their tasks by this date.</p>
                <a href="${window.location.origin}/board/${boardId}">View Board</a>
              `
              });
            } catch (emailErr) {
              console.error('Failed to send email notification:', emailErr);
            }
          }
        } catch (err: any) {
          console.error('Failed to add board deadline to Google Calendar', err);
          // Standardize error check for both string and object formats
          const errorMsg = typeof err === 'string' ? err : err?.error || err?.message || '';

          // Use a unique toast ID to avoid duplicates and ensure it's visible
          const toastId = `google-sync-cancel-${Date.now()}`;

          if (errorMsg === 'popup_closed' || errorMsg.includes('popup_closed')) {
            toast.error('Google Calendar sync cancelled. Board saved, but not synced to Calendar.', {
              duration: 6000,
              id: toastId
            });
          } else {
            toast.warning('Board deadline updated but failed to sync to Google Calendar');
          }
        }
      } else if (!boardDeadline && (board as any).googleEventId) {
        // CASE: Deadline removed
        try {
          await deleteGoogleCalendarEvent((board as any).googleEventId);
          await updateBoard(boardId, { googleEventId: '' } as any);
          toast.success("Board deadline removed from Google Calendar 🗑️");
        } catch (err) {
          console.error('Failed to remove board deadline from Google Calendar', err);
        }
      } else {
        toast.success('Board deadline updated');
      }
    } catch (error) {
      console.error('Error saving deadline:', error);
      toast.error('Failed to save deadline');
    }
  }, [boardId, boardDeadline, updateBoard, board, boardTitle]);

  const handleAddList = useCallback(async () => {
    if (!boardId || !newListTitle.trim() || !board) return;
    if (isSubmittingList) return;
    
    setIsSubmittingList(true);

    try {
      await addList(boardId, newListTitle.trim());
      await logActivity(boardId, 'list_created', {
        listTitle: newListTitle.trim()
      });
      setNewListTitle('');
      setIsAddingList(false);
      toast.success('List added');
    } catch (error) {
      console.error('Error adding list:', error);
      toast.error('Failed to add list');
    } finally {
      setIsSubmittingList(false);
    }
  }, [boardId, newListTitle, addList, board, isSubmittingList]);

  const handleRenameList = useCallback(async (listId: string) => {
    if (!boardId || !editingListTitle.trim() || !board) return;

    try {
      const list = board.lists.find(l => l.id === listId);
      if (list) {
        await updateList(boardId, listId, editingListTitle.trim());
        await logActivity(boardId, 'list_renamed', {
          oldTitle: list.title,
          newTitle: editingListTitle.trim()
        });
        setEditingListId(null);
        setEditingListTitle('');
        toast.success('List renamed');
      }
    } catch (error) {
      console.error('Error renaming list:', error);
      toast.error('Failed to rename list');
    }
  }, [boardId, editingListTitle, updateList, board]);

  const handleDeleteList = useCallback(async () => {
    if (!boardId || deleteConfirm?.type !== 'list' || !board) return;

    try {
      const list = board.lists.find(l => l.id === deleteConfirm.id);
      if (list) {
        await deleteList(boardId, deleteConfirm.id);
        await logActivity(boardId, 'list_deleted', {
          listTitle: list.title,
          cardCount: list.cards.length
        });
        toast.success('List deleted');
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Error deleting list:', error);
      toast.error('Failed to delete list');
      setDeleteConfirm(null);
    }
  }, [boardId, deleteConfirm, deleteList, board]);

  const handleAddCard = useCallback((listId: string) => {
    if (!boardId || !board) return;
    const tempCard: CardType = {
      id: 'temp-new-card',
      title: '',
      description: '',
      labels: [],
      assignedMembers: [],
      attachments: [],
      comments: [],
    };
    setSelectedCard({ card: tempCard, listId });
    setShowCardModal(true);
  }, [boardId, board]);

  const handleUpdateCard = useCallback(
    async (listId: string, cardId: string, updates: Partial<CardType>) => {
      if (!boardId || !board) return;

      try {
        await updateCard(boardId, listId, cardId, updates);

        // Get full card data after update to ensure all fields are available for calendar sync
        const list = board.lists.find(l => l.id === listId);
        const currentCard = list?.cards.find(c => c.id === cardId);
        if (!currentCard) return;

        // Use current card data for missing update fields
        const cardTitle = updates.title ?? currentCard.title;
        const cardDesc = updates.description ?? currentCard.description;
        const cardDueDate = updates.dueDate ?? currentCard.dueDate;
        const cardAssignedMembers = updates.assignedMembers ?? currentCard.assignedMembers;
        const cardGoogleEventId = updates.googleEventId ?? currentCard.googleEventId;

        const isGoogleUser = user?.authProvider === 'google';

        // CASE 1: Due date is REMOVED
        if (updates.dueDate === '' || updates.dueDate === null) {
          if (cardGoogleEventId) {
            try {
              await deleteGoogleCalendarEvent(cardGoogleEventId);
              await updateCard(boardId, listId, cardId, { googleEventId: '' });
              toast.success("Task removed from Google Calendar 🗑️");
            } catch (delErr) {
              console.error("❌ Failed to delete calendar event:", delErr);
            }
          }
          return;
        }

        // CASE 2: Sync if due date is set (or updated) AND (either members are assigned OR current user is a Google user)
        if (cardDueDate && (cardAssignedMembers.length > 0 || isGoogleUser)) {
          const parsedDate = new Date(cardDueDate as any);

          // Determine who gets the calendar invite
          const targetMembers = [...cardAssignedMembers];
          if (isGoogleUser && user?.email && !targetMembers.includes(user.email)) {
            targetMembers.push(user.email);
          }

          try {
            if (cardGoogleEventId) {
              await updateGoogleCalendarEvent(
                cardGoogleEventId,
                {
                  title: cardTitle ?? "",
                  description: cardDesc,
                  dueDate: parsedDate,
                  assignedMembers: targetMembers
                }
              );
              toast.success("Google Calendar event updated ✅");
            } else {
              const newEventId = await addEventToGoogleCalendar({
                title: cardTitle ?? "",
                description: cardDesc,
                dueDate: parsedDate,
                assignedMembers: targetMembers,
              });

              if (newEventId) {
                await updateCard(boardId, listId, cardId, { googleEventId: newEventId });
                toast.success("Task added to Google Calendar ✅");
              } else {
                toast.warning("Card updated, but failed to sync with Google Calendar.");
              }
            }
          } catch (syncErr: any) {
            console.error("❌ Calendar sync error:", syncErr);
            const errorMsg = typeof syncErr === 'string' ? syncErr : syncErr?.error || syncErr?.message || '';
            const toastId = `google-sync-cancel-${Date.now()}`;

            if (errorMsg === 'popup_closed' || errorMsg.includes('popup_closed')) {
              toast.error("Google sync cancelled. Card saved, but not synced to Calendar.", {
                duration: 6000,
                id: toastId
              });
            } else {
              toast.warning("Card saved, but calendar sync failed.");
            }
          }

          const currentUserEmail = localStorage.getItem("userEmail");
          if (currentUserEmail) {
            fetchNotifications(currentUserEmail);
          }
        }
      } catch (err) {
        console.error("❌ Card update failed:", err);
        toast.error("Failed to update card");
      }
    },
    [boardId, board, updateCard, user, fetchNotifications]
  );

  const handleDeleteCard = useCallback(async () => {
    if (!boardId || deleteConfirm?.type !== 'card' || !deleteConfirm.listId || !board) return;

    try {
      const list = board.lists.find(l => l.id === deleteConfirm.listId);
      const card = list?.cards.find(c => c.id === deleteConfirm.id);

      if (card) {
        await deleteCard(boardId, deleteConfirm.listId, deleteConfirm.id);
        await logActivity(boardId, 'card_deleted', {
          cardTitle: card.title,
          listTitle: list?.title
        });
        toast.success('Card deleted');
        setDeleteConfirm(null);
        setShowCardModal(false);
        setSelectedCard(null);
      }
    } catch (error) {
      console.error('Error deleting card:', error);
      toast.error('Failed to delete card');
    }
  }, [boardId, deleteConfirm, deleteCard, board]);

  const handleRemoveMember = useCallback(async () => {
    if (!boardId || deleteConfirm?.type !== 'member' || !deleteConfirm.memberEmail || !board) return;

    try {
      const updatedMembers = board.members.filter((m) => m.email !== deleteConfirm.memberEmail);
      await updateBoard(boardId, { members: updatedMembers });

      await logActivity(boardId, 'member_removed', {
        memberEmail: deleteConfirm.memberEmail
      });

      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      const senderFullName = storedUser?.firstName && storedUser?.lastName
        ? `${storedUser.firstName} ${storedUser.lastName}`
        : storedUser?.email || "Board Admin";

      await sendNotification(
        deleteConfirm.memberEmail,
        'board_removed',
        {
          boardTitle: board.title,
          boardId: board.id,
          senderName: senderFullName,
          message: `You have been removed from the board "${board.title}" by ${senderFullName}.`
        }
      );

      toast.success('Member removed and notified');
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    }
  }, [boardId, deleteConfirm, updateBoard, board]);

  const handleViewComments = useCallback((card: CardType, e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentsCard(card);
    setShowCommentsModal(true);
  }, []);

  const handleViewDescription = useCallback((card: CardType, e: React.MouseEvent) => {
    e.stopPropagation();
    setDescriptionCard(card);
    setShowDescriptionModal(true);
  }, []);

  const handleDownloadAttachment = useCallback((attachmentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([`Simulated content for ${attachmentName}`], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachmentName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${attachmentName}`);
  }, []);

  const handleCardClick = useCallback((card: CardType, listId: string) => {
    setSelectedCard({ card, listId });
    setShowCardModal(true);
  }, []);

  // Enhanced Move All Cards function
  const handleMoveAllCards = useCallback(async (sourceListId: string, targetListId: string) => {
    if (!boardId || !board) return;

    const sourceList = board.lists.find(l => l.id === sourceListId);
    if (!sourceList || sourceList.cards.length === 0) return;

    const targetList = board.lists.find(l => l.id === targetListId);
    const targetListName = targetList?.title || 'target list';

    // Create a copy of cards to move
    const cardsToMove = [...sourceList.cards];

    // Move cards one by one with proper error handling
    let movedCount = 0;

    for (const card of cardsToMove) {
      try {
        await moveCard(boardId, card.id, sourceListId, targetListId, 0);
        movedCount++;

        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Failed to move card ${card.id}:`, error);
      }
    }

    if (movedCount === cardsToMove.length) {
      await logActivity(boardId, 'cards_moved_between_lists', {
        sourceList: sourceList.title,
        targetList: targetList?.title,
        cardCount: movedCount
      });
      toast.success(`Moved all ${movedCount} cards to ${targetListName}`);
    } else {
      toast.success(`Moved ${movedCount} out of ${cardsToMove.length} cards to ${targetListName}`);
    }
  }, [boardId, board, moveCard]);

  // FIXED: Enhanced handleDragEnd function
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id as string;
    setActiveId(activeId);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !board || !boardId) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Handle list reordering
    if (activeId.startsWith('list-') && overId.startsWith('list-')) {
      const oldIndex = board.lists.findIndex((l) => `list-${l.id}` === activeId);
      const newIndex = board.lists.findIndex((l) => `list-${l.id}` === overId);

      if (oldIndex !== newIndex) {
        const newLists = arrayMove(board.lists, oldIndex, newIndex);

        try {
          // ✅ FIX: Just use context's reorderLists - it handles BOTH state AND API
          // REMOVED: The duplicate axios.put call that was here
          await reorderLists(boardId, newLists);

          toast.success(`List moved to position ${newIndex + 1}`);
        } catch (error: any) {
          console.error('Failed to save list order:', error);

          const errorMessage = error.response?.data?.message ||
            error.response?.data?.error ||
            error.message ||
            'Failed to save list position';

          toast.error(`Failed to save: ${errorMessage}`);
        }
      }
      return;
    }

    // Handle card movement
    if (activeId.startsWith('card-')) {
      const cardId = activeId.replace('card-', '');

      const sourceList = board.lists.find((l) => l.cards.some((c) => c.id === cardId));
      const sourceCard = sourceList?.cards.find((c) => c.id === cardId);

      if (!sourceList || !sourceList.id || !sourceCard) {
        toast.error('Unable to move card: card not found');
        return;
      }

      let targetListId: string;
      let targetIndex: number;

      if (overId.startsWith('list-')) {
        targetListId = overId.replace('list-', '');
        targetIndex = 0;
      } else if (overId.startsWith('card-')) {
        const overCardId = overId.replace('card-', '');
        const targetList = board.lists.find((l) => l.cards.some((c) => c.id === overCardId));

        if (!targetList || !targetList.id) {
          toast.error('Unable to move card: target list not found');
          return;
        }

        targetListId = targetList.id;
        targetIndex = targetList.cards.findIndex((c) => c.id === overCardId);
      } else {
        return;
      }

      try {
        await moveCard(boardId, cardId, sourceList.id, targetListId, targetIndex);

        const targetList = board.lists.find((l) => l.id === targetListId);

        await logActivity(board.id, 'card_moved', {
          cardTitle: sourceCard.title,
          fromList: sourceList.title,
          toList: targetList?.title
        });

        toast.success(`Card moved to "${targetList?.title}"`);
      } catch (error) {
        console.error('❌ Failed to move card:', error);
        toast.error('Failed to save card movement. Please try again.');
      }
    }
  };

  const activeCard = activeId?.startsWith('card-') && board
    ? board.lists
      .flatMap((l) => l.cards.map((c) => ({ ...c, listId: l.id })))
      .find((c) => `card-${c.id}` === activeId)
    : null;

  const getConfirmDialogProps = () => {
    if (!deleteConfirm) return null;

    switch (deleteConfirm.type) {
      case 'list':
        return {
          title: 'Delete List?',
          description: 'Are you sure you want to delete this list? This action cannot be undone.'
        };
      case 'card':
        return {
          title: 'Delete Card?',
          description: 'Are you sure you want to delete this card? This action cannot be undone.'
        };
      case 'member':
        return {
          title: 'Remove Member?',
          description: `Are you sure you want to remove ${deleteConfirm.memberEmail} from this board? They will lose access to all board content.`
        };
      default:
        return null;
    }
  };

  const confirmDialogProps = getConfirmDialogProps();

  // FIXED: Theme change handler - ensures board stays loaded
  const handleThemeChange = async (theme: ThemeOption) => {
    if (!boardId || !board) {
      toast.error('Board not found');
      return;
    }

    setCurrentTheme(theme);

    // Map theme to database color value
    const colorMap: Record<ThemeOption, string> = {
      'default': 'from-slate-900 via-purple-900 to-slate-900',
      'blue': 'from-slate-900 via-blue-900 to-slate-900',
      'green': 'from-slate-900 via-emerald-900 to-slate-900',
      'red': 'from-slate-900 via-red-900 to-slate-900',
      'yellow': 'from-slate-900 via-yellow-900 to-slate-900',
      'pink': 'from-slate-900 via-pink-900 to-slate-900',
      'orange': 'from-slate-900 via-orange-900 to-slate-900',
      'teal': 'from-slate-900 via-teal-900 to-slate-900',
    };

    const color = colorMap[theme];

    try {
      await updateBoard(boardId, { color } as any);
      await logActivity(boardId, 'theme_changed', {
        theme: theme
      });
      toast.success(`Theme changed to ${theme}`);
    } catch (error) {
      console.error('Failed to save theme:', error);
      toast.error('Failed to save theme');
      // Revert theme on error
      setCurrentTheme(board.color ?
        Object.entries(colorMap).find(([_, c]) => c === board.color)?.[0] as ThemeOption || 'default'
        : 'default'
      );
    }
  };

  if (isAuthLoading || (isDataLoading && !board)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin-slow"></div>
          </div>
        </div>
        <p className="text-slate-400 animate-pulse text-sm font-medium">Loading board data...</p>
      </div>
    );
  }

  if (!board) {
    const isOffline = !navigator.onLine;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 mobile-safe-padding">
        <div className="text-center glass-strong rounded-xl p-6 max-w-md w-full mx-4 ">
          <div className="flex justify-center mb-4">
            {isOffline ? (
              <WifiOff className="w-12 h-12 text-destructive animate-pulse" />
            ) : (
              <Search className="w-12 h-12 text-muted-foreground opacity-20" />
            )}
          </div>
          <h1 className="text-xl font-bold mb-3 text-white">
            {isOffline ? "Connection Error" : "Board not found"}
          </h1>
          <p className="text-sm mb-6 text-slate-400">
            {isOffline
              ? "Unable to load board data. Please check your internet connection and try again."
              : "The board you're looking for doesn't exist or you don't have permission to view it."}
          </p>
          <div className="flex flex-col gap-3">
            {isOffline ? (
              <Button
                onClick={() => window.location.reload()}
                className="gradient-primary hover-glow w-full smooth-transition compact-button"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry Connection
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/dashboard')}
                className="gradient-primary hover-glow w-full smooth-transition compact-button"
              >
                Go to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-white/10 px-4 py-2 compact-header mobile-safe-padding">
        <div className="flex items-center justify-between max-w-full gap-2">
          {/* Left Section */}
          <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[40%]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="h-8 px-2 glass hover-glow flex-shrink-0 smooth-transition group compact-button"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 smooth-transition" />
            </Button>

            {isEditingTitle ? (
              <Input
                value={boardTitle}
                onChange={(e) => setBoardTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                className="h-8 glass rounded-lg text-sm font-bold flex-1 min-w-0 max-w-[180px]"
                autoFocus
              />
            ) : (
              <h1
                className={`text-base font-bold py-1.5 px-2 rounded-lg min-w-0 truncate flex-1 max-w-[180px] ${userCanEdit(board)
                  ? 'cursor-pointer hover:text-purple-300 transition-all hover:bg-white/5 smooth-transition'
                  : 'cursor-default'
                  }`}
                onClick={() => userCanEdit(board) && setIsEditingTitle(true)}
                role={userCanEdit(board) ? "button" : undefined}
                tabIndex={userCanEdit(board) ? 0 : undefined}
                onKeyDown={(e) => userCanEdit(board) && e.key === 'Enter' && setIsEditingTitle(true)}
                title={userCanEdit(board) ? 'Click to edit board title' : 'Only Admin, PM, or Instructor can edit the board title'}
              >
                {boardTitle}
              </h1>
            )}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Board Deadline with Calendar Icon Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`flex items-center gap-1.5 px-2 py-1 text-xs glass hover-glow rounded-lg smooth-transition compact-button ${boardDeadline && new Date(boardDeadline) < new Date() ? 'border border-red-500/50' : ''
                    }`}
                  title={boardDeadline ? `Project deadline: ${new Date(boardDeadline).toLocaleString()}` : 'Set project deadline'}
                >
                  <CalendarIcon className={`w-3 h-3 ${boardDeadline && new Date(boardDeadline) < new Date() ? 'text-red-400' : ''}`} />
                  {boardDeadline ? (
                    <>
                      <span className="hidden sm:inline">
                        {new Date(boardDeadline).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                      {new Date(boardDeadline) < new Date() && (
                        <span className="text-red-400 font-semibold">Due</span>
                      )}
                    </>
                  ) : (
                    <span className="hidden sm:inline text-purple-300">Due Date</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 glass-strong border-white/10 pointer-events-auto" align="end">
                <div className="p-3 space-y-3">
                  <label className="text-xs font-medium block">Board Due Date & Time</label>
                  <Input
                    type="datetime-local"
                    value={boardDeadline}
                    onChange={(e) => setBoardDeadline(e.target.value)}
                    className="glass h-8 text-xs focus:ring-2 focus:ring-purple-500 pointer-events-auto"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveBoardDeadline}
                      size="sm"
                      className="flex-1 gradient-primary hover-glow text-xs"
                    >
                      Save Due Date
                    </Button>
                    {boardDeadline && (
                      <Button
                        onClick={async () => {
                          setBoardDeadline('');
                          if (boardId) {
                            await updateBoard(boardId, { dueDate: '' } as any);
                            await logActivity(boardId, 'board_deadline_removed', {});
                            toast.success('Due date cleared');
                          }
                        }}
                        variant="ghost"
                        size="sm"
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Users Icon - Always include PM in displayed members with Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-1 glass px-1.5 py-1 rounded-lg cursor-pointer hover:bg-white/10 smooth-transition group">
                  <div className="flex -space-x-1.5">
                    {(() => {
                      // Ensure PM is always in the members list for display
                      const pmEmail = (board as any).userEmail;
                      const displayMembers = [...board.members];

                      // Add PM if not already in members
                      if (pmEmail && !displayMembers.find(m => m.email === pmEmail)) {
                        displayMembers.unshift({ email: pmEmail, role: 'manager' as const });
                      }

                      return displayMembers.slice(0, 3).map((member, idx) => (
                        <Avatar key={idx} className="w-5 h-5 border-2 border-background group-hover:border-white/20 smooth-transition">
                          <AvatarFallback className="gradient-secondary text-[8px] text-white">
                            {member.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ));
                    })()}
                  </div>
                  <span className="text-xs text-purple-300 hidden sm:inline group-hover:text-white smooth-transition">
                    {(() => {
                      const pmEmail = (board as any).userEmail;
                      const hasPmInMembers = board.members.find(m => m.email === pmEmail);
                      return hasPmInMembers ? board.members.length : board.members.length + 1;
                    })()}
                  </span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-strong border-white/15 w-64 backdrop-blur-xl shadow-2xl" align="center">
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-xs font-semibold text-blue-300 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Board Members
                  </p>
                  <p className="text-[10px] text-blue-400 mt-0.5">Who can view and participate</p>
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar-vertical p-1.5 space-y-1">
                  {(() => {
                    const pmEmail = (board as any).userEmail;
                    const allMembers = [...board.members];
                    if (pmEmail && !allMembers.find(m => m.email === pmEmail)) {
                      allMembers.unshift({ email: pmEmail, role: 'manager' as const });
                    }

                    return allMembers.map((member, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white/5 smooth-transition group/item">
                        <Avatar className="w-8 h-8 border border-white/10">
                          <AvatarFallback className="gradient-primary text-xs font-bold text-white">
                            {member.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate group-hover/item:text-blue-300 smooth-transition">
                            {member.email.split('@')[0]}
                          </p>
                          <p className="text-[10px] text-purple-300 truncate">
                            {member.email}
                          </p>
                        </div>
                        <Badge className={`text-[9px] px-1.5 py-0 capitalize ${member.role === 'manager' || member.email === (board as any).userEmail
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : member.role === 'instructor'
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          }`}>
                          {member.email === (board as any).userEmail ? 'Creator' : member.role || 'member'}
                        </Badge>
                      </div>
                    ));
                  })()}
                </div>
                <div className="px-3 py-2 border-t border-white/10 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-[10px] text-blue-300 hover:text-white hover:bg-white/10 rounded-md smooth-transition"
                    onClick={() => setShowShareModal(true)}
                  >
                    <Share2 className="w-3 h-3 mr-1.5" />
                    Manage Board Access
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Status Toggle - Admin/Manager Only */}
            {(user?.role === 'admin' || board.members.find(m => m.email === user?.email && m.role === 'manager')) && (
              <Button
                size="sm"
                onClick={async () => {
                  const newStatus = board.status === 'done' ? 'ongoing' : 'done';

                  try {
                    // Update in database first - this will update context state automatically
                    const updatedBoard = await updateBoard(boardId!, { status: newStatus });

                    // Log activity
                    await logActivity(boardId, 'board_status_changed', {
                      oldStatus: board.status,
                      newStatus: newStatus
                    });

                    // Don't manually set local state - context sync will handle it
                    // The useEffect that syncs from boards context will update local board state

                    if (newStatus === 'done') {
                      toast.success('🎉 Congratulations! Project marked as complete!', {
                        description: 'You have successfully completed this project. Great work!',
                        duration: 5000,
                      });
                    } else {
                      toast.success('Project status updated to ongoing');
                    }
                  } catch (error) {
                    console.error('Error updating status:', error);
                    toast.error('Failed to update status');
                  }
                }}
                className={`h-8 px-2 text-xs smooth-transition ${board.status === 'done'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'glass hover-glow'
                  }`}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                {board.status === 'done' ? 'Done' : 'Mark Done'}
              </Button>
            )}

            {/* Theme Selector */}
            <ThemeSelector currentTheme={currentTheme} onThemeChange={handleThemeChange} />

            {/* Share Button */}
            <Button
              size="sm"
              className="gradient-primary hover-glow h-8 px-2 smooth-transition compact-button"
              onClick={() => setShowShareModal(true)}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline ml-1">Share</span>
            </Button>
          </div>
        </div>
      </div>

      {/* DnD Context and Scrollable Content */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`fixed top-0 left-0 right-0 bottom-0 flex flex-col bg-gradient-to-br ${themeConfig[currentTheme]} text-white mobile-tap-highlights pt-14 overflow-hidden`}>
          {/* Content Area */}
          <div className="flex-1 min-h-0 pt-5 sm:pt-5 px-4 sm:px-6 pb-0 overflow-hidden">
            {/* Horizontal scroll only */}
            <div className="h-[calc(100%-0px)] overflow-x-auto overflow-y-hidden custom-scrollbar -mx-4 sm:-mx-6">
              <div className="inline-flex items-start h-full gap-4 sm:gap-4 min-w-max pb-3.5 pl-4 sm:pl-4 pr-4 sm:pr-4">
                {/* Lists Container */}
                <SortableContext
                  items={board.lists.map((l) => `list-${l.id}`)}
                  strategy={horizontalListSortingStrategy}
                >
                  {board.lists.map((list) => (
                    <KanbanList
                      key={list.id}
                      list={list}
                      editingListId={editingListId}
                      editingListTitle={editingListTitle}
                      onStartEdit={(id, title) => {
                        setEditingListId(id);
                        setEditingListTitle(title);
                      }}
                      onSaveEdit={handleRenameList}
                      onCancelEdit={() => {
                        setEditingListId(null);
                        setEditingListTitle('');
                      }}
                      onDelete={(id) => setDeleteConfirm({ type: 'list', id })}
                      onAddCard={handleAddCard}
                      onCardClick={(card) => handleCardClick(card, list.id)}
                      onDeleteCard={(cardId) =>
                        setDeleteConfirm({ type: 'card', id: cardId, listId: list.id })
                      }
                      setEditingListTitle={setEditingListTitle}
                      onViewComments={handleViewComments}
                      onDownloadAttachment={handleDownloadAttachment}
                      onViewDescription={handleViewDescription}
                      onMoveAllCards={handleMoveAllCards}
                      availableLists={board.lists}
                    />
                  ))}
                </SortableContext>

                {/* Add List Column */}
                <div className={`flex-shrink-0 ${isMobile ? 'w-64' : 'w-72'} h-full flex flex-col`}>
                  {isAddingList ? (
                    <div className="glass-strong rounded-xl p-3 h-fit compact-list">
                      <Input
                        value={newListTitle}
                        onChange={(e) => setNewListTitle(e.target.value)}
                        placeholder="Enter list title..."
                        className="glass mb-3 h-8 rounded-lg border-white/20 focus:border-purple-400 smooth-transition text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddList();
                          if (e.key === 'Escape') {
                            setNewListTitle('');
                            setIsAddingList(false);
                          }
                        }}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleAddList}
                          size="sm"
                          className="gradient-primary h-8 flex-1 smooth-transition hover:scale-105 text-xs compact-button"
                          disabled={!newListTitle.trim() || isSubmittingList} // Disabled when empty or submitting
                        >
                          {isSubmittingList ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                              Add List
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => {
                            setNewListTitle('');
                            setIsAddingList(false);
                          }}
                          size="sm"
                          variant="ghost"
                          className="h-8 glass smooth-transition compact-button"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      className={`w-full h-12 glass rounded-xl hover-glow justify-center text-base group smooth-transition flex-shrink-0 compact-button`}
                      onClick={() => {
                        setNewListTitle('');
                        setIsAddingList(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 smooth-transition" />
                      <span className="hidden sm:inline">Add another list</span>
                      <span className="sm:hidden">Add list</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Menu */}
          <MobileMenu
            onShare={() => setShowShareModal(true)}
            onAddList={() => {
              setNewListTitle('');
              setIsAddingList(true);
            }}
            isAddingList={isAddingList}
          />

          {/* Enhanced Drag Overlay */}
          <DragOverlay>
            {activeCard && (
              <div className={`compact-card glass shadow-2xl opacity-90 transform rotate-3 scale-105 ${isMobile ? 'w-64' : 'w-72'} smooth-transition drag-transition drag-preview`}>
                <h4 className="font-semibold text-xs mb-1.5 line-clamp-2">{activeCard.title}</h4>
                <CompactCardFooter
                  card={activeCard}
                  onViewComments={(e) => handleViewComments(activeCard, e)}
                  onDownloadAttachment={(name, e) => handleDownloadAttachment(name, e)}
                  onViewDescription={(e) => handleViewDescription(activeCard, e)}
                />
              </div>
            )}
          </DragOverlay>
        </div>

        {/* Enhanced Modals */}
        <EnhancedShareBoardModal
          board={board}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onUpdateMembers={(members) => updateBoardMembers(boardId!, members)}
          onRemoveMember={(memberEmail) => {
            const updatedMembers = board?.members?.filter((m) => m.email !== memberEmail) || [];
            updateBoardMembers(boardId!, updatedMembers);
          }}
          canChangeRoles={userCanChangeRoles(board)}
        />

        {selectedCard && (
          <EnhancedCardModal
            card={selectedCard.card}
            isOpen={showCardModal}
            onClose={() => {
              setShowCardModal(false);
              setSelectedCard(null);
              // Force a fresh sync from the database whenever the modal closes
              // This guarantees the user sees their changes when they reopen any card
              if (user?.email) {
                fetchBoards(user.email, user.role);
              }
            }}
            // In the Board component's onSave handler for new cards
            onSave={async (updates) => {
              if (selectedCard.card.id === 'temp-new-card') {
                let googleEventId = '';

                // Sync to Google Calendar for new cards if due date is set
                const isGoogleUser = user?.authProvider === 'google';
                const hasDueDate = !!updates.dueDate;
                const hasAssignedMembers = (updates.assignedMembers || []).length > 0;

                if (hasDueDate && (hasAssignedMembers || isGoogleUser)) {
                  try {
                    const targetMembers = [...(updates.assignedMembers || [])];
                    if (isGoogleUser && user?.email && !targetMembers.includes(user.email)) {
                      targetMembers.push(user.email);
                    }

                    const eventId = await addEventToGoogleCalendar({
                      title: updates.title || 'Untitled Card',
                      description: updates.description || '',
                      dueDate: updates.dueDate as string,
                      assignedMembers: targetMembers,
                    });

                    if (eventId) {
                      googleEventId = eventId;
                      toast.success("Task added to Google Calendar ✅");
                    } else {
                      toast.warning("Card created, but failed to sync with Google Calendar.");
                    }
                  } catch (err: any) {
                    console.error("❌ Failed to sync new card to Google Calendar:", err);
                    const errorMsg = typeof err === 'string' ? err : err?.error || err?.message || '';
                    const toastId = `google-sync-cancel-${Date.now()}`;

                    if (errorMsg === 'popup_closed' || errorMsg.includes('popup_closed')) {
                      toast.error("Google sync cancelled. Card created, but not synced to Calendar.", {
                        duration: 6000,
                        id: toastId
                      });
                    } else {
                      toast.warning("Card created, but calendar sync failed.");
                    }
                  }
                }

                const newCard: CardType = {
                  id: `card-${Date.now()}`,
                  title: updates.title || 'Untitled Card',
                  description: updates.description || '',
                  labels: updates.labels || [],
                  assignedMembers: updates.assignedMembers || [],
                  attachments: updates.attachments || [],
                  comments: updates.comments || [],
                  dueDate: updates.dueDate || '',
                  googleEventId: googleEventId,
                };

                await addCard(boardId!, selectedCard.listId, newCard);
                toast.success('Card created');
              } else {
                handleUpdateCard(selectedCard.listId, selectedCard.card.id, updates);
              }
            }}
            onDelete={() => {
              if (selectedCard.card.id !== 'temp-new-card') {
                setDeleteConfirm({ type: 'card', id: selectedCard.card.id, listId: selectedCard.listId });
              }
            }}
            boardMembers={board.members}
            lists={board.lists}
            currentListId={selectedCard.listId}
            onMoveCard={(targetListId) => {
              if (selectedCard.card.id !== 'temp-new-card') {
                const sourceList = board.lists.find(l => l.id === selectedCard.listId);
                const cardIndex = sourceList?.cards.findIndex(c => c.id === selectedCard.card.id) || 0;

                moveCard(boardId!, selectedCard.card.id, selectedCard.listId, targetListId, 0);
                setSelectedCard({ ...selectedCard, listId: targetListId });
              }
            }}
            board={board}
          />
        )}

        {commentsCard && (
          <CommentsModal
            card={commentsCard}
            isOpen={showCommentsModal}
            onClose={() => {
              setShowCommentsModal(false);
              setCommentsCard(null);
            }}
          />
        )}

        {descriptionCard && (
          <DescriptionModal
            card={descriptionCard}
            isOpen={showDescriptionModal}
            onClose={() => {
              setShowDescriptionModal(false);
              setDescriptionCard(null);
            }}
          />
        )}

        {deleteConfirm && (
          <ConfirmDialog
            isOpen={!!deleteConfirm}
            onClose={() => setDeleteConfirm(null)}
            onConfirm={
              deleteConfirm?.type === 'list'
                ? handleDeleteList
                : deleteConfirm?.type === 'card'
                  ? handleDeleteCard
                  : handleRemoveMember
            }
            title={confirmDialogProps?.title || ''}
            description={confirmDialogProps?.description || ''}
          />
        )}
      </DndContext>
    </>
  );
};

export default Board;
