"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { FiTrash } from "react-icons/fi";

interface DeleteModalProps {
    trigger?: React.ReactNode;

    title?: string;
    description?: string;

    itemName?: string;

    open?: boolean;
    onOpenChange?: (open: boolean) => void;

    onConfirm: () => Promise<void> | void;

    isLoading?: boolean;

    confirmText?: string;
    cancelText?: string;
}

export function DeleteModal({
    trigger,
    title = "Delete Conversation",
    description,
    itemName,
    open,
    onOpenChange,
    onConfirm,
    isLoading = false,
    confirmText = "Delete",
    cancelText = "Cancel",
}: DeleteModalProps) {

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}

            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm animate-in fade-in-0" />

                <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-navy-800 p-6 shadow-2xl outline-none">
                    <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/15">
                            <FiTrash className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>

                        <div className="flex-1">
                            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                                {title}
                            </Dialog.Title>

                            <Dialog.Description className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                {description || `Are you sure you want to delete ${itemName ? `"${itemName}"` : "this item"}? This action cannot be undone.`}
                            </Dialog.Description>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <Dialog.Close asChild>
                            <button
                                disabled={isLoading}
                                className="h-10 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            >
                                {cancelText}
                            </button>
                        </Dialog.Close>

                        <button
                            disabled={isLoading}
                            onClick={onConfirm}
                            className="h-10 px-4 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? "Deleting..." : confirmText}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}