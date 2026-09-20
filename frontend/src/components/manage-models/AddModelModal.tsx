"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useUserStore } from "@/lib/store/user";
import { Provider, Feature, ModelConfig, ModelResponse } from "@/lib/schemas/model";
import { createModel, getModelById, updateModelById } from "@/lib/api/models";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showErrorToast, showSuccessToast } from "@/utils/toast";
import { getWorkflows } from "@/lib/api/workflow";
import { getMyAgents, listAgents } from "@/lib/api/agent";

const PROVIDERS = [
  { id: Provider.OPENAI, name: "OpenAI" },
  { id: Provider.GEMINI, name: "Gemini" },
  { id: Provider.HUGGING_FACE, name: "Hugging Face" },
  { id: Provider.GROQ, name: "Groq" },
  { id: Provider.ANTHROPIC, name: "Anthropic" },
  { id: Provider.PERPLEXITY, name: "Perplexity" },
  { id: Provider.LOCALHOST, name: "Localhost" },
];

interface AddModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingModelId?: string | null;
}

export function AddModelModal({ isOpen, onClose, editingModelId }: AddModelModalProps) {
  const { user } = useUserStore();
  const queryClient = useQueryClient();

  // Form states
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<string>("");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [useForChat, setUseForChat] = useState(false);
  const [useForVibeCoder, setUseForVibeCoder] = useState(false);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // TanStack Queries for Workflows and Agents
  const { data: workflows  } = useQuery({
    queryKey: ["workflows"],
    queryFn: getWorkflows,
  });

  const workflowsList = workflows?.data || (Array.isArray(workflows) ? workflows : []);

  console.log(workflows)

  const { data: myAgents } = useQuery({
    queryKey: ['my_agents'],
    queryFn: getMyAgents
  });

  const agents = myAgents?.data?.agents
  // Fetch single model data if editing
  const { data: editModel, isLoading: loadingEditModel } = useQuery<ModelResponse>({
    queryKey: ["model", editingModelId],
    queryFn: () => getModelById(editingModelId!),
    enabled: !!editingModelId && isOpen,
  });

  // Prefill form states on edit model load
  useEffect(() => {
    if (editingModelId && editModel) {
      const model = (editModel as any).data || editModel;
      setProvider(model.provider || "");
      setName(model.name || "");
      setModelId(model.model_id || "");
      setApiKey("");
      setBaseUrl(model.base_url || "");
      setUseForChat(model.features?.includes(Feature.CHAT) || false);
      setUseForVibeCoder(model.features?.includes(Feature.VIBE_CODER) || false);
      setSelectedWorkflows(model.workflow_ids || []);
      setSelectedAgents(model.agent_ids || []);
    } else if (!editingModelId) {
      // Clear form when opening for fresh creation
      setProvider("");
      setName("");
      setModelId("");
      setApiKey("");
      setBaseUrl("");
      setUseForChat(false);
      setUseForVibeCoder(false);
      setSelectedWorkflows([]);
      setSelectedAgents([]);
    }
  }, [editingModelId, editModel, isOpen]);

  // TanStack Mutation for Creating Model
  const createModelMutation = useMutation({
    mutationFn: createModel,
    onSuccess: () => {
      showSuccessToast("Provider configuration saved successfully.")
      queryClient.invalidateQueries({ queryKey: ["models"] });
      onClose();
    },
    onError: () => {
      showErrorToast("Failed to save configuration.")
    },
  });

  // TanStack Mutation for Updating Model
  const updateModelMutation = useMutation({
    mutationFn: (payload: ModelConfig) => updateModelById(editingModelId!, payload),
    onSuccess: () => {
      showSuccessToast("Provider configuration updated successfully.")
      queryClient.invalidateQueries({ queryKey: ["models"] });
      onClose();
    },
    onError: () => {
      showErrorToast("Failed to update configuration.")
    },
  });

  const handleSave = async () => {
    if (!name.trim()) {
      showErrorToast("Please enter a configuration name.");
      return;
    }

    if (!provider) {
      showErrorToast("Please select a provider.")
      return;
    }

    if (!modelId.trim()) {
      showErrorToast("Please enter a Model ID.");
      return;
    }

    if (!apiKey && !editingModelId) {
      showErrorToast("Please enter an API Key.")
      return;
    }

    const activeFeatures: Feature[] = [];
    if (useForChat) activeFeatures.push(Feature.CHAT);
    if (selectedWorkflows.length > 0) activeFeatures.push(Feature.WORKFLOW);
    if (selectedAgents.length > 0) activeFeatures.push(Feature.AGENTS);
    if (useForVibeCoder) activeFeatures.push(Feature.VIBE_CODER);

    const payload: ModelConfig = {
      name: name,
      provider: provider as Provider,
      model_id: modelId,
      api_key: apiKey ? apiKey : undefined,
      features: activeFeatures,
      agent_ids: selectedAgents,
      workflow_ids: selectedWorkflows,
    };

    if (editingModelId) {
      updateModelMutation.mutate(payload);
    } else {
      createModelMutation.mutate(payload);
    }
  };

  const handleSelectAllWorkflows = (checked: boolean) => {
    if (checked) {
      setSelectedWorkflows(workflowsList.map((w: any) => w.id || w._id));
    } else {
      setSelectedWorkflows([]);
    }
  };

  const handleSelectAllAgents = (checked: boolean) => {
    if (checked) {
      setSelectedAgents(agents.map((a: any) => a.id || a._id));
    } else {
      setSelectedAgents([]);
    }
  };

  const isSaving = createModelMutation.isPending || updateModelMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl bg-white dark:bg-[#2e2e2e] border border-slate-200 dark:border-gray-800 text-slate-800 dark:text-gray-200 max-h-[90vh] overflow-y-auto"
        // Only the X button should discard a typed API key / provider config.
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-gray-100">
            {editingModelId ? "Edit Model Configuration" : "Add New Model Configuration"}
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-gray-400">
            {editingModelId
              ? "Update this LLM provider's allocations and access credentials."
              : "Configure a custom LLM provider with API keys and allocate it to specific features."}
          </DialogDescription>
        </DialogHeader>

        {editingModelId && loadingEditModel ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold border-b border-slate-100 dark:border-gray-800 pb-2">1. Provider Settings</h2>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Configuration Name</label>
                <Input
                  placeholder="e.g. GPT-4o Standard, Gemini Pro Production"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-50 dark:bg-[#1e1e1e] border-slate-200 dark:border-gray-700 text-slate-850 dark:text-gray-200 focus-visible:ring-slate-300 dark:focus-visible:ring-gray-600"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Select Provider</label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-[#1e1e1e] border border-slate-200 dark:border-gray-700 text-slate-850 dark:text-gray-200">
                    <SelectValue placeholder="Choose a provider..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#2e2e2e] border border-slate-200 dark:border-gray-700 text-slate-800 dark:text-gray-200">
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Model ID</label>
                <Input
                  placeholder="e.g. gpt-4o, gemini-1.5-pro, deepseek-coder"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="bg-slate-50 dark:bg-[#1e1e1e] border-slate-200 dark:border-gray-700 text-slate-850 dark:text-gray-200 focus-visible:ring-slate-300 dark:focus-visible:ring-gray-600"
                />
              </div>

              {provider === "custom" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Base URL</label>
                  <Input
                    placeholder="https://api.your-custom-provider.com/v1"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="bg-slate-50 dark:bg-[#1e1e1e] border-slate-200 dark:border-gray-700 text-slate-850 dark:text-gray-200 focus-visible:ring-slate-300 dark:focus-visible:ring-gray-600"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-gray-300">
                  API Key {editingModelId && "(Leave empty to keep current)"}
                </label>
                <Input
                  type="password"
                  placeholder={editingModelId ? "••••••••••••" : "Enter your API key"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-slate-50 dark:bg-[#1e1e1e] border-slate-200 dark:border-gray-700 text-slate-850 dark:text-gray-200 focus-visible:ring-slate-300 dark:focus-visible:ring-gray-600"
                />
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-lg font-semibold border-b border-slate-100 dark:border-gray-800 pb-2">2. Feature Allocation</h2>
              <p className="text-sm text-slate-500 dark:text-gray-400">Select where you want to use this provider's default model.</p>

              <div className="flex items-center space-x-3 bg-slate-50 dark:bg-[#1e1e1e] p-3 rounded-md border border-slate-200 dark:border-gray-800">
                <input
                  type="checkbox"
                  id="use-chat"
                  className="w-4 h-4 rounded border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-300 focus:ring-gray-500 focus:ring-offset-gray-900"
                  checked={useForChat}
                  onChange={(e) => setUseForChat(e.target.checked)}
                />
                <label htmlFor="use-chat" className="text-sm font-medium leading-none cursor-pointer">
                  Use for standard Chat
                </label>
              </div>

              <div className="flex items-center space-x-3 bg-slate-50 dark:bg-[#1e1e1e] p-3 rounded-md border border-slate-200 dark:border-gray-800">
                <input
                  type="checkbox"
                  id="use-vibe-coder"
                  className="w-4 h-4 rounded border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-300 focus:ring-gray-500 focus:ring-offset-gray-900"
                  checked={useForVibeCoder}
                  onChange={(e) => setUseForVibeCoder(e.target.checked)}
                />
                <label htmlFor="use-vibe-coder" className="text-sm font-medium leading-none cursor-pointer">
                  Use for Vibe Coder
                </label>
              </div>

              <div className="space-y-3 bg-slate-50 dark:bg-[#1e1e1e] p-4 rounded-md border border-slate-200 dark:border-gray-800">
                <div className="flex items-center space-x-3 border-b border-slate-200 dark:border-gray-800 pb-3">
                  <input
                    type="checkbox"
                    id="all-workflows"
                    className="w-4 h-4 rounded border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-300 focus:ring-gray-500 focus:ring-offset-gray-900"
                    checked={selectedWorkflows.length === workflowsList.length && workflowsList.length > 0}
                    onChange={(e) => handleSelectAllWorkflows(e.target.checked)}
                    disabled={workflowsList.length === 0}
                  />
                  <label htmlFor="all-workflows" className={`text-sm font-bold ${workflowsList.length === 0 ? "text-slate-400 dark:text-gray-600" : "text-slate-700 dark:text-gray-300"} cursor-pointer`}>
                    Workflows (Select All)
                  </label>
                </div>

                <div className="pl-2 space-y-3 pt-1">
                  {workflowsList.length === 0 ? (
                    <p className="text-sm text-slate-500 italic px-5">No specific workflow found.</p>
                  ) : (
                    workflowsList.map((wf: any) => {
                      const id = wf.id || wf._id;
                      return (
                        <div key={id} className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            id={`wf-${id}`}
                            className="w-4 h-4 rounded border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-300 focus:ring-gray-500 focus:ring-offset-gray-900"
                            checked={selectedWorkflows.includes(id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWorkflows([...selectedWorkflows, id]);
                              } else {
                                setSelectedWorkflows(selectedWorkflows.filter((wfId) => wfId !== id));
                              }
                            }}
                          />
                          <label htmlFor={`wf-${id}`} className="text-sm text-slate-600 dark:text-gray-400 cursor-pointer">
                            {wf.name || wf.title || "Untitled Workflow"}
                          </label>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 dark:bg-[#1e1e1e] p-4 rounded-md border border-slate-200 dark:border-gray-800">
                <div className="flex items-center space-x-3 border-b border-slate-200 dark:border-gray-800 pb-3">
                  <input
                    type="checkbox"
                    id="all-agents"
                    className="w-4 h-4 rounded border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-300 focus:ring-gray-500 focus:ring-offset-gray-900"
                    checked={selectedAgents.length === agents.length && agents.length > 0}
                    onChange={(e) => handleSelectAllAgents(e.target.checked)}
                    disabled={agents.length === 0}
                  />
                  <label htmlFor="all-agents" className={`text-sm font-bold ${agents.length === 0 ? "text-slate-400 dark:text-gray-600" : "text-slate-700 dark:text-gray-300"} cursor-pointer`}>
                    Agents (Select All)
                  </label>
                </div>
                <div className="pl-2 space-y-3 pt-1">
                  {agents.length === 0 ? (
                    <p className="text-sm text-slate-500 italic px-5">No specific agent found.</p>
                  ) : (
                    agents.map((agent: any) => {
                      const id = agent.id || agent._id;
                      return (
                        <div key={id} className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            id={`ag-${id}`}
                            className="w-4 h-4 rounded border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-300 focus:ring-gray-500 focus:ring-offset-gray-900"
                            checked={selectedAgents.includes(id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAgents([...selectedAgents, id]);
                              } else {
                                setSelectedAgents(selectedAgents.filter((agId) => agId !== id));
                              }
                            }}
                          />
                          <label htmlFor={`ag-${id}`} className="text-sm text-slate-600 dark:text-gray-400 cursor-pointer">
                            {agent.name || agent.title || "Untitled Agent"}
                          </label>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-4 border-t border-slate-200 dark:border-gray-800">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 border-slate-300 dark:border-gray-700 bg-transparent text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Configuration"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
