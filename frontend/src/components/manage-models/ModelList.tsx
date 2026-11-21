"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Key, Trash2, Edit2, Loader2 } from "lucide-react";
import { ModelResponse } from "@/lib/schemas/model";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteModelById } from "@/lib/api/models";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { showErrorToast, showSuccessToast } from "@/utils/toast";

interface ModelListProps {
  models: ModelResponse[];
  onAddNewModel: () => void;
  onEditModel: (id: string) => void;
}

export function ModelList({ models, onAddNewModel, onEditModel }: ModelListProps) {
  const queryClient = useQueryClient();
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);

  // TanStack Mutation for Deletion
  const deleteMutation = useMutation({
    mutationFn: deleteModelById,
    onSuccess: () => {
      showSuccessToast("Model configuration deleted successfully.");
      queryClient.invalidateQueries({ queryKey: ["models"] });
      setModelToDelete(null);
    },
    onError: () => {
      showErrorToast("Failed to delete configuration.");
      setModelToDelete(null);
    },
  });

  const handleDeleteConfirm = () => {
    if (modelToDelete) {
      deleteMutation.mutate(modelToDelete);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {models.length === 0 ? (
          <div className="bg-slate-50 dark:bg-navy-800/50 border border-slate-200 dark:border-gray-800 rounded-lg p-10 flex flex-col items-center justify-center text-center">
            <Key className="w-12 h-12 text-slate-400 dark:text-gray-500 mb-4" />
            <h3 className="text-lg font-medium text-slate-800 dark:text-gray-300">No Custom Models Added</h3>
            <p className="text-sm text-slate-500 dark:text-gray-500 mt-2 max-w-md">
              Add your own API keys to use custom models across Chat, Workflows, and Agents.
            </p>
            <Button
              onClick={onAddNewModel}
              className="mt-6 bg-transparent border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-800 dark:text-white"
            >
              Add Your First Model
            </Button>
          </div>
        ) : (
          models?.map((model) => (
            <div
              key={model.id}
              className="bg-white dark:bg-navy-800 p-5 rounded-lg border border-slate-200 dark:border-gray-800 flex items-center justify-between shadow-sm"
            >
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-gray-200">{model.name}</h3>
                <p className="text-sm text-slate-500 dark:text-gray-500 capitalize">
                  {model.provider} Provider
                </p>
              </div>

              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => onEditModel(model.id)}
                  className="border-slate-200 dark:border-gray-700 bg-transparent hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-600 dark:text-gray-300 h-9 w-9 p-0"
                  title="Edit Configuration"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setModelToDelete(model.id)}
                  className="border-red-200 dark:border-red-900/50 bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 h-9 w-9 p-0"
                  title="Delete Configuration"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!modelToDelete} onOpenChange={(open) => !open && setModelToDelete(null)}>
        <AlertDialogContent className="bg-white dark:bg-navy-800 border border-slate-200 dark:border-gray-800 text-slate-850 dark:text-gray-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-gray-100">Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 dark:text-gray-400">
              This will permanently delete this custom provider configuration. Any systems or chats utilizing this specific custom provider configuration might fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-300 dark:border-gray-700 bg-transparent text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
