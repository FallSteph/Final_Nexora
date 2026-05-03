import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Project } from '@/context/AppContext';
import { toast } from 'sonner';

interface EditProjectModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: { title: string; description: string }) => void;
}

export const EditProjectModal = ({ project, isOpen, onClose, onSave }: EditProjectModalProps) => {
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Project title is required');
      return;
    }

    onSave(project.id, { title: title.trim(), description: description.trim() });
    toast.success('✅ Project Updated');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-strong max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Edit Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label className="text-sm sm:text-base">Project Name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project name"
              className="glass mt-2 text-sm sm:text-base"
            />
          </div>

          <div>
            <Label className="text-sm sm:text-base">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Project description"
              className="glass mt-2 min-h-[80px] sm:min-h-[100px] text-sm sm:text-base"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button className="gradient-primary w-full sm:w-auto" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
