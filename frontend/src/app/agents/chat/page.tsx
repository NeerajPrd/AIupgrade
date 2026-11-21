"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import axios from '@/lib/api/axios';
import { X, Send, Trash2, Download, Copy, Bot } from "lucide-react";
import DOMPurify from "dompurify";
import Skeleton from "@/components/Skeleton";
import GradientBackground from "@/components/GradientBackground";
import { useSearchParams, useRouter } from "next/navigation";
import { showSuccessToast, showErrorToast } from "@/utils/toast";

interface Agent {
  agent_id: string;
  agent_name: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const TypingIndicator: React.FC = () => (
  <div className="flex space-x-2 p-4 max-w-[80%]">
    <div className="flex space-x-2">
      <div
        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <div
        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <div
        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  </div>
);

const AgentChat: React.FC = () => (
  <Suspense fallback={<ChatSkeleton />}>
    <AgentChatInner />
  </Suspense>
);

const ChatSkeleton: React.FC = () => (
  <div className="h-screen flex items-center justify-center">
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 bg-gray-200 rounded"></div>
      <div className="h-4 w-48 bg-gray-200 rounded"></div>
    </div>
  </div>
);

const MessageBubble: React.FC<{
  message: ChatMessage;
  onCopy: () => void;
}> = ({ message, onCopy }) => {
  const sanitizedContent = typeof window !== "undefined" ? DOMPurify.sanitize(message.content) : message.content;

  return (
    <div
      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
        } relative group`}
    >
      <div
        className={`
          ${message.role === "user"
            ? "bg-blue-500 text-white shadow-lg"
            : "bg-white dark:bg-gray-800 shadow-md"
          } 
          p-4 rounded-lg max-w-[80%] break-words relative transition-all duration-200
        `}
      >
        {message.role === "assistant" && (
          <div className="absolute -left-8 top-2">
            <Bot className="w-6 h-6 text-gray-500" />
          </div>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          className="prose dark:prose-invert max-w-none"
        >
          {sanitizedContent}
        </ReactMarkdown>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-2">
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          <button
            onClick={onCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            title="Copy message"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const AgentChatInner: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const agentDefault = searchParams.get("agent");

  const user_id =
    typeof window !== "undefined"
      ? JSON.parse(
        localStorage.getItem("user") || '{"_id":"66ac99b7a2f0a35b8b149299"}'
      )._id
      : "66ac99b7a2f0a35b8b149299";

  const scrollToBottom = () => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (agentDefault && agents.length > 0) {
      const defaultAgent = agents.find(
        (agent) => agent.agent_name === agentDefault
      );
      if (defaultAgent) setSelectedAgent(defaultAgent);
    }
  }, [agents, agentDefault]);

  useEffect(() => {
    if (selectedAgent) {
      const storedMessages = sessionStorage.getItem(selectedAgent.agent_id);
      if (storedMessages) {
        setMessages(JSON.parse(storedMessages));
      }
    }
  }, [selectedAgent]);

  useEffect(() => {
    if (selectedAgent) {
      sessionStorage.setItem(selectedAgent.agent_id, JSON.stringify(messages));
    }
    scrollToBottom();
  }, [messages, selectedAgent]);

  const fetchAgents = async () => {
    try {
      const response = await axios.post("/api/v1/agents", { user_id });
      setAgents(response.data);
    } catch (error) {
      showErrorToast("Failed to fetch agents");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccessToast("Copied to clipboard");
    } catch (err) {
      showErrorToast("Failed to copy");
    }
  };

  const downloadChat = () => {
    const chatContent = messages
      .map(
        (msg) =>
          `${msg.role.toUpperCase()} (${new Date(
            msg.timestamp
          ).toLocaleString()})\n${msg.content}\n\n`
      )
      .join("");
    const blob = new Blob([chatContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${selectedAgent?.agent_name
      }-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sendMessage = async () => {
    if (!userInput.trim() || !selectedAgent || isLoading) return;

    const newMessage: ChatMessage = {
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsTyping(true);
    setIsLoading(true);
    setUserInput("");

    try {
      const messagesAPI = [...messages, newMessage].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await axios.post(
        "/api/v1/upgrade/chat",
        {
          convo: messagesAPI,
          agent: true,
          agent_id: selectedAgent.agent_id,
        }
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.data.response || response.data,
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      showErrorToast("Failed to send message");
    } finally {
      setIsTyping(false);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-7xl justify-center mx-auto">
      <header className="border-b dark:border-gray-700 p-4 md:py-2.5 md:px-4 flex items-center justify-between bg-white dark:bg-gray-800 shadow-sm">
        <div className="flex items-center space-x-4">
          <img src="/spirit-monkey-icon.png" alt="AI Icon" className="w-8 h-8" />
          {selectedAgent && (
            <span className="font-medium text-lg">
              {selectedAgent.agent_name}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {messages.length > 0 && (
            <>
              <button
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-md transition-colors"
                onClick={downloadChat}
                title="Download chat"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-md transition-colors"
                onClick={() => setMessages([])}
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {selectedAgent && (
            <button
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-md transition-colors mr-10"
              onClick={() => {
                setSelectedAgent(null);
                router.push("/agents");
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 relative scroll-smooth">
        <GradientBackground />
        {selectedAgent ? (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                onCopy={() => copyToClipboard(message.content)}
              />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Bot className="w-16 h-16 mx-auto text-gray-400" />
              <h2 className="text-xl font-medium">
                Select an agent to start chatting
              </h2>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 border-t dark:border-gray-700 p-4 rounded-lg mb-2">
        <div className="max-w-4xl mx-auto flex">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-lg border dark:bg-gray-900 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
            placeholder={isLoading ? "Please wait..." : "Type your message"}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !userInput.trim()}
            className="ml-2 p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:hover:bg-blue-500"
          >
            <Send className={`w-5 h-5 ${isLoading ? "opacity-50" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentChat;
