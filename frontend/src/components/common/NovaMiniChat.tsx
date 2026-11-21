'use client'

import React, { useState, useRef, useCallback, useEffect } from "react";
import axios from '@/lib/api/axios';
// import axios from 'axios'
import Image from "next/image";
import { Bot, MessageSquare, Send, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ReactMarkdown from "react-markdown";
import { baseAPIdomain } from "../BaseDomain";
interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface MessageBubbleProps {
    message: ChatMessage;
}

const NovaMiniChat: React.FC = () => {
    const [inputText, setInputText] = useState<string>("");
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        {
            role: "assistant",
            content: "👋 Hi! I'm your AI assistant. How can I help you today?",
        },
    ]);
    const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        setInputText(e.target.value);
    };

    const handleEnterKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const scrollToBottom = useCallback((): void => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const handleSendMessage = async (): Promise<void> => {
        if (inputText.trim() === "") return;
        setIsLoading(true);

        try {
            setChatMessages((prev) => [
                ...prev,
                { role: "user", content: inputText },
            ]);
            const currentMessage = inputText;
            setInputText("");
            const response = await axios.post<{ response: string }>(
                `/api/v1/service/agent`,
                {
                    query: currentMessage
                },
            );

            setChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: response.data.data },
            ]);

            scrollToBottom();
        } catch (error) {
            console.error("Error:", error);
            setChatMessages((prev) => [
                ...prev.slice(0, -1),
                {
                    role: "assistant",
                    content: "I apologize, but I'm having trouble connecting. Please try again in a moment.",
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleChat = (): void => {
        setIsChatOpen(!isChatOpen);
        if (!isChatOpen) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    };
    const TypingIndicator: React.FC = () => (
        <div className="flex space-x-1 mt-2">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    className="w-2 h-2 bg-gray-400 rounded-full"
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.4, 1, 0.4]
                    }}
                    transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.2
                    }}
                />
            ))}
        </div>
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                chatContainerRef.current &&
                !chatContainerRef.current.contains(event.target as Node)
            ) {
                const chatButton = document.getElementById("chat-toggle-button");
                if (chatButton && !chatButton.contains(event.target as Node)) {
                    setIsChatOpen(false);
                }
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);


    useEffect(() => {
        scrollToBottom();
    }, [chatMessages, scrollToBottom]);

    const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => (
        <div
            className={`flex items-start gap-2 mb-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
        >
            {message.role === "assistant" && (
                <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                        src="/spirit-monkey-icon.png"
                        alt="Spirit Monkey Assistant"
                        width={24}
                        height={24}
                        className="object-cover"
                    />
                </div>
            )}
            <div
                className={`px-3 rounded-lg max-w-[75%] text-sm leading-relaxed ${message.role === "user"
                    ? "bg-orange-600 text-white rounded-tr-none"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100 rounded-tl-none"
                    }`}
                style={{ fontSize: '12px' }}
            >
                <ReactMarkdown
                    components={{
                        p: ({ node, ...props }) => <p style={{ fontSize: '16px' }} {...props} />,
                        h1: ({ node, ...props }) => <h1 style={{ fontSize: '16px' }} {...props} />,

                    }}
                >
                    {message.content}
                </ReactMarkdown>
            </div>
        </div>
    );

    return (
        <>
            <motion.button
                id="chat-toggle-button"
                onClick={toggleChat}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`fixed bottom-5 sm:bottom-16 right-4 p-2.5 rounded-full bg-orange-600 text-white shadow-lg 
          flex items-center gap-2 group z-50 animate-pulse hover:animate-none group transition-all ${isChatOpen ? "hidden" : ""}`}
                aria-label="Chat with Spirit Monkey Assistant"
            >
                <MessageSquare className="w-5 h-5" />
                <span className="hidden group-hover:block">Chat with Spirit Monkey Assistant</span>
            </motion.button>

            <AnimatePresence>
                {isChatOpen && (
                    <motion.div
                        ref={chatContainerRef}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-5 sm:bottom-20 right-0 sm:w-full w-[96vw] mx-[2vw] sm:max-w-sm shadow-lg z-[1000] bg-white dark:bg-black  rounded-lg overflow-hidden border "
                        style={{ maxHeight: "calc(100vh - 120px)" }}
                    >
                        <div className="border-b bg-gradient-to-r from-red-500 to-orange-500 text-white p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 ">
                                    <div className="w-6 h-6 rounded-full overflow-hidden">
                                        <Bot
                                            width={24}
                                            height={24}
                                        />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-semibold text-white m-0">
                                            Spirit Monkey Assistant
                                        </h2>
                                        <a
                                            href="/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs transition-colors text-white hover:text-white"
                                        >
                                            Powered by Spirit Monkey
                                        </a>
                                    </div>
                                </div>
                                <motion.button
                                    whileHover={{ rotate: 90 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={toggleChat}
                                    className=" hover:text-red-500 transition-colors"
                                    aria-label="Close chat"
                                >
                                    <X className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </div>

                        <div className="h-[50vh] overflow-y-auto p-3 bg-white/80 dark:bg-white/10">
                            {chatMessages.map((message, index) => (
                                <MessageBubble key={index} message={message} />
                            ))}
                            {isLoading && (
                                <div className="flex items-start gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                        <Image
                                            src="/spirit-monkey-icon.png"
                                            alt="Spirit Monkey Assistant"
                                            width={24}
                                            height={24}
                                            className="object-cover"
                                        />
                                    </div>
                                    <TypingIndicator />
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <motion.div
                            className="p-3 border-t bg-white dark:bg-gray-950"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={inputText}
                                    onChange={handleInputChange}
                                    onKeyDown={handleEnterKey}
                                    placeholder="Type your message..."
                                    className="flex-1 py-2 px-3 rounded-md focus:outline-none ring-gray-400 ring-[1px] border-none outline-none text-sm bg-white dark:bg-gray-950"
                                    disabled={isLoading}
                                />
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleSendMessage}
                                    disabled={isLoading}
                                    className="p-2 rounded-full bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`
        .overflow-y-auto {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
        }

        .overflow-y-auto::-webkit-scrollbar {
          width: 4px;
        }

        .overflow-y-auto::-webkit-scrollbar-track {
          background: transparent;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.3);
          border-radius: 2px;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.5);
        }
      `}</style>
        </>
    );
};

export default NovaMiniChat;