"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkflowStore } from '@/lib/store/workflow';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Edge, Node } from '@xyflow/react';
import { getWorkflows } from '@/lib/api/workflow';

export function LoadWorkflowDialog() {
  const [open, setOpen] = useState(false);
  const { loadWorkflow, deleteWorkflow } = useWorkflowStore();
  const [savedWorkflows, setSavedWorkflows] = useState<{
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    updatedAt: string;
  }[]>([]);
  
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 10;

  const fetchSavedWorkflows = async (currentPage: number) => {
    try {
      const skip = (currentPage - 1) * limit;
      const responseData = await getWorkflows(skip, limit);
      const workflowsList = responseData?.data || (responseData as any)?.workflows || (Array.isArray(responseData) ? responseData : []);
      if (workflowsList) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const workflows = workflowsList.map((workflow: any) => ({
          id: workflow.id || workflow._id,
          name: workflow.name || "Untitled Workflow",
          nodes: workflow.graph_definition?.nodes || workflow.nodes || [],
          edges: workflow.graph_definition?.edges || workflow.edges || [],
          updatedAt: new Date(workflow.updated_at || workflow.updatedAt || Date.now()).toLocaleString(),
        }));
        setSavedWorkflows(workflows);
        
        const total = responseData.meta?.total ?? workflows.length;
        setTotalCount(total);
        setHasMore(responseData.meta?.has_more ?? (workflows.length === limit));
      }
    } catch (error) {
      console.error('Error fetching saved workflows:', error);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSavedWorkflows(page);
    }
  }, [open, page]);

  // Reset to page 1 whenever dialog is opened
  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [open]);

  const handleLoad = (id: string) => {
    loadWorkflow(id);
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteWorkflow(id);
    // Refresh current page
    fetchSavedWorkflows(page);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Load Workflow</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-white dark:bg-navy-800 border border-slate-200 dark:border-gray-800 text-slate-800 dark:text-gray-200">
        <DialogHeader>
          <DialogTitle>Load Workflow</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[360px] pr-4 my-2">
          {savedWorkflows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No saved workflows
            </p>
          ) : (
            <div className="space-y-2">
              {savedWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-gray-800 hover:bg-accent bg-slate-50/50 dark:bg-black/10"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <h4 className="font-medium text-sm truncate">{workflow.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {new Date(workflow.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(workflow.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50/10 h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleLoad(workflow.id)}
                      className="h-8"
                    >
                      Load
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Pagination controls inside Popup */}
        {totalCount > limit && (
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-100 dark:border-gray-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <span className="text-xs font-medium">
              Page {page} of {Math.ceil(totalCount / limit)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore || (page * limit >= totalCount)}
              className="h-8 flex items-center gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}