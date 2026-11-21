"use client"
import React, { useEffect, useRef } from 'react'
import { Message } from '@/lib/libs/messages';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import axios from '@/lib/api/axios';
import { Bot, ChevronDown, ChevronUp, Terminal, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const ChatMessageOutput = ({ msg }: { msg: Message }) => {
    const [imageUrl, setImageUrl] = React.useState<string | null>(null);
    const [isLogsVisible, setIsLogsVisible] = React.useState<boolean>(false);
    const toolSelectionRef = useRef<HTMLPreElement>(null);
    const systemLogsRef = useRef<HTMLPreElement>(null);
    const isUser = msg.role === "user"

    // Auto-scroll function for logs containers
    const scrollToBottom = (ref: React.RefObject<HTMLPreElement>) => {
        if (ref.current) {
            ref.current.scrollTop = ref.current.scrollHeight;
        }
    };

    // Auto-scroll when tool selection content changes
    useEffect(() => {
        if (msg.message.toolSelection && isLogsVisible) {
            scrollToBottom(toolSelectionRef);
        }
    }, [msg.message.toolSelection, isLogsVisible]);

    // Auto-scroll when system logs content changes
    useEffect(() => {
        if (msg.message.logs && isLogsVisible) {
            scrollToBottom(systemLogsRef);
        }
    }, [msg.message.logs, isLogsVisible]);

    useEffect(() => {
        const getImageUrl = async (image: string) => {
            if (!image) return null;
            
            // If it is already a complete base64 data URL or a local blob URL, use it directly
            if (image.startsWith('data:') || image.startsWith('blob:')) {
                setImageUrl(image);
                return;
            }

            // If it is a raw base64 string block (e.g., starts with normal base64 strings), format as dataURL
            if (image.length > 100 && !image.includes(' ') && !image.includes('/')) {
                setImageUrl(`data:image/png;base64,${image}`);
                return;
            }

            let imagePath = image;
            if (image.endsWith('\n')) {
                console.log("Image path ends with /, removing it")
                imagePath = image.slice(0, -1);
            } else {
                imagePath = image;
            }
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
            const finalUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${imagePath.replace(/^\//, '')}` : `/${imagePath.replace(/^\//, '')}`;
            setImageUrl(finalUrl);
        }
        if (!msg.message.image) return;
        getImageUrl(msg.message.image)
    }, [msg.message.image])

    return (
        <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-4`}>
            <div className={`flex max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"} gap-2`}>
                {/* Avatar */}
                <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isUser
                        ? " dark:text-white text-black"
                        : " dark:text-white text-black"
                        }`}
                >
                    {isUser ? <User size={14} /> : <Bot size={14} />}
                </div>

                {/* Message Content */}
                <div className="flex flex-col gap-1.5 min-w-0">
                    {!isUser && (msg.message.logs || msg.message.toolSelection) && (
                        <Collapsible open={isLogsVisible} onOpenChange={setIsLogsVisible}>
                            <CollapsibleTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-fit h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors dark:text-gray-400 dark:hover:text-gray-200"
                                >
                                    <Terminal size={10} className="mr-1" />
                                    View Logs
                                    {isLogsVisible ? (
                                        <ChevronUp size={10} className="ml-1" />
                                    ) : (
                                        <ChevronDown size={10} className="ml-1" />
                                    )}
                                </Button>
                            </CollapsibleTrigger>

                            <CollapsibleContent className="space-y-1.5 mt-1.5">
                                {/* Tool Selection */}
                                {msg.message.toolSelection && (
                                    <Card className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-colors duration-200">
                                        <CardContent className="p-2">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Terminal size={12} className="text-slate-600 dark:text-slate-400" />
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] py-0 px-1.5 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                                >
                                                    Tools Selection
                                                </Badge>
                                            </div>
                                            <pre
                                                ref={toolSelectionRef}
                                                className="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words overflow-x-auto max-h-64 overflow-y-auto scroll-smooth"
                                            >
                                                <ReactMarkdown
                                                    components={{
                                                        p: ({ children }) => (
                                                            <p className="text-xs font-mono leading-relaxed mb-1 last:mb-0">{children}</p>
                                                        ),
                                                        a: ({ node, children, ...props }) => (
                                                            <a
                                                                {...props}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline transition-colors"
                                                            >
                                                                {children}
                                                            </a>
                                                        ),
                                                    }}
                                                >
                                                    {msg.message.toolSelection}
                                                </ReactMarkdown>
                                            </pre>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* System Logs */}
                                {msg.message.logs && (
                                    <Card className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 transition-colors duration-200">
                                        <CardContent className="p-2">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Terminal size={12} className="text-slate-600 dark:text-slate-400" />
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] py-0 px-1.5 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                                >
                                                    System Logs
                                                </Badge>
                                            </div>
                                            <pre
                                                ref={systemLogsRef}
                                                className="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words overflow-x-auto max-h-64 overflow-y-auto scroll-smooth"
                                            >
                                                <ReactMarkdown
                                                    components={{
                                                        p: ({ children }) => (
                                                            <p className="text-xs font-mono leading-relaxed mb-1 last:mb-0">{children}</p>
                                                        ),
                                                        a: ({ node, children, ...props }) => (
                                                            <a
                                                                {...props}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline transition-colors"
                                                            >
                                                                {children}
                                                            </a>
                                                        ),
                                                    }}
                                                >
                                                    {msg.message.logs}
                                                </ReactMarkdown>
                                            </pre>
                                        </CardContent>
                                    </Card>
                                )}
                            </CollapsibleContent>
                        </Collapsible>
                    )}
                    {msg.message.data && msg.message.data.length > 0 &&
                        <div
                            className={`${isUser
                                ? " rounded-2xl rounded-tr-sm "
                                : " rounded-2xl rounded-tl-sm "
                                }bg-slate-100 dark:bg-navy-900 text-black dark:text-gray-100  border-slate-200/40 dark:border-neutral-800  px-4 py-2.5 shadow-sm max-w-2xl transition-all duration-200`}
                        >
                            {/* Image */}
                            {imageUrl && imageUrl !== "" && (
                                <div className="mb-2">
                                    <Image
                                        src={imageUrl || "/placeholder.svg"}
                                        alt="Message attachment"
                                        width={400}
                                        height={240}
                                        className="rounded-lg max-w-full h-auto border border-border/20 dark:border-gray-600/20"
                                    />
                                </div>
                            )}

                            {/* Message Text */}
                            {msg.message.data && (
                                <div className="prose prose-xs dark:prose-invert max-w-none break-words leading-relaxed [&_*]:text-[15px]">
                                    <ReactMarkdown
                                        components={{
                                            a: ({ node, children, ...props }) => (
                                                <a
                                                    {...props}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`${isUser
                                                        ? "text-white underline hover:text-orange-100"
                                                        : "text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
                                                        } transition-colors`}
                                                >
                                                    {children}
                                                </a>
                                            ),
                                            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                            code: ({ children }) => (
                                                <code
                                                    className={`px-1 py-0.5 rounded text-[11px] font-mono ${isUser
                                                        ? "bg-orange-700/60 text-orange-100"
                                                        : "bg-muted text-muted-foreground dark:bg-neutral-800 dark:text-gray-300"
                                                        }`}
                                                >
                                                    {children}
                                                </code>
                                            ),
                                            img: ({ src, alt }) => (
                                                <img 
                                                    src={src} 
                                                    alt={alt} 
                                                    className="rounded-lg max-w-full h-auto border border-border/20 dark:border-neutral-700 my-2 shadow-sm"
                                                />
                                            ),
                                        }}
                                    >
                                        {msg.message.data}
                                    </ReactMarkdown>
                                </div>
                            )}

                            {/* Render Metadata Items (like generated images) */}
                            {msg.message.metadata?.data && msg.message.metadata.data.length > 0 && (
                                <div className="mt-3 flex flex-col gap-3">
                                    {msg.message.metadata.data.map((item, index) => {
                                        if (item.type === "generated_image" && typeof item.data === "object" && item.data !== null) {
                                            const imgData = item.data as {
                                                url: string;
                                                db_id: string;
                                                prompt: string;
                                                summary: string;
                                                asset_type: string;
                                            };
                                            const imgUrl = imgData.url ? (imgData.url.startsWith("http://") || imgData.url.startsWith("https://") ? imgData.url : `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_API_URL || ""}${imgData.url.startsWith("/") ? "" : "/"}${imgData.url}`) : "";
                                            return (
                                                <div key={index} className="rounded-lg overflow-hidden border border-slate-200 dark:border-neutral-800 bg-white dark:bg-black/20 max-w-lg shadow-sm">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={imgUrl}
                                                        alt={imgData.summary || "Generated Image"}
                                                        className="w-full h-auto object-cover"
                                                    />
                                                    {imgData.summary && (
                                                        <div className="p-2.5 text-xs text-slate-500 dark:text-slate-400 italic border-t border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/40">
                                                            {imgData.summary}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        if (item.type === "generated_video" && typeof item.data === "object" && item.data !== null) {
                                            const videoData = item.data as {
                                                url: string;
                                                db_id: string;
                                                prompt: string;
                                                summary: string;
                                                asset_type: string;
                                            };
                                            const videoUrl = videoData.url ? (videoData.url.startsWith("http://") || videoData.url.startsWith("https://") ? videoData.url : `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_API_URL || ""}${videoData.url.startsWith("/") ? "" : "/"}${videoData.url}`) : "";
                                            return (
                                                <div key={index} className="rounded-lg overflow-hidden border border-slate-200 dark:border-neutral-800 bg-white dark:bg-black/20 max-w-lg shadow-sm">
                                                    <video
                                                        src={videoUrl}
                                                        controls
                                                        className="w-full h-auto"
                                                    />
                                                    {videoData.summary && (
                                                        <div className="p-2.5 text-xs text-slate-500 dark:text-slate-400 italic border-t border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/40">
                                                            {videoData.summary}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            )}
                        </div>
                    }

                </div >
            </div >
        </div >
    )
}

export default ChatMessageOutput