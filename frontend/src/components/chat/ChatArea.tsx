import { forwardRef } from "react";
import { AiOutlineThunderbolt } from "react-icons/ai";
import { FaCircleChevronRight } from "react-icons/fa6";
import { Square } from "lucide-react";
import { FilePreview } from "./FilePreview";
import { FiPlusCircle } from "react-icons/fi";
import { useMutation } from "@tanstack/react-query";
import { enhancePrompt } from "@/lib/api/chat";

interface ChatAreaProps {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: () => void;

    isStreaming?: boolean;
    disabled?: boolean;

    selectedFile?: string | null;

    onFileSelect: (
        e: React.ChangeEvent<HTMLInputElement>
    ) => void;

    onRemoveFile: () => void;

    onStop?: () => void;
}

export const ChatArea = forwardRef<
    HTMLTextAreaElement,
    ChatAreaProps
>(
    (
        {
            value,
            onValueChange,
            onSubmit,
            selectedFile,
            onFileSelect,
            onRemoveFile,
            isStreaming,
            disabled,
            onStop,
        },
        ref
    ) => {

        const enhancePromptMutation = useMutation({
            mutationFn: (query: string) => enhancePrompt(query),
        });

        const handleKeyDown = (
            e: React.KeyboardEvent<HTMLTextAreaElement>
        ) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
            }
        };

        const handleResize = (
            e: React.FormEvent<HTMLTextAreaElement>
        ) => {
            const textarea = e.currentTarget;

            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(
                textarea.scrollHeight,
                240
            )}px`;
        };

        return (
            <div className="rounded-3xl bg-white dark:bg-navy-800/90 flex flex-col flex-1">
                {selectedFile && (
                    <div className="px-4 pt-4">
                        <FilePreview file={selectedFile} onRemove={onRemoveFile} />
                    </div>
                )}

                <div className="flex items-end gap-2 p-3">
                        <input id="file-upload" type="file" className="hidden" onChange={onFileSelect} disabled={disabled} />

                        <label htmlFor="file-upload" className={`p-2 shrink-0 text-gray-500 ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer hover:text-gray-700'}`}>
                            <FiPlusCircle className="w-5 h-5" />
                        </label>

                        <textarea
                            ref={ref}
                            value={value}
                            rows={1}
                            disabled={disabled}
                            placeholder={disabled ? "Please add an API model to begin chatting..." : "Explore the possibilities..."}
                            onChange={(e) => onValueChange(e.target.value)}
                            onInput={handleResize}
                            onKeyDown={handleKeyDown}
                            className="flex-1 resize-none bg-transparent min-h-[24px] max-h-[240px] py-2 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed" />

                        <button
                            onClick={()=>enhancePromptMutation.mutate(value)}
                            disabled={disabled || enhancePromptMutation.isPending}
                            className="p-2 shrink-0 text-orange-600 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <AiOutlineThunderbolt className="w-5 h-5" />
                        </button>

                        <button
                            onClick={() => (isStreaming ? onStop?.() : onSubmit())}
                            disabled={disabled}
                            className="p-2 shrink-0 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isStreaming ? <Square className="w-5 h-5" /> : <FaCircleChevronRight className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
        );
    }
);

ChatArea.displayName = "ChatArea";