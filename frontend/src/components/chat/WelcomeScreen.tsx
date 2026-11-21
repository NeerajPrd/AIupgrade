"use client";

import { getGreeting } from "@/utils/api/user";
import WeatherWidget from "../WeatherWidget";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/store/user";
import { MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getUpgradeChatIds } from "@/lib/api/chat";
import { getModels } from "@/lib/api/models";
import { Button } from "@/components/ui/button";

export const WelcomeScreen = () => {
  const { data: user } = useMe();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ["chat-ids"],
    queryFn: getUpgradeChatIds,
  });

  const { data: allModels, isLoading:loadingModels } = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
  });

  const modelList = allModels?.data || allModels || [];
  const conversations = data?.data?.conversations ?? [];

  return (
    <div className="flex flex-col py-[20px] justify-between min-h-full">

      {/* HEADER */}
      <div className="flex flex-col gap-1">

        <div className="text-lg md:text-4xl font-semibold text-black dark:text-brand-50">
          {getGreeting()}, {user?.name ? user.name.split(" ")[0] : "Guest"}!

        </div>

        {!loadingModels && modelList.length === 0 ? (
          <div className="mt-4 p-6 gap-3 bg-white/40 flex-1 backdrop-blur-3xl border border-gray-100 dark:border-gray-700  dark:bg-navy-800 rounded-lg shadow-md flex flex-col items-start">
            <div className="text-sm md:text-lg font-medium text-black dark:text-brand-50">
              Add API model to begin chatting.
            </div>
            <Button
              onClick={() => router.push("/manage-models")}
            >
              Manage Models
            </Button>
          </div>
        ) : (
          <div className="text-sm md:text-xl text-black dark:text-brand-50">
            How can I help you today?
          </div>
        )}
      </div>

      {/* MAIN CONTENT (moved lower) */}
      <div className="flex flex-col gap-6 w-full mt-4">

        <div className="flex-1 flex flex-col justify-start">
          <WeatherWidget />
        </div>

        <div className="flex-1 flex flex-col">

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-black dark:text-white">
              Recent conversations
            </h2>
          </div>

          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
            {conversations.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                No conversations yet.
              </div>
            ) : (
              conversations.slice(0, 3).map((chat: any) => (
                <motion.div
                  key={chat.conversation_id}
                  whileHover={{ scale: 1.01 }}
                  onClick={() => router.push(`/c/${chat.conversation_id}`)}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white/40 dark:bg-navy-800 border border-gray-200 dark:border-gray-700 cursor-pointer"
                >
                  <MessageSquare className="text-gray-500 w-4 h-4 mt-0.5 flex-shrink-0" />

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="text-xs font-medium text-black dark:text-white truncate">
                      {chat.last_message || "New Chat"}
                    </div>

                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Open conversation
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};