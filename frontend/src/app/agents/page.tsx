"use client";
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { CreateAgentDialog } from "./components/create-agent";
import AgentCard from "./components/agent-card";
import { API_ENDPOINTS } from "@/utils/api/api";
import { IAgentView } from "@/types/agent";
import axios from "@/lib/api/axios";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/lib/store/user";
import { listAgentSpend } from "@/lib/api/admin";

const AgentCardSkeleton = () => (
  <Card className="overflow-hidden animate-pulse">
    <CardHeader className="flex flex-row items-center gap-4 pb-2">
      <div className="w-[50px] h-[50px] rounded-full bg-muted bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-muted bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-3 bg-muted bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      <div className="h-3 bg-muted bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-3 bg-muted bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
    </CardContent>
    <CardFooter className="flex justify-end gap-2 border-t p-4">
      <div className="h-8 bg-muted bg-gray-200 dark:bg-gray-700 rounded w-16" />
      <div className="h-8 bg-muted bg-gray-200 dark:bg-gray-700 rounded w-16" />
    </CardFooter>
  </Card>
);

export default function AgentsPage() {
  const { data: user } = useMe();
  const userId = user?._id || user?.id || user?.uuid || user?.data?.user?.id || user?.data?.id || user?.data?._id;

  // Fetch all agents
  const { data: allAgents = [], isLoading } = useQuery<IAgentView[]>({
    queryKey: ['agents', 'all'],
    queryFn: async () => {
      // Assuming /agent returns all available agents
      const response = await axios.get(`${API_ENDPOINTS.AGENT}/agent`);
      return response.data?.data?.agents || response.data?.agents || [];
    }
  });

  // Filter based on ownership
  const userAgents = allAgents.filter(agent => (agent as any).user_id === userId);

  // Admins see each assistant's AI spending this month (only agents with a published API have it).
  const isAdmin = ["admin", "superadmin"].includes(user?.role);
  const { data: spendList = [] } = useQuery({
    queryKey: ["admin", "agent-spend", "all"],
    queryFn: listAgentSpend,
    enabled: isAdmin,
    retry: false,
  });
  const spendByAgent = new Map(spendList.map((s) => [s.agent_id, s]));

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Agents</h1>
          <p className="text-muted-foreground mt-1">Manage your custom agents</p>
        </div>
        <CreateAgentDialog>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Button>
        </CreateAgentDialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="flex flex-col items-center justify-center h-full min-h-[220px] border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <CreateAgentDialog>
              <div className="cursor-pointer text-center">
                <Button variant="outline" className="h-20 w-20 rounded-full">
                  <Plus className="h-10 w-10" />
                </Button>
                <p className="mt-4 text-sm font-medium">Create New Agent</p>
              </div>
            </CreateAgentDialog>
          </CardContent>
        </Card>
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <AgentCardSkeleton key={i} />
          ))
        ) : userAgents.length > 0 ? (
          userAgents.map((agent) => (
            <AgentCard key={(agent as any)._id || (agent as any).id} agent={agent} isCustom
              spend={spendByAgent.get((agent as any)._id || (agent as any).id)} />
          ))
        ) : (
          <p className="text-muted-foreground col-span-full py-8 text-center">You have not created any agents yet</p>
        )}
        
      </div>
    </div>
  )
}
