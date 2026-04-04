import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileBarChart } from "lucide-react";
import { generateAnalyticsPDF, type PdfScope } from "@/types/pdfGenerator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  FolderKanban,
  Users,
  ArrowUpDown,
  Edit,
  Archive,
  Search,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Calendar,
  Activity,
  ArrowDownWideNarrow,
  Clock,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type Board = import("@/context/AppContext").Board;
type SortField = "name" | "creation" | "status" | "due";

const Dashboard = () => {
  const { user } = useAuth();
  const { boards, setBoards, addBoard, updateBoard, deleteBoard } = useApp();
  const navigate = useNavigate();

  // Dialog & PDF state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [permanentDeleteDialogOpen, setPermanentDeleteDialogOpen] = useState(false);
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);
  const [pdfScope, setPdfScope] = useState<PdfScope>("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("creation");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [mobileSortOpen, setMobileSortOpen] = useState(false);

  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [originalBoardStatus, setOriginalBoardStatus] = useState<string>('ongoing');
  const [boardToDelete, setBoardToDelete] = useState<string | null>(null);
  const [boardToPermanentDelete, setBoardToPermanentDelete] = useState<string | null>(null);
  const [deletedBoards, setDeletedBoards] = useState<Board[]>([]);

  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardDescription, setNewBoardDescription] = useState("");

  const ITEMS_PER_PAGE = 6;
  // Separate pagination for each section
  const [createdPage, setCreatedPage] = useState(1);
  const [sharedPage, setSharedPage] = useState(1);
  const [allBoardsPage, setAllBoardsPage] = useState(1);
  const [instructorBoardsPage, setInstructorBoardsPage] = useState(1);
  const paginate = (items: Board[], page: number) => {
  const start = (page - 1) * ITEMS_PER_PAGE;
  return items.slice(start, start + ITEMS_PER_PAGE);
};

  const scrollRef = useRef<HTMLDivElement>(null);

