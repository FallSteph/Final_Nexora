import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Paperclip, Search, Users, Calendar as CalendarIcon, Clock, Eye, Upload, MessageCircle, Trash2, FileImage, FileText, File, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Card as CardType, List, Board as BoardType } from '@/context/AppContext';
import { 
  addEventToGoogleCalendar, 
  updateGoogleCalendarEvent,
  ensureAuthorized 
} from '@/types/google';
import { 
  uploadAttachmentToGoogleDrive, 
  getGoogleAccessToken 
} from '@/types/googleDriveUploader';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Attachment {
  id: string;
  name: string;
  size: string;
  type: string;
  url: string;
  drive?: boolean;
  driveId?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

interface ModalComment {
  id: string;
  user: string;
  userEmail?: string;
  text: string;
  timestamp: string | Date;
}

export interface EnhancedCardModalProps {
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
  user?: any;
  sendNotification?: any;
  onBoardUpdated?: (board: any) => void;
  logActivity?: any;
  API_URL?: string;
}

const AttachmentThumbnailViewer = ({
  attachment,
  onClose
}: {
  attachment: Attachment;
  onClose: () => void;
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="absolute top-4 right-4 z-10">
          <button onClick={onClose} className="p-2 bg-black/50 hover:bg-red-500 rounded-full text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-4">{attachment.name}</h3>
            {attachment.type?.startsWith('image/') ? (
               <img src={attachment.url} alt={attachment.name} className="max-w-full max-h-[70vh] object-contain mx-auto" />
            ) : (
               <div className="flex flex-col items-center justify-center h-64">
                   <File className="w-16 h-16 text-gray-400 mb-4" />
                   <p className="text-gray-300">Preview not available for this file type.</p>
                   <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="mt-4 text-blue-400 hover:text-blue-300 flex items-center gap-2">
                       <ExternalLink className="w-4 h-4" /> Open Externally
                   </a>
               </div>
            )}
        </div>
      </div>
    </div>
  );
};


export const EnhancedCardModal = ({
    card,
    isOpen,
    onClose,
    onSave,
    onDelete,
    boardMembers,
    lists = [],
    currentListId,
    onMoveCard,
    board,
    sendNotification,
    onBoardUpdated
  }: EnhancedCardModalProps) => {
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

    // FIXED: Enhanced handleAddComment function - saves to backend immediately
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

      // Save to backend immediately
      try {
        if (cardId && cardId !== 'temp-new-card' && boardId && listId) {
          const token = localStorage.getItem('token');
          
          const response = await axios.post(
            `${API_URL}/api/boards/${boardId}/lists/${listId}/cards/${cardId}/comments`,
            {
              user: currentUserName,
              text: comment.text,
              timestamp: comment.timestamp
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (response.status === 201 || response.status === 200) {
            // Trigger parent to update the context state with the returned board
            if (onBoardUpdated && response.data) {
              onBoardUpdated(response.data);
            }

            // Notify assigned members asynchronously (fire-and-forget) to prevent UI delay
            const notificationPromises = assignedMembers
              .filter(member => member !== currentUserEmail)
              .map(member => 
                sendNotification(
                  member,
                  'card_comment',
                  {
                    boardTitle: board?.title,
                    cardTitle: title,
                    cardId: cardId,
                    commentText: comment.text,
                    senderName: currentUserName,
                  }
                )
              );
              
            Promise.all(notificationPromises).catch(console.error);
            toast.success("Comment posted successfully!");
          } else {
            toast.error("Failed to save comment");
            setComments(comments.filter(c => c.id !== comment.id));
          }
        } else {
          toast.info("Comment added locally - will be saved when card is created");
        }
      } catch (error: any) {
        console.error('Failed to save comment:', error);
        toast.error("Failed to save comment. Please try again.");
        setComments(comments.filter(c => c.id !== comment.id));
      }
    };

    const handleSave = async () => {
      if (!title.trim()) {
        toast.error('Card title is required');
        return;
      }

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



        onClose();
      } catch (error) {
        console.error('Failed to save card:', error);
        toast.error('Failed to save card. Please try again.');
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
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1.5"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    {card.id === 'temp-new-card' ? 'Create Card' : 'Save Changes'}
                    {attachments.length > 0 && !isUploading && (
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
