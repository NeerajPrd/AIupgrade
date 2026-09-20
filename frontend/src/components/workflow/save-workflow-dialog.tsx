"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useWorkflowStore } from '@/lib/store/workflow';

export function SaveWorkflowDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const { saveWorkflow, isCurrentExecutionSavedId, updateWorkflow, currentWorkflowName } = useWorkflowStore();

  const isSaved = isCurrentExecutionSavedId && !isCurrentExecutionSavedId.startsWith('workflow-');

  useEffect(() => {
    if (open) {
      setName(currentWorkflowName || '');
    }
  }, [open, currentWorkflowName]);

  const handleUpdate = async () => {
    if (!isCurrentExecutionSavedId) return;
    updateWorkflow(isCurrentExecutionSavedId, name.trim() || undefined);
    setOpen(false);
  }

  const handleSave = async () => {
    if (name.trim()) {
      // const { id, name, nodes, edges, user_id } = req.body;
      saveWorkflow(name.trim());
      setName('');
      setOpen(false);

    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Save Workflow</Button>
      </DialogTrigger>
      {/* Only Save/Update/X should dismiss this, not an accidental outside click. */}
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Save Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full focus-visible:ring-[#FB923C] shrink-0"
          />
          {isSaved ?
            <Button onClick={handleUpdate} className="w-full">
              Update
            </Button>
            :
            <Button onClick={handleSave} className="w-full">
              Save
            </Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}