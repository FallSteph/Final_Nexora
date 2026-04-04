import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/context/AppContext';
import { Calendar, Paperclip, X, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface CardModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Card>) => void;
  onDelete: () => void;
  boardMembers: { email: string; role: string }[];
}

const LABEL_COLORS = [
  'design', 'high-priority', 'bug', 'feature', 'urgent', 'low-priority'
];

export const CardModal = ({ card, isOpen, onClose, onSave, onDelete, boardMembers }: CardModalProps) => {
  const [title, setTitle] = useState(card?.title || '');
  const [description, setDescription] = useState(card?.description || '');
  const [labels, setLabels] = useState<string[]>(card?.labels || []);
  const [assignedMembers, setAssignedMembers] = useState<string[]>(card?.assignedMembers || []);
  const [dueDate, setDueDate] = useState(card?.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : '');
  const [attachments, setAttachments] = useState<string[]>(card?.attachments || []);
  const [newAttachment, setNewAttachment] = useState('');
  const [comments, setComments] = useState(card?.comments || []);
  const [newComment, setNewComment] = useState('');
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    onSave({
      title,
      description,
      labels,
      assignedMembers,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      attachments,
      comments,
    });
    toast.success('✅ Card Updated');
    onClose();
  };

  const handleAddLabel = (label: string) => {
    if (!labels.includes(label)) {
      setLabels([...labels, label]);
    }
    setShowLabelPicker(false);
  };

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
  };

  const toggleMember = (email: string) => {
    if (assignedMembers.includes(email)) {
      setAssignedMembers(assignedMembers.filter((m) => m !== email));
    } else {
      setAssignedMembers([...assignedMembers, email]);
    }
  };

  const handleAddAttachment = () => {
    if (newAttachment.trim()) {
      setAttachments([...attachments, newAttachment.trim()]);
      setNewAttachment('');
      toast.success('Attachment added');
    }
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment = {
        user: 'Current User',
        text: newComment.trim(),
        timestamp: new Date(),
      };
      setComments([...comments, comment]);
      setNewComment('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-strong max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Card Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 mt-4">
          {/* Title */}
          <div>
            <Label className="text-sm sm:text-base">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
              className="glass mt-2 text-sm sm:text-base"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm sm:text-base">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              className="glass mt-2 min-h-[80px] sm:min-h-[100px] text-sm sm:text-base"
            />
          </div>

          {/* Labels */}
          <div>
            <Label className="flex items-center gap-2 text-sm sm:text-base">
              <Tag className="w-3 h-3 sm:w-4 sm:h-4" />
              Labels
            </Label>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2">
              {labels.map((label) => (
                <Badge key={label} className="gradient-primary gap-1 text-xs">
                  {label}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-destructive"
                    onClick={() => handleRemoveLabel(label)}
                  />
                </Badge>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLabelPicker(!showLabelPicker)}
                className="h-6 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
            {showLabelPicker && (
              <div className="glass p-2 sm:p-3 rounded-lg mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                {LABEL_COLORS.map((label) => (
                  <Badge
                    key={label}
                    className="cursor-pointer gradient-secondary text-xs"
                    onClick={() => handleAddLabel(label)}
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Members */}
          <div>
            <Label className="text-sm sm:text-base">Assigned Members</Label>
            <div className="space-y-2 mt-2 max-h-[150px] sm:max-h-[200px] overflow-y-auto">
              {boardMembers.map((member) => (
                <div
                  key={member.email}
                  className="flex items-center gap-2 sm:gap-3 glass p-2 rounded-lg cursor-pointer hover-glow"
                  onClick={() => toggleMember(member.email)}
                >
                  <Avatar className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0">
                    <AvatarFallback className="gradient-secondary text-white text-xs sm:text-sm">
                      {member.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium truncate">{member.email}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  {assignedMembers.includes(member.email) && (
                    <Badge className="gradient-primary text-xs flex-shrink-0">Assigned</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <Label className="flex items-center gap-2 text-sm sm:text-base">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
              Due Date
            </Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="glass mt-2 text-sm sm:text-base"
            />
          </div>

          {/* Attachments */}
          <div>
            <Label className="flex items-center gap-2 text-sm sm:text-base">
              <Paperclip className="w-3 h-3 sm:w-4 sm:h-4" />
              Attachments
            </Label>
            <div className="space-y-2 mt-2">
              {attachments.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between glass p-2 rounded-lg">
                  <span className="text-xs sm:text-sm truncate flex-1 mr-2">{file}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    <X className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={newAttachment}
                  onChange={(e) => setNewAttachment(e.target.value)}
                  placeholder="Filename (mock)"
                  className="glass text-sm"
                />
                <Button onClick={handleAddAttachment} size="sm" className="w-full sm:w-auto">
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Comments */}
          <div>
            <Label className="text-sm sm:text-base">Comments</Label>
            <div className="space-y-2 sm:space-y-3 mt-2 max-h-[150px] sm:max-h-[200px] overflow-y-auto">
              {comments.map((comment, idx) => (
                <div key={idx} className="glass p-2 sm:p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Avatar className="w-5 h-5 sm:w-6 sm:h-6">
                      <AvatarFallback className="gradient-secondary text-xs text-white">
                        {comment.user[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs sm:text-sm font-medium">{comment.user}</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                      {new Date(comment.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm ml-7 sm:ml-8">{comment.text}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className="glass text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              />
              <Button onClick={handleAddComment} size="sm" className="w-full sm:w-auto">
                Post
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-between gap-2 pt-4 border-t border-border">
            <Button variant="destructive" onClick={onDelete} className="w-full sm:w-auto text-sm">
              Delete Card
            </Button>
            <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto text-sm">
                Cancel
              </Button>
              <Button className="gradient-primary w-full sm:w-auto text-sm" onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
