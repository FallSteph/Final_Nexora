import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { User, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'user';
}

interface AdminPanelProps {
  adminId: string;
  adminName: string;
  userData: UserData;
  editTime: number | null;
  firstEditor: string | null;
  onEdit: (adminId: string) => void;
  onSave: (adminId: string, data: Partial<UserData>) => void;
  headerClass: string;
}

/**
 * ============================================================
 * TIMESTAMP-BASED EDITING RULES (Concurrency Control Logic)
 * ============================================================
 * 
 * This component implements "first-come-first-served" editing priority:
 * 
 * RULE 1: FIRST EDITOR PRIORITY
 * -----------------------------
 * - The FIRST admin to click "Edit" becomes the "firstEditor"
 * - Their editTime timestamp is recorded (Date.now())
 * - They get the "Priority" badge and their saves WILL be applied
 * 
 * RULE 2: SUBSEQUENT EDITORS
 * --------------------------
 * - Admins who click "Edit" AFTER the firstEditor can still edit
 * - Their editTime is recorded but they DON'T get priority
 * - They get "No Priority" badge - their saves will be IGNORED
 * 
 * RULE 3: SAVE BEHAVIOR
 * ---------------------
 * - When admin clicks Save:
 *   - IF admin === firstEditor → Changes ARE applied to database
 *   - IF admin !== firstEditor → Changes are NOT applied (silently ignored or show warning)
 * 
 * RULE 4: TIMESTAMP COMPARISON (Backend)
 * --------------------------------------
 * - Frontend sends: { ...formData, lastUpdatedAt: editingUser.updatedAt }
 * - Backend compares: user.updatedAt vs request.lastUpdatedAt
 * - If timestamps DON'T match → Someone else saved first → Return 409 CONFLICT
 * - If timestamps match → Safe to save → Update and return new updatedAt
 * 
 * ============================================================
 */

const AdminPanel = ({
  adminId,
  adminName,
  userData,
  editTime,
  firstEditor,
  onEdit,
  onSave,
  headerClass,
}: AdminPanelProps) => {
  const [formData, setFormData] = useState({
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
  });

  // Sync form data when userData changes (e.g., after another admin saves)
  useEffect(() => {
    setFormData({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
    });
  }, [userData]);

  // ============================================================
  // EDITING PRIORITY CHECKS
  // ============================================================
  
  /**
   * Check if THIS admin is the first editor (has priority)
   * firstEditor is set when the FIRST admin clicks "Edit"
   */
  const isFirstEditor = firstEditor === adminId;
  
  /**
   * Check if this admin has clicked "Edit" (has an editTime)
   */
  const hasClickedEdit = editTime !== null;
  
  /**
   * Can only save if they've clicked "Edit" first
   * (But save may be ignored if not firstEditor)
   */
  const canSave = hasClickedEdit;

  /**
   * SAVE HANDLER
   * ------------
   * This is called when admin clicks "Save"
   * The parent component (Index.tsx) handles the actual logic:
   * - If adminId === firstEditor → Apply changes
   * - If adminId !== firstEditor → Ignore changes (show warning)
   */
  const handleSave = () => {
    // Pass the form data to parent
    // Parent will check: is this admin the firstEditor?
    onSave(adminId, formData);
  };

  /**
   * EDIT HANDLER
   * ------------
   * When admin clicks "Edit":
   * 1. Record their editTime = Date.now()
   * 2. If no firstEditor exists yet, THIS admin becomes firstEditor
   * 3. If firstEditor already exists, this admin gets "No Priority"
   */
  const handleEdit = () => {
    onEdit(adminId);
  };

  return (
    <Card className="admin-panel">
      <CardHeader className={cn('rounded-t-xl', headerClass)}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {adminName}
          </span>
          
          {/* PRIORITY BADGE - Shows editing status */}
          {hasClickedEdit && (
            <Badge 
              variant="secondary" 
              className={cn(
                'priority-badge',
                isFirstEditor ? 'priority-badge-active' : 'priority-badge-waiting'
              )}
            >
              {isFirstEditor ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Priority (Can Save)
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  No Priority (Save Ignored)
                </>
              )}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {/* Current Data Display - Shows actual database values */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Current Data (from database):
          </p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Name:</span>
            <span className="font-medium">{userData.firstName} {userData.lastName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email:</span>
            <span className="font-medium">{userData.email}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Role:</span>
            <Badge variant={userData.role === 'admin' ? 'default' : 'secondary'}>
              {userData.role}
            </Badge>
          </div>
        </div>

        {/* Edit Form - Admin can modify these values */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            Edit Form (local changes):
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`firstName-${adminId}`} className="text-xs">First Name</Label>
            <Input
              id={`firstName-${adminId}`}
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`lastName-${adminId}`} className="text-xs">Last Name</Label>
            <Input
              id={`lastName-${adminId}`}
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`email-${adminId}`} className="text-xs">Email</Label>
            <Input
              id={`email-${adminId}`}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {/* 
            EDIT BUTTON
            - Disabled after clicking once (can't re-click)
            - Records editTime when clicked
            - First to click becomes firstEditor
          */}
          <Button 
            onClick={handleEdit} 
            variant="outline"
            className="flex-1"
            disabled={hasClickedEdit}
          >
            {hasClickedEdit ? 'Editing...' : 'Edit'}
          </Button>
          
          {/* 
            SAVE BUTTON
            - Enabled only after clicking "Edit"
            - Color indicates if save will be applied:
              - Green (accent) = First editor, WILL be applied
              - Orange (warning) = Not first editor, will be IGNORED
          */}
          <Button 
            onClick={handleSave} 
            className={cn(
              'flex-1',
              isFirstEditor 
                ? 'bg-accent hover:bg-accent/90' 
                : hasClickedEdit 
                  ? 'bg-warning hover:bg-warning/90' 
                  : ''
            )}
            disabled={!canSave}
          >
            {isFirstEditor ? 'Save ✓' : hasClickedEdit ? 'Save (Ignored)' : 'Save'}
          </Button>
        </div>

        {/* Edit Timestamp - Shows when this admin clicked "Edit" */}
        {editTime && (
          <div className="edit-timestamp flex items-center gap-1 animate-fade-in">
            <Clock className="w-3 h-3" />
            Clicked Edit at: {new Date(editTime).toLocaleTimeString()}
            {isFirstEditor && (
              <span className="text-accent ml-2">(First to edit)</span>
            )}
          </div>
        )}

        {/* Editing Rules Summary */}
        {hasClickedEdit && (
          <div className={cn(
            'text-xs p-2 rounded border animate-fade-in',
            isFirstEditor 
              ? 'bg-accent/10 border-accent/30 text-accent' 
              : 'bg-warning/10 border-warning/30 text-warning'
          )}>
            {isFirstEditor ? (
              <p>✓ You clicked Edit first. Your save WILL be applied.</p>
            ) : (
              <p>⚠ Another admin ({firstEditor}) clicked Edit first. Your save will be IGNORED.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminPanel;
