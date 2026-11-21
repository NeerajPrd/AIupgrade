"use client";

import { FiChevronRight, FiTrash } from "react-icons/fi";
import { IoMdAdd } from "react-icons/io";
import { MessageSquare } from "lucide-react";
import { LuMessagesSquare } from "react-icons/lu";

interface ChatHistoryItem {
    conversation_id: string;
    title: string;
    last_message: string;
    updatedAt?: string;
}

interface ChatDropdownProps {
    open: boolean;
    onToggle: () => void;
    chats: ChatHistoryItem[];
    activeId?: string;
    isActive?: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    formatDate: (date?: string) => string;
    onNewChat: () => void;
    isSidebarOpen?: boolean;
}

export default function ChatDropdown({
    open,
    onToggle,
    chats,
    activeId,
    isActive,
    onSelect,
    onDelete,
    formatDate,
    onNewChat,
    isSidebarOpen = true,
}: ChatDropdownProps) {
    return (
        <div className="w-full mb-2">
            {/* trigger */}
            <button
                onClick={() => {
                    if (!isSidebarOpen) {
                        onNewChat();
                    } else {
                        onToggle();
                    }
                }}
                className={`w-full px-3 py-[15px] rounded-3xl text-sm flex items-center justify-between transition-colors ${isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-gray-50 dark:hover:bg-navy-800/50"
                } ${!isSidebarOpen && "justify-center"}`}
            >
                <div className="flex items-center gap-2.5">
                    <LuMessagesSquare className="text-lg flex-shrink-0" />
                    {isSidebarOpen && "Chat"}
                </div>

                {isSidebarOpen && (
                    <FiChevronRight
                        className={`transition-transform ${open ? "rotate-90" : ""}`}
                    />
                )}
            </button>

            {/* dropdown */}
            {open && isSidebarOpen && (
                <div className="mt-1 ml-4">

                    <button
                        onClick={onNewChat}
                        className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 mb-2"
                    >
                        <IoMdAdd className="w-4 h-4" />
                        New Chat
                    </button>

                    {/* SCROLLABLE AREA */}
                    <div className="max-h-64 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
                        {chats.map((item) => (
                            <div
                                key={item.conversation_id}
                                className="group flex items-center gap-2 px-2"
                            >
                                <MessageSquare className="text-gray-400 w-3.5 h-3.5 flex-shrink-0" />

                                <button
                                    onClick={() => onSelect(item.conversation_id)}
                                    className={`flex-1 text-left text-xs truncate py-1.5 px-2 rounded-md transition-colors
                        ${activeId === item.conversation_id
                                            ? "bg-accent text-accent-foreground font-semibold border border-primary/20 shadow-sm"
                                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
                                        }`}
                                >
                                    {item.last_message}
                                </button>


                                <button
                                    onClick={() => onDelete(item.conversation_id)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                                >
                                    <FiTrash className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}