"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IoMdLogOut } from "react-icons/io";
import { FiChevronRight, FiMenu, FiSettings } from "react-icons/fi";
import { LuWorkflow } from "react-icons/lu";
import { FaCode } from "react-icons/fa6";
import { TbDatabaseCog, TbUsers } from "react-icons/tb";

import { HumanizeTimestamp } from "@/utils/data/date";
import { showErrorToast } from "@/utils/toast";
import { getUpgradeChatIds } from "@/lib/api/chat";
import { useLogout, useMe } from "@/lib/store/user";
import { useDeleteChat } from "@/app/(chat1)/hooks/useUpgradeChat";
import ChatDropdown from "./chat/ChatDropdown";
import AgentDropdown from "./sidebar/AgentDropdown";
import { DeleteModal } from "./common/DeleteModal";

const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { historyId: chatHistoryId, agentId, chatId } = useParams();
  const searchParams = useSearchParams();

  const { data: user } = useMe();
  const { mutateAsync: deleteChat, isPending } = useDeleteChat();

  const [chatDropdownOpen, setChatDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeRoute, setActiveRoute] = useState("/new-chat");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [isMounted, setIsMounted] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  const logoutMutation = useLogout();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const { data } = useQuery({
    queryKey: ["chat-ids"],
    queryFn: getUpgradeChatIds,
  });

  const conversations = data?.data?.conversations ?? [];

  useEffect(() => {
    if (pathname === "/chat" || pathname.includes("/c/")) {
      setActiveRoute("/new-chat");
    } else if (pathname.includes("/agents")) {
      setActiveRoute("/agents");
    } else if (pathname.includes("/explore")) {
      setActiveRoute("/explore");
    } else if (pathname.includes("/coder")) {
      setActiveRoute("/coder");
    } else if (pathname.includes("/manage-models")) {
      setActiveRoute("/manage-models");
    }
  }, [pathname]);

  const handleChatDelete = async (uuid: string) => {
    if (typeof window === "undefined") return;
    try {
      await deleteChat(uuid);
    } catch (error) {
      showErrorToast("Error deleting conversation!");
    }
  };

  const handleLogin = async () => {
    router.push("/login");
  };

  const handleLogout = async () => {
    logoutMutation.mutate();
    router.push("/login");
  };

  const handleNewChat = () => {
    sessionStorage.removeItem("chatMessages");
    localStorage.removeItem("chat");
    setActiveRoute("/new-chat");
    router.push("/chat");
  };

  const excludedPaths = [
    "/login",
    "/",
    "/signup",
    "/forgot",
    "/privacy-policy",
    "/terms-and-conditions",
    "/deploy",
    "/subscribe",
  ];

  if (
    excludedPaths.includes(pathname) ||
    pathname.startsWith('/workflow/app') ||
    pathname.includes("verifyEmail") ||
    pathname.includes("resetPassword")
  ) {
    return null;
  }

  const navigationItems = [
    {
      icon: LuWorkflow,
      label: "Workflows",
      route: "/workflow/"
    },
    {
      icon: FaCode,
      label: "Vibe Coder",
      route: "/coder",
    },
    {
      icon: TbDatabaseCog,
      label: "Knowledge Base",
      route: "/knowledge-base",
    },
    {
      icon: FiSettings,
      label: "Manage Models",
      route: "/manage-models",
    },
    // Admin only: leads captured by website chats, and the monthly client report.
    ...(["admin", "superadmin"].includes(user?.role)
      ? [{ icon: TbUsers, label: "Leads", route: "/admin/leads" }]
      : []),
  ];

  if (!isMounted) return null;

  const userName = user?.name || user?.nickname || "User";
  const userPhoto = "https://placehold.net/avatar-4.png";

  return (
    <>
      <button
        onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        className={`md:hidden fixed top-4 left-4 z-[60] p-2 rounded-lg ${isMobileMenuOpen
          ? "bg-transparent ring-0"
          : "bg-white dark:bg-[#2e2e2e] shadow-lg ring-1 ring-black/5 dark:ring-white/5"
          }`}
        aria-label={isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"}
      >
        {isMobileMenuOpen ? null : (
          <FiMenu className="w-5 h-5 text-gray-600 dark:text-gray-200" />
        )}
      </button>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-[#2e2e2e]/40 backdrop-blur-sm z-50"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className="md:pl-[21px] md:py-[5vh] h-screen">
        <aside
          className={`
          fixed inset-y-0 left-0 z-50 overflow-hidden h-[100vh] md:h-[90vh] flex flex-col transition-all duration-300 md:rounded-2xl 
          ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:relative
          ${sidebarOpen ? "w-64" : "w-16"}
          bg-white dark:bg-[#2e2e2e] border-r border-gray-200 dark:border-gray-800
        `}
        >
          <div className="flex flex-col h-full">
            <header className="flex-shrink-0 h-14 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <Image
                  src="/Icon.svg"
                  alt="logo"
                  width={24}
                  height={24}
                  priority
                  className="flex-shrink-0"
                />
                {sidebarOpen && (
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Upgrade
                  </span>
                )}
              </div>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden md:flex items-center justify-center w-6 h-6 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <FiChevronRight
                  className={`transform transition-transform ${sidebarOpen ? "rotate-180" : ""
                    }`}
                />
              </button>
            </header>

            <nav className="flex-1 overflow-y-auto p-2 scrollbar-hide">
              {/* Chat History - Scrollable Area */}
              <ChatDropdown
                open={chatDropdownOpen}
                onToggle={() => setChatDropdownOpen((p) => !p)}
                chats={conversations}
                activeId={chatHistoryId as string}
                isActive={pathname === "/chat" || pathname.includes("/c/")}
                onSelect={(id) => router.push(`/c/${id}`)}
                onDelete={(id) => {
                  setChatToDelete(id);
                }}
                formatDate={HumanizeTimestamp}
                onNewChat={handleNewChat}
                isSidebarOpen={sidebarOpen}
              />
              {/* Agents Dropdown */}
              <AgentDropdown
                sidebarOpen={sidebarOpen}
                pathname={pathname}
                searchParams={searchParams}
                chatId={chatId as string}
                agentId={agentId as string}
                onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
                activeRoute={activeRoute}
                setActiveRoute={setActiveRoute}
              />

              {navigationItems.map((item) => (
                <div key={item.route} className="mb-1">
                  <button
                    onClick={() => {
                      router.push(item.route);
                      setActiveRoute(item.route);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-[15px] rounded-3xl text-sm flex items-center justify-between transition-colors
                    ${!sidebarOpen && "justify-center"}
                    ${activeRoute === item.route
                        ? "bg-white dark:bg-zinc-800 text-black dark:text-white font-medium shadow-sm"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2e2e2e]/50"
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon className="text-lg flex-shrink-0" />
                      {sidebarOpen && item.label}
                    </div>
                  </button>
                </div>
              ))}
            </nav>

            <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800">
              <div className="px-4 py-3">
                {user && (
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0">
                      <Image
                        src={userPhoto}
                        alt="User profile"
                        width={28}
                        height={28}
                        className={`rounded-full ring-1 ring-gray-200 dark:ring-gray-800 bg-cover w-[30px] h-[30px]`}
                      />
                    </div>
                    {sidebarOpen && (
                      <Link href="/profile">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {userName}
                          </div>
                        </div>
                      </Link>
                    )}
                  </div>
                )}
                {user ? (
                  <button
                    onClick={handleLogout}
                    className={`w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2.5 font-medium ${!sidebarOpen && "flex items-center justify-center"
                      }`}
                  >
                    <IoMdLogOut className="text-lg flex-shrink-0" />
                    {sidebarOpen && "Logout"}
                  </button>
                ) : (
                  <button
                    onClick={handleLogin}
                    className={`w-full px-3 py-2 text-sm text-orange-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2.5 font-medium ${!sidebarOpen && "flex items-center justify-center"
                      }`}
                  >
                    <IoMdLogOut className="text-lg flex-shrink-0" />
                    {sidebarOpen && "Login"}
                  </button>
                )}
              </div>
            </footer>
          </div>
        </aside>
      </div>

      <DeleteModal
        open={!!chatToDelete}
        onOpenChange={(open) => {
          if (!open) setChatToDelete(null);
        }}
        title="Delete Conversation"
        description="This conversation will be permanently removed from your history."
        confirmText="Delete"
        isLoading={isPending}
        onConfirm={async () => {
          if (!chatToDelete) return;

          await handleChatDelete(chatToDelete);
          setChatToDelete(null);
        }}
      />
    </>
  );
};

export default function SidebarWrapper() {
  return (
    <Suspense fallback={null}>
      <Sidebar />
    </Suspense>
  );
}