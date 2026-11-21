"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { GoDependabot } from "react-icons/go";
import { FiChevronRight } from "react-icons/fi";
import axios from "@/lib/api/axios";
import { API_ENDPOINTS } from "@/utils/api/api";
import { getMyAgents } from "@/lib/api/agent";
import { IoMdAdd } from "react-icons/io";

interface AgentDropdownProps {
  sidebarOpen: boolean;
  pathname: string;
  searchParams: any; // Next.js searchParams object
  chatId?: string;
  agentId?: string;
  onCloseMobileMenu: () => void;
  activeRoute: string;
  setActiveRoute: (route: string) => void;
}

export default function AgentDropdown({
  sidebarOpen,
  pathname,
  searchParams,
  chatId,
  agentId,
  onCloseMobileMenu,
  activeRoute,
  setActiveRoute,
}: AgentDropdownProps) {
  const router = useRouter();
  const [expandedAgent, setExpandedAgent] = useState(true);
  const [expandedAgentsNav, setExpandedAgentsNav] = useState(pathname.startsWith("/agents"));

  useEffect(() => {
    if (pathname.startsWith("/agents")) {
      setExpandedAgentsNav(true);
    }
    if (agentId) {
      setExpandedAgent(true);
    }
  }, [pathname, agentId]);

  const { data: myAgents } = useQuery({
    queryKey: ['my_agents'],
    queryFn: getMyAgents
  });

  const matchedAgent = myAgents?.data?.agents.find((a: any) => a.id === agentId || a._id === agentId);
  const agentName = matchedAgent?.name || matchedAgent?.profile?.agent_name || "Selected Agent";

  const { data: agentData, isLoading: isLoadingAgentHistory } = useQuery({
    queryKey: ["agent-conversations", agentId],
    queryFn: async () => {
      const response = await axios.get(`${API_ENDPOINTS.AGENT}/agent/chat/${agentId}/conversations`);
      return response.data.data.history || [];
    },
    enabled: !!agentId,
  });

  const agentConversations = (agentData || []).sort(
    (a: any, b: any) =>
      new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  );

  let agentSubItems: any[] = [
    { label: "All Agents", route: "/agents", isAllAgents: true }
  ];

  if (agentId) {
    agentSubItems.push({
      label: agentName,
      isGroup: true,
      chats: agentConversations.map((chat: any) => ({
        label: chat.title || "Untitled Conversation",
        route: `/agents/${agentId}/chat/${chat.id}`,
        isChat: true,
        id: chat.id,
      })),
    });
  }

  const isAgentsActive = activeRoute === "/agents" || pathname.startsWith("/agents");

  return (
    <div className="mb-1">
      <button
        onClick={() => {
          if (!isAgentsActive) {
            router.push("/agents");
            setActiveRoute("/agents");
            setExpandedAgentsNav(true);
          } else {
            setExpandedAgentsNav(!expandedAgentsNav);
          }
          onCloseMobileMenu();
        }}
        className={`w-full text-left px-3 py-[15px] rounded-3xl text-sm flex items-center justify-between transition-colors
        ${!sidebarOpen && "justify-center"}
        ${isAgentsActive
            ? "bg-primary text-primary-foreground font-medium"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-800/50"
          }`}
      >
        <div className="flex items-center gap-2.5">
          <GoDependabot className="text-lg flex-shrink-0" />
          {sidebarOpen && "Agents"}
        </div>
        {sidebarOpen && (
          <FiChevronRight className={`w-4 h-4 shrink-0 transition-transform ${expandedAgentsNav ? "rotate-90" : ""}`} />
        )}
      </button>

      {/* Render subItems */}
      {expandedAgentsNav && isAgentsActive && sidebarOpen && (
        <div className="pl-6 flex flex-col gap-1 mt-1">
          {agentSubItems.map((sub, idx) => {
            if (sub.isAllAgents) {
              return (
                <button
                  key={idx}
                  onClick={() => {
                    router.push(sub.route);
                    onCloseMobileMenu();
                  }}
                  className={`text-left text-xs px-3 py-2 rounded-xl transition-colors truncate shrink-0 ${pathname === "/agents"
                    ? "bg-accent text-accent-foreground font-semibold border border-primary/20 shadow-sm"
                    : "text-gray-700 dark:text-gray-300 font-medium hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50"
                    }`}
                >
                  {sub.label}
                </button>
              )
            }

            if (sub.isGroup) {
              return (
                <div key={idx} className="mt-2 flex flex-col">
                  <button
                    onClick={() => setExpandedAgent(!expandedAgent)}
                    className="text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white uppercase tracking-wider mb-2 px-3 flex items-center justify-between w-full transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></div>
                      <span className="truncate">{sub.label}</span>
                    </div>
                    <FiChevronRight className={`w-4 h-4 shrink-0 transition-transform ${expandedAgent ? "rotate-90" : ""}`} />
                  </button>
                  {expandedAgent && (
                    <div className="pl-4 flex flex-col gap-1 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1 relative border-l-2 border-gray-100 dark:border-gray-800 ml-3">
                      <button
                        onClick={() => {
                          router.push(`/agents/${agentId}/chat`);
                          onCloseMobileMenu();
                        }}
                        className={`flex items-center gap-2 text-left text-xs px-3 py-2 rounded-xl transition-colors truncate shrink-0 ${(!chatId && pathname === `/agents/${agentId}/chat`)
                          ? "bg-accent text-accent-foreground font-semibold border border-primary/20 shadow-sm"
                          : "text-gray-700 dark:text-gray-300 font-medium hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50"
                          }`}
                      >
                        <IoMdAdd className="w-4 h-4" />
                        New Chat
                      </button>
                      
                      {isLoadingAgentHistory && (
                        <div className="flex items-center gap-2 py-2 px-3 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Loading history...</span>
                        </div>
                      )}
                      
                      {sub.chats.map((chatItem: any, cIdx: number) => {
                        const isActive = chatItem.isChat && chatId === chatItem.id;
                        return (
                          <button
                            key={cIdx}
                            onClick={() => {
                              router.push(chatItem.route);
                              onCloseMobileMenu();
                            }}
                            className={`text-left text-xs px-3 py-2 rounded-xl transition-colors truncate shrink-0 ${isActive
                              ? "bg-accent text-accent-foreground font-semibold border border-primary/20 shadow-sm"
                              : "text-gray-700 dark:text-gray-300 font-medium hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50"
                              }`}
                          >
                            {chatItem.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}