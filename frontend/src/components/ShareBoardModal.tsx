import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Board } from '@/context/AppContext';
import { Copy, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

// --- Helper for generating temporary unique IDs ---
// This assumes your Board/Member type requires an _id.
const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; 
// ------------------------------------------------

// Infer the Member type from the Board type provided in the original context
// NOTE: I am assuming the Board.members array contains objects that MUST have an _id based on the TypeScript error.
type Member = Board['members'][number];

interface ShareBoardModalProps {
  board: Board;
  isOpen: boolean;
  onClose: () => void;
  // Adjusted the signature to ensure we pass the required type back
  onUpdateMembers: (members: Member[]) => void;
}

/**
 * Enhanced and more compact ShareBoardModal component with wider Add Member input.
 */
export const ShareBoardModal = ({ board, isOpen, onClose, onUpdateMembers }: ShareBoardModalProps) => {
  // Use Member[] for type safety
  const [members, setMembers] = useState<Member[]>(board.members);
  const [originalMembers, setOriginalMembers] = useState<Member[]>(board.members);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'manager'>('manager');
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Check for unsaved changes (any difference in the members array)
  useEffect(() => {
    // Deep comparison of the two arrays of objects
    const hasChanges = JSON.stringify(members) !== JSON.stringify(originalMembers);
    setHasUnsavedChanges(hasChanges);
  }, [members, originalMembers]);

  const handleAddMember = () => {
    if (!newEmail.trim()) {
      toast.error('Email is required');
      return;
    }

    const trimmedEmail = newEmail.trim();
    if (members.some((m) => m.email === trimmedEmail)) {
      toast.error('Member already added');
      return;
    }

    // ⭐ FIX: Create a new Member object including the required '_id' property
    const newMember: Member = { 
        email: trimmedEmail, 
        role: newRole, 
        _id: generateTempId() // Assign temporary ID
    };

    const updated = [...members, newMember];
    setMembers(updated);
    setNewEmail('');
    toast.success('Member added');
  };

  const confirmRemoveMember = (email: string) => {
    setMemberToRemove(email);
  };

  const handleRemoveMember = () => {
    if (memberToRemove) {
      // Filter out using email since the _id type might be complex
      setMembers(members.filter((m) => m.email !== memberToRemove)); 
      setMemberToRemove(null);
      toast.success('Member removed');
    }
  };

  const cancelRemoveMember = () => {
    setMemberToRemove(null);
  };

  const handleChangeRole = (email: string, role: 'member' | 'manager') => {
    setMembers(members.map((m) => (m.email === email ? { ...m, role } : m)));
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied to clipboard');
  };

  const handleSave = () => {
    onUpdateMembers(members);
    setOriginalMembers(members); 
    setHasUnsavedChanges(false);
    toast.success('✅ Board members updated');
    onClose();
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close and discard them?')) {
        setMembers(originalMembers);
        setHasUnsavedChanges(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddMember();
    }
  };

  const getMemberToRemoveName = () => {
    if (!memberToRemove) return '';
    const member = members.find(m => m.email === memberToRemove);
    return member?.email || '';
  };

  return (
    <>
      {/* ⚠️ Remove Member Confirmation Dialog */}
      <Dialog open={!!memberToRemove} onOpenChange={(open) => !open && cancelRemoveMember()}>
        <DialogContent className="glass-strong max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg">Remove Member</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-white/90">
              Are you sure you want to remove <span className="font-medium text-white break-all">{getMemberToRemoveName()}</span> from this board?
            </p>
            <p className="text-xs text-purple-300/70 mt-1">
              This action cannot be undone on save.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={cancelRemoveMember}
              className="border-white/20 hover:bg-white/10 h-8 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRemoveMember}
              className="bg-red-500 hover:bg-red-600 text-white h-8 text-sm"
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 💻 Main Share Board Dialog */}
      <Dialog open={isOpen} onOpenChange={handleClose}>
        {/* Adjusted max-width to allow more horizontal space for the input */}
        <DialogContent className="glass-strong max-w-[95vw] min-w-[340px] sm:max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden mx-2">
          
          <DialogHeader className="flex-shrink-0 px-4 sm:px-5 pt-3 pb-2 border-b border-white/10">
            <DialogTitle className="text-lg flex items-center gap-2">
              Share Board
              {hasUnsavedChanges && (
                <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full font-normal">
                  Unsaved
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Main content area */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 sm:px-5 py-3">
            <div className="space-y-3 flex-1 min-h-0 overflow-hidden flex flex-col">
              
              {/* Board Link */}
              <div className="flex-shrink-0">
                <Label className="text-xs font-medium mb-1 block">Board Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={`${window.location.origin}${window.location.pathname}`}
                    readOnly
                    className="glass text-xs flex-1 border-white/15 h-8 hover:bg-blue-500/10 hover:border-blue-400/30 transition-all relative z-10"
                  />
                  <Button 
                    onClick={handleCopyLink} 
                    size="sm" 
                    className="flex-shrink-0 glass border-white/15 hover:bg-blue-500/10 hover:border-blue-400/30 px-2.5 h-8 min-w-[32px] transition-all relative z-10"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Add Member - Expanded Input Width */}
              <div className="flex-shrink-0">
                <Label className="text-xs font-medium mb-1 block">Add Team Member</Label>
                <div className="flex gap-2">
                  {/* Expanded Input: w-3/5 */}
                  <Input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="member@example.com"
                    className="w-3/5 border-white/15 text-sm h-8 hover:bg-blue-500/10 hover:border-blue-400/30 transition-all relative z-10 min-w-0"
                  />
                  {/* Role Select: w-2/5 (adjusted width and distinct hover design) */}
                  <Select value={newRole} onValueChange={(val) => setNewRole(val as 'member' | 'manager')}>
                    <SelectTrigger className="w-2/5 border-white/15 text-xs h-8 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-400/40 transition-all relative z-10 min-w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    {/* Consistent dropdown background */}
                    <SelectContent className="glass-strong border-white/15 text-sm">
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleAddMember} 
                    className="gradient-primary hover-glow px-2.5 flex-shrink-0 h-8 min-w-[32px] rounded-lg relative z-20 border border-transparent"
                    disabled={!newEmail.trim()}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Members List */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-medium">
                    Board Members ({members.length})
                  </Label>
                  {members.length > 3 && (
                    <span className="text-[10px] text-purple-300/70 hidden xs:inline">
                      (Scroll for more)
                    </span>
                  )}
                </div>
                
                {/* Scrollable Members Area */}
                <div className="flex-1 min-h-0 overflow-y-auto clean-scrollbar rounded-md border border-white/10 bg-white/5">
                  {members.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-4 px-3">
                      <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center mb-1">
                        <Plus className="w-3.5 h-3.5 text-purple-300" />
                      </div>
                      <p className="text-sm text-purple-300 font-medium">No members yet</p>
                      <p className="text-xs text-purple-300/70 mt-0.5">Add team members to get started</p>
                    </div>
                  ) : (
                    <div className="p-1">
                      {members.map((member) => (
                        <div 
                          // Use a more stable key if available, but email is fine if unique
                          key={member._id || member.email} 
                          className="flex items-center justify-between p-1.5 rounded-md hover:bg-blue-500/10 border border-transparent hover:border-blue-400/20 transition-all group relative z-10"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Avatar className="w-7 h-7 flex-shrink-0 relative z-20 group-hover:ring-2 group-hover:ring-blue-400/30 transition-all">
                              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xs font-medium">
                                {member.email[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white/90 break-words">{member.email}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Role Select in list: Slightly wider and updated hover design */}
                            <Select
                              value={member.role}
                              onValueChange={(val) => handleChangeRole(member.email, val as 'member' | 'manager')}
                            >
                              <SelectTrigger className="w-[100px] h-6 text-xs border-white/20 bg-white/5 hover:bg-blue-500/10 hover:border-blue-400/30 transition-all relative z-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="glass-strong border-white/15 text-xs">
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmRemoveMember(member.email)}
                              className="h-6 w-6 p-0 flex-shrink-0 opacity-70 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-300 border border-transparent hover:border-red-400/30 transition-all rounded-md relative z-20"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 flex flex-row justify-end gap-2 p-3 border-t border-white/10">
            <Button 
              variant="outline" 
              onClick={handleClose} 
              className="px-3 py-1.5 border-white/20 hover:bg-blue-500/10 hover:border-blue-400/30 text-sm h-8 transition-all relative z-10"
            >
              Cancel
            </Button>
            <Button 
              className={`px-3 py-1.5 text-sm h-8 relative z-20 ${
                hasUnsavedChanges 
                  ? 'gradient-primary hover-glow' 
                  : 'glass border-white/20 opacity-70 cursor-not-allowed'
              }`}
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};