const handleGeneratePDF = async () => {
  try {
    const res = await fetch(`http://localhost:5000/api/report/analytics?scope=${pdfScope}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error("Failed to fetch analytics");
    
    const { boards: fetchedBoards, users: fetchedUsers } = await res.json();
    
    generateAnalyticsPDF(fetchedBoards, fetchedUsers, pdfScope);
    toast.success("PDF generated successfully!");
    setAnalyticsDialogOpen(false);
  } catch (error) {
    toast.error("Failed to generate PDF");
    console.error(error);
  }
};


  // Categorize boards
  const createdBoards = boards.filter((b) => {
    const matchesSearch =
      (b.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && b.userEmail === user?.email;
  });

  const sharedBoards = boards.filter((b) => {
    const matchesSearch =
      (b.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const isNotCreator = b.userEmail !== user?.email;
    const isMember = b.members?.some((member) => member.email === user?.email);
    return matchesSearch && isNotCreator && isMember;
  });

  // Boards where user is assigned as instructor (My Handle Classes/Projects)
  const instructorBoards = boards.filter((b) => {
    const matchesSearch =
      (b.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const isInstructor = b.members?.some(
      (member) => member.email === user?.email && member.role === 'instructor'
    );
    return matchesSearch && isInstructor;
  });

  // All boards for admin (excluding created and shared boards to avoid duplicates)
  const createdAndSharedIds = new Set([
    ...createdBoards.map(b => b.id || b._id),
    ...sharedBoards.map(b => b.id || b._id),
    ...instructorBoards.map(b => b.id || b._id)
  ]);
  
  const allOtherBoards = boards.filter((b) => {
    const matchesSearch =
      (b.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && !createdAndSharedIds.has(b.id || b._id);
  });

  // Sort function
  const getCreationTime = (board: Board) =>
    board.createdAt ? new Date(board.createdAt).getTime() : 0;

  const sortBoards = (boardList: Board[]) => {
    return [...boardList].sort((a, b) => {
      if (sortField === "name") {
        return sortOrder === "asc"
          ? (a.title || "").localeCompare(b.title || "")
          : (b.title || "").localeCompare(a.title || "");
      } else if (sortField === "status") {
        // Sort by status (Done vs Ongoing)
        const statusA = a.status || 'ongoing';
        const statusB = b.status || 'ongoing';
        return sortOrder === "asc"
          ? statusA.localeCompare(statusB)
          : statusB.localeCompare(statusA);
      } else if (sortField === "due") {
        // Sort by due date (Infinity if no due date)
        const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      } else {
        const timeA = getCreationTime(a);
        const timeB = getCreationTime(b);
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      }
    });
  };

  const sortedCreatedBoards = sortBoards(createdBoards);
  const sortedSharedBoards = sortBoards(sharedBoards);
  const sortedInstructorBoards = sortBoards(instructorBoards);
  const sortedAllOtherBoards = sortBoards(allOtherBoards);

  // Pagination helpers
  const getPaginatedBoards = (boardList: Board[], currentPage: number) => {
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    return boardList.slice(indexOfFirstItem, indexOfLastItem);
  };

  const getTotalPages = (boardList: Board[]) => Math.ceil(boardList.length / ITEMS_PER_PAGE);

  // Add this helper function at the top of Dashboard component
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  } : { 'Content-Type': 'application/json' };
};


  // Reset pagination on search/sort change
  useEffect(() => {
    setCreatedPage(1);
    setSharedPage(1);
    setAllBoardsPage(1);
    setInstructorBoardsPage(1);
  }, [searchQuery, sortField, sortOrder]);

  // Load active boards
  useEffect(() => {
    const loadBoards = async () => {
      if (!user) return;
      try {
        const res = await fetch(
          user.role === "admin"
            ? "http://localhost:5000/api/boards?deleted=false"
            : `http://localhost:5000/api/boards?userEmail=${user.email}&includeMembers=true&deleted=false`,
        {
          headers: getAuthHeaders()  // Add headers here
        }
          );
        if (!res.ok) throw new Error("Failed to load boards");
        const data = await res.json();
        
        const normalizedBoards = data.map((board: any) => ({
          ...board,
          id: board._id,
          members: (board.members || []).map((m: any) => typeof m === 'string' ? { email: m } : m),
          lists: (board.lists || []).map((list: any) => ({
            ...list,
            id: list._id,
            cards: (list.cards || []).map((card: any) => ({ ...card, id: card._id })),
          })),
        }));

        setBoards(normalizedBoards);
      } catch (err) {
        toast.error("Failed to load boards");
      }
    };
    loadBoards();
  }, [user, setBoards]);

  // Load deleted boards
  useEffect(() => {
    const loadDeletedBoards = async () => {
      if (!user) return;
      try {
        const res = await fetch(
          user.role === "admin"
            ? "http://localhost:5000/api/boards?deleted=true"
            : `http://localhost:5000/api/boards?userEmail=${user.email}&includeMembers=true&deleted=true`,
          {
            headers: getAuthHeaders()
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        
        const normalizedDeletedBoards = data.map((board: any) => ({
          ...board,
          id: board._id,
          members: board.members || [],
          lists: (board.lists || []).map((list: any) => ({
            ...list,
            id: list._id,
            cards: (list.cards || []).map((card: any) => ({
              ...card,
              id: card._id,
            })),
          })),
        }));
        
        setDeletedBoards(normalizedDeletedBoards);
      } catch (err) {
        console.error("Failed to load deleted boards");
      }
    };
    loadDeletedBoards();
  }, [user]);

  // Create board
  const handleCreateBoard = async () => {
    if (!newBoardTitle.trim()) return toast.error("Board title is required");

    // Check Board Creation Limit for non-admins
    if (user?.role !== 'admin') {
      try {
        const config = JSON.parse(localStorage.getItem('app_configuration') || '{}');
        const limit = parseInt(config.BOARD_CREATION_LIMIT || '5');
        
        // Count boards created by the user (not shared)
        const myCreatedBoardsCount = boards.filter(b => b.userEmail === user?.email).length;
        
        if (myCreatedBoardsCount >= limit) {
          toast.error(`Board creation limit reached (${limit}).`, {
            description: "Please contact an admin to increase your limit or delete old boards."
          });
          return;
        }
      } catch (e) {
        console.error("Error checking board limit:", e);
      }
    }

    try {
      const res = await fetch("http://localhost:5000/api/boards", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: newBoardTitle,
          description: newBoardDescription,
          userEmail: user?.email,
        }),
      });

      if (!res.ok) throw new Error("Failed to create board");
      const data = await res.json();

      addBoard({
        _id: data._id,
        id: data._id,  // ✅ Add id field for proper navigation
        title: data.title,
        description: data.description,
        userEmail: data.userEmail,
        createdAt: data.createdAt,
        lists: data.lists || [],
        members: data.members || [],
        color: data.color,
        dueDate: data.dueDate,
        status: data.status,
      });

      toast.success("Board created successfully 🎉");
      setDialogOpen(false);
      setNewBoardTitle("");
      setNewBoardDescription("");
      navigate(`/board/${data._id}`);
    } catch {
      toast.error("Error creating board");
    }
  };

  const handleEditBoard = (board: Board) => {
    setEditingBoard(board);
    setOriginalBoardStatus(board.status || 'ongoing');
    setNewBoardTitle(board.title);
    setNewBoardDescription(board.description || "");
    setEditDialogOpen(true);
  };

  const handleUpdateBoard = async () => {
  if (!editingBoard) return;
  if (!newBoardTitle.trim()) return toast.error("Title is required");

  try {
    const newStatus = editingBoard.status || 'ongoing';
    
    const res = await fetch(`http://localhost:5000/api/boards/${editingBoard.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newBoardTitle,
        description: newBoardDescription,
        status: newStatus,
      }),
    });

    if (!res.ok) throw new Error("Failed to update board");

    const updatedBoard = await res.json();

    updateBoard(editingBoard.id, {
      title: updatedBoard.title,
      description: updatedBoard.description,
      status: updatedBoard.status,
    } as any);

    // Show congratulations animation if status changed to done
    if (originalBoardStatus !== 'done' && newStatus === 'done') {
      toast.success('🎉 Congratulations! Project completed!', {
        description: 'You have successfully marked this project as done. Great work!',
        duration: 5000,
      });
    } else {
      toast.success("Board updated ✨");
    }
    
    setEditDialogOpen(false);
    setEditingBoard(null);
  } catch (err) {
    console.error("Error updating board:", err);
    toast.error("Error updating board");
  }
};

  const handleDeleteClick = (boardId: string) => {
    setBoardToDelete(boardId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteBoard = async () => {
    if (!boardToDelete) return;
    try {
      const res = await fetch(`http://localhost:5000/api/boards/${boardToDelete}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete board");
      
      const board = boards.find(b => b.id === boardToDelete);
      if (board) {
        setDeletedBoards(prev => [...prev, board]);
      }
      
      deleteBoard(boardToDelete);
      toast.success("Board moved to archived projects");
    } catch (err) {
      toast.error("Failed to delete board");
    } finally {
      setDeleteDialogOpen(false);
      setBoardToDelete(null);
    }
  };

  const handleRestoreBoard = async (board: Board) => {
    try {
      const res = await fetch(`http://localhost:5000/api/boards/${board.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted: false, deletedAt: null }),
      });
      
      if (!res.ok) throw new Error("Failed to restore board");
      
      const restoredBoard = await res.json();
      
      const normalizedBoard = {
        ...restoredBoard,
        id: restoredBoard._id,
        members: restoredBoard.members || [],
        lists: (restoredBoard.lists || []).map((list: any) => ({
          ...list,
          id: list._id,
          cards: (list.cards || []).map((card: any) => ({
            ...card,
            id: card._id,
          })),
        })),
      };
      
      setDeletedBoards(prev => prev.filter(b => b.id !== board.id));
      addBoard(normalizedBoard);
      
      toast.success("Board restored");
    } catch (error) {
      toast.error("Failed to restore board");
      console.error("Error restoring board:", error);
    }
  };

  const handlePermanentDeleteClick = (boardId: string) => {
    setBoardToPermanentDelete(boardId);
    setPermanentDeleteDialogOpen(true);
  };

  const handlePermanentDelete = async () => {
    if (!boardToPermanentDelete) return;

    try {
      const res = await fetch(`http://localhost:5000/api/boards/permanent/${boardToPermanentDelete}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to permanently delete board");
      setDeletedBoards(prev => prev.filter(b => b.id !== boardToPermanentDelete));
      toast.success("Board permanently deleted 🗑️");
    } catch {
      toast.error("Error deleting board");
    } finally {
      setPermanentDeleteDialogOpen(false);
      setBoardToPermanentDelete(null);
    }
  };

  const handleOpenBoard = (id: string) => navigate(`/board/${id}`);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setMobileSortOpen(false);
  };

  const [totalUsers, setTotalUsers] = useState(0);

  const analytics = {
    totalBoards: boards.length,
    totalLists: boards.reduce((sum, b) => sum + (b.lists?.length || 0), 0),
    totalCards: boards.reduce(
      (sum, b) =>
        sum + (b.lists || []).reduce((cards, l) => cards + (l.cards?.length || 0), 0),
      0
    ),
    totalUsers,
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/users", {
          headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error("Failed to load users");
        const data = await res.json();
        setTotalUsers(data.length);
      } catch (err) {
        console.error("Error loading users:", err);
        // Silent error for non-admins if they don't have permission
        if (user?.role === "admin") {
          toast.error("Failed to load users");
        }
      }
    };

    if (user) {
      loadUsers();
    }
  }, [user]);

  // Board Card Component
  const BoardCard = ({ board }: { board: Board }) => {
    const isDue = board.dueDate && new Date(board.dueDate) < new Date();
    const isDone = board.status === 'done';
    
    return (
    <Card
      onClick={() => handleOpenBoard(board.id)}
      className="glass-strong p-3 hover-glow cursor-pointer group relative flex flex-col h-full min-h-[140px]"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
            <FolderKanban className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm group-hover:text-gradient transition-all truncate">
                {board.title}
              </h3>
              {/* Show Done badge if status is done (takes priority over Due) */}
              {isDone ? (
                <span className="text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                  Done
                </span>
              ) : isDue ? (
                <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                  Due
                </span>
              ) : board.status === 'ongoing' ? (
                <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                  Ongoing
                </span>
              ) : null}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {board.createdAt 
                ? new Date(board.createdAt).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })
                : 'New'
              }
              {board.dueDate && (
                <span className={`ml-2 ${isDue ? 'text-red-400' : 'text-purple-400'}`}>
                  • Due: {new Date(board.dueDate).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric'
                  })}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1">
        {board.description || "No description"}
      </p>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30">
        <div className="flex -space-x-1.5">
          {board.userEmail && (
            <Avatar className="w-6 h-6 border-2 border-background">
              <AvatarFallback className="gradient-primary text-[10px] text-white">
                {board.userEmail[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          {board.members?.filter(m => m.email !== board.userEmail).slice(0, 2).map((m, i) => (
            <Avatar key={i} className="w-6 h-6 border-2 border-background">
              <AvatarFallback className="gradient-secondary text-[10px] text-white">
                {m.email[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))}
          {board.members && board.members.length > 3 && (
            <div className="w-6 h-6 rounded-full glass flex items-center justify-center text-[10px] text-white border-2 border-background">
              +{board.members.length - 3}
            </div>
          )}
        </div>

        <div className="flex space-x-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              handleEditBoard(board);
            }}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(board.id);
            }}
          >
            <Archive className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

  // Pagination Component
  const Pagination = ({ 
    currentPage, 
    totalPages, 
    onPageChange, 
    totalItems,
    itemsPerPage
  }: { 
    currentPage: number; 
    totalPages: number; 
    onPageChange: (page: number) => void;
    totalItems: number;
    itemsPerPage: number;
  }) => {
    if (totalPages <= 1) return null;
    
    const indexOfFirstItem = (currentPage - 1) * itemsPerPage + 1;
    const indexOfLastItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
          {indexOfFirstItem}-{indexOfLastItem} of {totalItems}
        </span>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-6 w-6 sm:h-7 sm:w-7"
          >
            <ChevronLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
                  onClick={() => onPageChange(pageNumber)}
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
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-6 w-6 sm:h-7 sm:w-7"
          >
            <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  // Board Section Component
  const BoardSection = ({ 
    title, 
    icon: Icon, 
    boards: sectionBoards, 
    currentPage, 
    onPageChange,
    emptyTitle,
    emptyDescription,
    showCreateButton = false
  }: { 
    title: string; 
    icon: any;
    boards: Board[]; 
    currentPage: number; 
    onPageChange: (page: number) => void;
    emptyTitle: string;
    emptyDescription: string;
    showCreateButton?: boolean;
  }) => {
    const paginatedBoards = getPaginatedBoards(sectionBoards, currentPage);
    const totalPages = getTotalPages(sectionBoards);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">({sectionBoards.length})</span>
        </div>
        
        {sectionBoards.length > 0 ? (
          <>
            <div 
              key={currentPage}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-in fade-in slide-in-from-right-8 duration-500 ease-out"
            >
              {paginatedBoards.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
              totalItems={sectionBoards.length}
              itemsPerPage={ITEMS_PER_PAGE}
            />
          </>
        ) : (
          <Card className="glass-strong p-6 text-center">
            <Icon className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
            <h3 className="text-sm font-bold mb-1">{emptyTitle}</h3>
            <p className="text-muted-foreground text-xs mb-3">{emptyDescription}</p>
            {showCreateButton && (
              <Button
                onClick={() => setDialogOpen(true)}
                className="gradient-primary hover-glow h-8 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create Board
              </Button>
            )}
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden p-2 sm:p-3 md:p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gradient truncate">
            Welcome back, {user?.firstName}! 👋
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm truncate">
            Manage your boards and track progress
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto items-center">
          <Button
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            className="glass h-8 text-xs"
            size="sm"
          >
            <Archive className="w-3.5 h-3.5 mr-1.5" />
            Archived {deletedBoards.length > 0 && `(${deletedBoards.length})`}
          </Button>

          <Button
            onClick={() => setAnalyticsDialogOpen(true)}
            className="gradient-primary hover-glow h-8 text-xs"
            size="sm"
          >
            <FileBarChart className="w-3.5 h-3.5 mr-1.5" />
            Report
          </Button>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover-glow w-full sm:w-auto h-8 text-xs" size="sm">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Board
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong border-border max-w-[95vw] sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-lg">Create New Board</DialogTitle>
                <DialogDescription className="text-xs">
                  Create a new Kanban board to organize your tasks.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="title" className="text-xs">Board Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Marketing Campaign"
                    value={newBoardTitle}
                    onChange={(e) => setNewBoardTitle(e.target.value)}
                    className="glass h-8 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="description" className="text-xs">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this board..."
                    value={newBoardDescription}
                    onChange={(e) => setNewBoardDescription(e.target.value)}
                    className="glass text-sm"
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="glass w-full sm:w-auto h-8 text-xs"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateBoard}
                  className="gradient-primary hover-glow w-full sm:w-auto h-8 text-xs"
                  size="sm"
                >
                  Create Board
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Analytics Cards for Admin */}
      {user?.role === "admin" && (
        <div className="grid grid-cols-2 gap-3 flex-shrink-0">
          <Card className="glass-strong p-3 hover-glow flex flex-col justify-center">
            <p className="text-xs text-muted-foreground">Total Boards</p>
            <p className="text-xl font-bold text-gradient mt-0.5">
              {analytics.totalBoards}
            </p>
          </Card>

          <Card className="glass-strong p-3 hover-glow flex flex-col justify-center">
            <p className="text-xs text-muted-foreground">Total Users</p>
            <p className="text-xl font-bold text-gradient mt-0.5">
              {analytics.totalUsers}
            </p>
          </Card>
        </div>
      )}

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between items-stretch sm:items-center flex-shrink-0">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search boards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 glass w-full text-xs h-8 sm:text-sm"
          />
        </div>

        {/* Desktop Sort Dropdown */}
        <div className="hidden sm:block w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="glass h-10 text-sm px-6 flex items-center gap-2 hover:bg-white/5 smooth-transition border-white/10"
              >
                <ArrowDownWideNarrow className="w-4 h-4 text-primary" />
                <span className="font-semibold">Sort by: {
                  sortField === 'name' ? 'Name' : 
                  sortField === 'creation' ? 'Date' : 
                  sortField === 'status' ? 'Status' : 'Due Date'
                }</span>
                <ChevronDown className={`w-4 h-4 opacity-50 transition-transform duration-200 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="glass-strong border-white/15 w-48 backdrop-blur-xl shadow-2xl" align="end">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">
                Sort by
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem 
                onClick={() => handleSort('name')}
                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer ${sortField === 'name' ? 'text-primary bg-white/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Name</span>
                </div>
                {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleSort('creation')}
                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer ${sortField === 'creation' ? 'text-primary bg-white/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Date Created</span>
                </div>
                {sortField === 'creation' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleSort('status')}
                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer ${sortField === 'status' ? 'text-primary bg-white/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Status</span>
                </div>
                {sortField === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleSort('due')}
                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer ${sortField === 'due' ? 'text-primary bg-white/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Due Date</span>
                </div>
                {sortField === 'due' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">
                Order
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem 
                onClick={() => setSortOrder('asc')}
                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer ${sortOrder === 'asc' ? 'text-primary bg-white/5' : ''}`}
              >
                Ascending
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortOrder('desc')}
                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer ${sortOrder === 'desc' ? 'text-primary bg-white/5' : ''}`}
              >
                Descending
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>


        {/* Mobile Sort Dropdown */}
        <div className="sm:hidden relative">
          <Button
            variant="outline"
            onClick={() => setMobileSortOpen(!mobileSortOpen)}
            className="glass w-full flex items-center justify-between text-xs h-10 px-4 border-white/10"
          >
            <div className="flex items-center gap-2">
              <ArrowDownWideNarrow className="w-4 h-4 text-primary" />
              <span className="font-semibold">Sort by: {
                sortField === 'name' ? 'Name' : 
                sortField === 'creation' ? 'Date' : 
                sortField === 'status' ? 'Status' : 'Due Date'
              }</span>
            </div>
            {mobileSortOpen ? <X className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
          </Button>
          
          {mobileSortOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-white/15 rounded-xl shadow-2xl z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-1.5 space-y-1">
                <button
                  onClick={() => handleSort('name')}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between text-sm ${sortField === 'name' ? 'bg-white/10 text-primary' : 'text-foreground'}`}
                >
                  Name
                </button>
                <button
                  onClick={() => handleSort('creation')}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between text-sm ${sortField === 'creation' ? 'bg-white/10 text-primary' : 'text-foreground'}`}
                >
                  Date Created
                </button>
                <button
                  onClick={() => handleSort('status')}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between text-sm ${sortField === 'status' ? 'bg-white/10 text-primary' : 'text-foreground'}`}
                >
                  Status
                </button>
                <button
                  onClick={() => handleSort('due')}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between text-sm ${sortField === 'due' ? 'bg-white/10 text-primary' : 'text-foreground'}`}
                >
                  Due Date
                </button>
              </div>
              <div className="p-1.5 space-y-1 border-t border-white/10">
                <button
                  onClick={() => setSortOrder('asc')}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between text-sm ${sortOrder === 'asc' ? 'bg-white/10 text-primary' : 'text-foreground'}`}
                >
                  Ascending
                </button>
                <button
                  onClick={() => setSortOrder('desc')}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between text-sm ${sortOrder === 'desc' ? 'bg-white/10 text-primary' : 'text-foreground'}`}
                >
                  Descending
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Board Sections */}
      <Card className="glass-strong overflow-hidden border-0 sm:border flex-1 flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
          {/* Created Boards Section */}
          <BoardSection
            title="Created"
            icon={FolderKanban}
            boards={sortedCreatedBoards}
            currentPage={createdPage}
            onPageChange={setCreatedPage}
            emptyTitle="No boards created yet"
            emptyDescription="Create your first board to get started."
            showCreateButton
          />

          {/* Shared Boards Section */}
          <BoardSection
            title="Shared with You"
            icon={Users}
            boards={sortedSharedBoards}
            currentPage={sharedPage}
            onPageChange={setSharedPage}
            emptyTitle="No shared boards"
            emptyDescription="Boards shared with you will appear here."
          />

          {/* My Handle Classes/Projects Section (for instructors) */}
          {(user?.role === "instructor" || instructorBoards.length > 0) && (
            <BoardSection
              title="My Handle Classes/Projects"
              icon={GraduationCap}
              boards={sortedInstructorBoards}
              currentPage={instructorBoardsPage}
              onPageChange={setInstructorBoardsPage}
              emptyTitle="No assigned classes/projects"
              emptyDescription="Boards where you are assigned as an instructor will appear here."
            />
          )}

          {/* All Boards Section (Admin Only) */}
          {user?.role === "admin" && (
            <BoardSection
              title="All Boards"
              icon={FolderKanban}
              boards={sortedAllOtherBoards}
              currentPage={allBoardsPage}
              onPageChange={setAllBoardsPage}
              emptyTitle="No other boards"
              emptyDescription="All other boards in the system will appear here."
            />
          )}
        </div>
      </Card>

      {/* Edit Board Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Board</DialogTitle>
            <DialogDescription className="text-xs">Update board information</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-title" className="text-xs">Board Title</Label>
              <Input
                id="edit-title"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                className="glass h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-description" className="text-xs">Description</Label>
              <Textarea
                id="edit-description"
                value={newBoardDescription}
                onChange={(e) => setNewBoardDescription(e.target.value)}
                className="glass text-sm"
                rows={3}
              />
            </div>

            {/* Status Field - Admin/Manager Only */}
            {(user?.role === 'admin' || editingBoard?.members?.some(m => m.email === user?.email && (m as any).role === 'manager')) && (
              <div className="space-y-1">
                <Label htmlFor="edit-status" className="text-xs">Status</Label>
                <select
                  id="edit-status"
                  value={(editingBoard as any)?.status || 'ongoing'}
                  onChange={(e) => {
                    if (editingBoard) {
                      setEditingBoard({ ...editingBoard, status: e.target.value } as any);
                    }
                  }}
                  className="w-full h-8 text-sm rounded-md px-2 bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  style={{ backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                >
                  <option value="ongoing" className="bg-background text-foreground">Ongoing</option>
                  <option value="done" className="bg-background text-foreground">Done</option>
                </select>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="glass w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateBoard}
              className="gradient-primary hover-glow w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Update Board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Archive Board</DialogTitle>
            <DialogDescription className="text-xs">
              This board will be moved to the archived projects. You can restore it later.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="glass w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteBoard}
              className="gradient-primary hover-glow w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Archive Board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archived Projects Dialog */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Archive className="w-4 h-4" />
              Archived Projects
            </DialogTitle>
            <DialogDescription className="text-xs">
              Restore deleted boards or permanently delete them
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {deletedBoards.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Archive className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No archived projects</p>
              </div>
            ) : (
              deletedBoards.map((board) => (
                <Card key={board.id} className="glass p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm mb-0.5 truncate">{board.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {board.description || "No description"}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreBoard(board)}
                        className="glass h-7 text-xs"
                      >
                        Restore
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePermanentDeleteClick(board.id)}
                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog open={permanentDeleteDialogOpen} onOpenChange={setPermanentDeleteDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg text-destructive">Permanently Delete?</DialogTitle>
            <DialogDescription className="text-xs">
              This action cannot be undone. The board will be permanently deleted from the database.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setPermanentDeleteDialogOpen(false)}
              className="glass w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics PDF Generation Dialog */}
      <Dialog open={analyticsDialogOpen} onOpenChange={setAnalyticsDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileBarChart className="w-4 h-4" />
              Generate Analytics PDF
            </DialogTitle>
            <DialogDescription className="text-xs">
              Generate a comprehensive PDF report including boards and user data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">Select scope:</p>
            <div className="flex flex-col gap-2">
             <Button
                variant={pdfScope === "allUsers" ? "default" : "outline"}
                onClick={() => setPdfScope("allUsers")}
                className="w-full h-8 text-xs justify-start"
                size="sm"
              >
                All Project Manager
              </Button>
              <Button
                variant={pdfScope === "projectOnly" ? "default" : "outline"}
                onClick={() => setPdfScope("projectOnly")}
                className="w-full h-8 text-xs justify-start"
                size="sm"
              >
                Project Overview
              </Button>
              <Button
                variant={pdfScope === "all" ? "default" : "outline"}
                onClick={() => setPdfScope("all")}
                className="w-full h-8 text-xs justify-start"
                size="sm"
              >
                Both (All Project Manager + Project Overview)
              </Button>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-3">
            <Button
              variant="outline"
              onClick={() => setAnalyticsDialogOpen(false)}
              className="glass w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGeneratePDF}
              className="gradient-primary hover-glow w-full sm:w-auto h-8 text-xs"
              size="sm"
            >
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

export default Dashboard;
