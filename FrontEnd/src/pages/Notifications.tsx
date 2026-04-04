import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
   Bell,
  BellOff,
  Trash2,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  LayoutDashboard,
  MessageSquare,
  KanbanSquare,
} from 'lucide-react';
import { toast } from 'sonner';

const Notifications = () => {
  const { notifications, markNotificationRead, markAllNotificationsRead, deleteNotification, clearAllNotifications, fetchNotifications } = useApp();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [notificationsPerPage] = useState(10);

  // Ref to track if we should scroll to top on page change
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMarkRead = async (id: string) => {
    // Ensure ID is properly stringified
    const notificationId = String(id || '').trim();
    console.log("📝 handleMarkRead called with ID:", notificationId);
    
    if (!notificationId) {
      console.error("❌ No ID provided to handleMarkRead");
      toast.error('Invalid notification ID');
      return;
    }
    
    try {
      const success = await markNotificationRead(notificationId);
      if (success) {
        toast.success('Marked as read');
      }
    } catch (error) {
      console.error("❌ Error in handleMarkRead:", error);
      toast.error('Failed to mark as read');
    }
  };

  const handleClearAll = () => {
    if (notifications.length === 0) return;
    clearAllNotifications(userEmail);
    toast.success('All notifications cleared');
    setClearAllConfirm(false);
  };

  const handleMarkAllRead = async () => {
    if (!userEmail || notifications.filter(n => !n.read).length === 0) return;
    try {
      await markAllNotificationsRead(userEmail);
      toast.success('All notifications marked as read');
    } catch (error) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id: string) => {
    const notificationId = id || (notifications.find(n => n._id === id)?._id);
    if (notificationId) {
      await deleteNotification(notificationId);
      toast.success('Notification deleted');
      setDeleteConfirm(null);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirm(id);
  };

  // Pagination calculations
  const indexOfLastNotification = currentPage * notificationsPerPage;
  const indexOfFirstNotification = indexOfLastNotification - notificationsPerPage;
  const currentNotifications = notifications.slice(indexOfFirstNotification, indexOfLastNotification);
  const totalPages = Math.ceil(notifications.length / notificationsPerPage);

  // Pagination handlers
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    }
  };

  // Reset to first page when notifications change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0) {
      setCurrentPage(1);
    }
  }, [notifications.length, totalPages, currentPage]);

  // Scroll to top smoothly when page changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Backend logic
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      const email = parsedUser.email;
      setUserEmail(email);
      fetchNotifications(email);
      const interval = setInterval(() => fetchNotifications(email), 10000);
      return () => clearInterval(interval);
    }
  }, []);

 const getNotificationIcon = (type: string) => {
  switch (type) {
    case "new_signup":
    case "welcome":
      return <UserPlus className="w-4 h-4" />;

    case "board_added":
    case "board_created":
      return <LayoutDashboard className="w-4 h-4" />;

    case "card_assigned":
    case "card_moved":
    case "card_created":
    case "card_updated":
      return <KanbanSquare className="w-4 h-4" />;

    case "card_comment":
      return <MessageSquare className="w-4 h-4" />;

    default:
      return <Bell className="w-4 h-4" />;
  }
};



  return (
    // MAIN CONTAINER - Same structure as Dashboard
    <div className="h-screen flex flex-col overflow-hidden p-2 sm:p-3 md:p-4 space-y-3">
      {/* Header Section - Same as Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
        {/* Title and Subtitle */}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gradient truncate">
            Notifications
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm truncate">
            {unreadCount > 0 
              ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` 
              : 'All caught up! 🎉'
            }
          </p>
        </div>

        {/* Action Buttons */}
        {notifications.length > 0 && (
          <div className="flex-shrink-0 mt-2 sm:mt-0 flex gap-2">
            {/* Mark All as Read Button */}
            {unreadCount > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleMarkAllRead}
                className="glass w-full sm:w-auto hover:bg-white/10 h-8 text-xs"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Mark All Read
              </Button>
            )}
            
            {/* Clear All Button */}
            <Dialog open={clearAllConfirm} onOpenChange={setClearAllConfirm}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="glass w-full sm:w-auto hover:bg-white/10 h-8 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Clear All
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-strong border-border max-w-[95vw] rounded-lg sm:rounded-xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl">Clear All Notifications</DialogTitle>
                  <DialogDescription className="text-sm sm:text-base">
                    Are you sure you want to clear all notifications? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => setClearAllConfirm(false)} 
                    className="glass w-full sm:w-auto order-2 sm:order-1 text-sm"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleClearAll} 
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto order-1 sm:order-2 text-sm"
                    size="sm"
                  >
                    Clear All
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Pagination - Same as Dashboard */}
      {notifications.length > 0 && (
        <div className="flex items-center justify-between py-1 flex-shrink-0">
          <span className="text-[10px] sm:text-xs text-muted-foreground font-medium pl-1">
            {indexOfFirstNotification + 1}-{Math.min(indexOfLastNotification, notifications.length)} of {notifications.length}
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

      {/* Notifications List - Wrapped in Card like Dashboard */}
      <Card className="glass-strong overflow-hidden border-0 sm:border flex-1 flex flex-col min-h-0">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2"
        >
          {notifications.length === 0 ? (
            <Card className="glass-strong p-4 sm:p-6 md:p-8 text-center">
              <BellOff className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 text-muted-foreground opacity-50" />
              <h3 className="text-base sm:text-lg font-bold mb-1">No notifications</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">You're all caught up!</p>
            </Card>
          ) : (
            currentNotifications.map((notification) => (
              <Card
                key={notification.id || notification._id}
                className={`glass-strong p-2.5 sm:p-3 transition-all duration-200 ${
                  !notification.read 
                    ? 'border-l-4 border-l-primary hover-glow shadow-sm hover:shadow-md' 
                    : 'opacity-80 hover:opacity-100 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="relative">
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          notification.read ? "bg-muted" : "gradient-primary pulse-glow"
                        }`}
                      >
                        <div className={notification.read ? "text-muted-foreground" : "text-white"}>
                          {getNotificationIcon(notification.type)}
                        </div>
                      </div>
                      {!notification.read && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-destructive rounded-full"></div>
                      )}
                    </div>


                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={`font-medium text-xs sm:text-sm break-words leading-snug ${
                        !notification.read ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {notification.message}
                      </p>
                      {(notification.type === 'board_added' || notification.type === 'board_created') && notification.boardId && (
                        <a
                          href={`/board/${notification.boardId}`}
                          className="text-[10px] xs:text-xs text-primary hover:underline font-medium inline-block mt-0.5"
                        >
                          {notification.type === 'board_added' ? 'Go to Board →' : 'View Board →'}
                        </a>
                      )}
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {new Date(notification.createdAt || notification.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {!notification.read && (
              <>
                {/* Desktop mark read button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMarkRead(String(notification._id || notification.id || ''))}
                  className="hidden xs:inline-flex items-center h-6 px-2 text-xs"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  <span>Read</span>
                </Button>
                {/* Mobile mark read button - icon only */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMarkRead(String(notification._id || notification.id || ''))}
                  className="xs:hidden h-6 w-6 p-0 flex-shrink-0"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-6 w-6 p-0 flex-shrink-0"
              onClick={() => handleDeleteClick(String(notification.id || notification._id || ''))}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </Card>

      {/* Delete Single Notification Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="glass-strong border-border max-w-[95vw] rounded-lg sm:rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Delete Notification</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Are you sure you want to delete this notification? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirm(null)} 
              className="glass w-full sm:w-28 order-2 sm:order-1 text-sm"
              size="sm"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-28 order-1 sm:order-2 text-sm"
              size="sm"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Scrollbar Styles - Same as Dashboard */}
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

export default Notifications;