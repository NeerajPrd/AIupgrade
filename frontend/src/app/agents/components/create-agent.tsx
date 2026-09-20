"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronRight, FileText, ImageIcon, Settings, Sparkles, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Sidebar,
    SidebarContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from "@/components/ui/sidebar"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { agentSchema, AgentFormData } from "@/lib/schemas/agent"
import * as agentApi from "@/lib/api/agent"
import { showSuccessToast, showErrorToast } from "@/utils/toast"
import BasicInformationForm from "./agent-form-components/basic-information"
import ToolsForm from "./agent-form-components/tools"
import AIModelSettingsForm from "./agent-form-components/ai-model-settings"
import SystemPromptForm from "./agent-form-components/system-prompt"
import KnowledgeBaseForm from "./agent-form-components/knowledge-base"
import { useMe } from "@/lib/store/user"

const defaultValues: AgentFormData = {
    profile: {
        agent_name: "",
        description: "",
        image: "",
    },
    knowledge_base: {
        urls: [],
        uploaded_files: [],
    },
    system_prompt: "",
    model_settings: {
        llm_model: "openAI",
        temperature: 0,
    },
    is_public: false,
    tools: [],
}

export function CreateAgentDialog({ children, agentToEdit, isOpen, onClose }: { children?: React.ReactNode, agentToEdit?: any, isOpen?: boolean, onClose?: () => void }) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = isOpen !== undefined ? isOpen : internalOpen
    
    const handleOpenChange = (newOpen: boolean) => {
        if (onClose && !newOpen) onClose()
        setInternalOpen(newOpen)
    }

    const [activeTab, setActiveTab] = useState("basic")
    const { data: user } = useMe()
    const queryClient = useQueryClient()

    const methods = useForm<AgentFormData>({
        resolver: zodResolver(agentSchema) as any,
        defaultValues,
    })

    const { handleSubmit, reset, formState: { errors } } = methods

    // Tracks which agent's data the form was last initialized from, so a
    // background refetch of `agentToEdit` (e.g. React Query's
    // refetchOnWindowFocus firing while the dialog is open) doesn't blow
    // away unsaved typing by re-running reset() on every new object
    // reference — only a genuine open-for-a-different-agent should reset.
    const initializedForRef = useRef<string | null>(null)

    useEffect(() => {
        if (agentToEdit && open) {
            const agentKey = agentToEdit.id || agentToEdit._id || null
            if (initializedForRef.current === agentKey) return
            initializedForRef.current = agentKey
            reset({
                profile: {
                    agent_name: agentToEdit.name || agentToEdit.profile?.agent_name || "",
                    description: agentToEdit.description || agentToEdit.profile?.description || "",
                    image: agentToEdit.image || agentToEdit.profile?.image || "",
                },
                knowledge_base: {
                    urls: agentToEdit.knowledge_base?.urls || [],
                    uploaded_files: agentToEdit.knowledge_base?.uploaded_files || agentToEdit.knowledge_base?.file || [],
                },
                system_prompt: agentToEdit.system_prompt || agentToEdit.instructions || "",
                model_settings: {
                    llm_model: agentToEdit.model_settings?.llm_model || "openAI",
                    temperature: agentToEdit.model_settings?.temperature || 0,
                    api_key: agentToEdit.model_settings?.api_key || "",
                    top_p: agentToEdit.model_settings?.top_p,
                    max_tokens: agentToEdit.model_settings?.max_tokens,
                },
                is_public: agentToEdit.is_public || false,
                tools: agentToEdit.tools || [],
            })
        } else if (!open) {
            initializedForRef.current = null
            reset(defaultValues)
            setActiveTab("basic")
        }
    }, [agentToEdit, open, reset])

    const createMutation = useMutation({
        mutationFn: (data: AgentFormData) => {
            const userId = user?._id || user?.id || user?.uuid || user?.data?.user?.id || user?.data?.id || user?.data?._id || "";
            if (agentToEdit) {
                return agentApi.updateAgent(agentToEdit.id || agentToEdit._id, data)
            }
            return agentApi.createAgent({
                ...data,
                user_id: userId,
            })
        },
        onSuccess: () => {
            showSuccessToast(agentToEdit ? "Agent updated successfully" : "Agent created successfully")
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            queryClient.invalidateQueries({ queryKey: ['agent'] })
            handleOpenChange(false)
        },
        onError: (error: any) => {
            const message = error?.response?.data?.message || error?.response?.data?.error || `Error ${agentToEdit ? 'updating' : 'creating'} agent`;
            showErrorToast(message)
        }
    })

    const onSubmit = (data: AgentFormData) => {

        createMutation.mutate(data)
    }

    const onInvalid = (errors: any) => {
        console.log("Validation Errors:", errors);
        Object.keys(errors).forEach((key) => {
            const error = errors[key as keyof typeof errors];
            if (error?.message) {
                showErrorToast(error.message);
            } else if (typeof error === 'object') {
                Object.values(error).forEach((nestedError: any) => {
                    if (nestedError?.message) showErrorToast(nestedError.message);
                });
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {children && <DialogTrigger asChild>{children}</DialogTrigger>}
            <DialogContent
                className="w-[95vw] md:max-w-[900px] p-0 h-[90vh] md:h-[80vh] max-h-[700px] flex overflow-hidden"
                // Only the X button or Cancel should discard a partially-filled form.
                onInteractOutside={(e) => e.preventDefault()}
            >
                <FormProvider {...methods}>
                    <SidebarProvider defaultOpen={true} className="min-h-0 h-full w-full">
                        <Sidebar className="w-16 md:w-[240px] border-r pt-6 md:pr-2" collapsible="none">
                            <SidebarContent>
                                <SidebarMenu className="list-none [&>li]:list-none">
                                    <SidebarMenuItem>
                                        <SidebarMenuButton isActive={activeTab === "basic"} onClick={() => setActiveTab("basic")} className="md:justify-start justify-center">
                                            <ImageIcon className="h-4 w-4 shrink-0" />
                                            <span className="hidden md:inline">Basic Information</span>
                                            {activeTab === "basic" && <Check className="ml-auto h-4 w-4 hidden md:block" />}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton isActive={activeTab === "knowledge"} onClick={() => setActiveTab("knowledge")} className="md:justify-start justify-center">
                                            <FileText className="h-4 w-4 shrink-0" />
                                            <span className="hidden md:inline">Knowledge Base</span>
                                            {activeTab === "knowledge" && <Check className="ml-auto h-4 w-4 hidden md:block" />}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton isActive={activeTab === "system"} onClick={() => setActiveTab("system")} className="md:justify-start justify-center">
                                            <Sparkles className="h-4 w-4 shrink-0" />
                                            <span className="hidden md:inline">System Prompt</span>
                                            {activeTab === "system" && <Check className="ml-auto h-4 w-4 hidden md:block" />}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton isActive={activeTab === "model"} onClick={() => setActiveTab("model")} className="md:justify-start justify-center">
                                            <Settings className="h-4 w-4 shrink-0" />
                                            <span className="hidden md:inline">AI Model Settings</span>
                                            {activeTab === "model" && <Check className="ml-auto h-4 w-4 hidden md:block" />}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton isActive={activeTab === "tools"} onClick={() => setActiveTab("tools")} className="md:justify-start justify-center">
                                            <Wrench className="h-4 w-4 shrink-0" />
                                            <span className="hidden md:inline">Tools</span>
                                            {activeTab === "tools" && <Check className="ml-auto h-4 w-4 hidden md:block" />}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                </SidebarMenu>
                            </SidebarContent>
                        </Sidebar>

                        <div className="flex-1 flex flex-col h-full overflow-hidden">
                            <DialogHeader className="px-6 pt-6 shrink-0">
                                <DialogTitle className="sr-only">{agentToEdit ? "Edit Agent" : "Create New Agent"}</DialogTitle>
                                <DialogDescription className="sr-only">
                                    Configure and save a customized AI agent with specific settings, prompt, and tools.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex-1 flex flex-col overflow-hidden">
                                <div className="px-6 py-4 flex-1 overflow-y-auto">
                                    {activeTab === "basic" && <BasicInformationForm />}
                                    {activeTab === "knowledge" && <KnowledgeBaseForm />}
                                    {activeTab === "system" && <SystemPromptForm />}
                                    {activeTab === "model" && <AIModelSettingsForm />}
                                    {activeTab === "tools" && <ToolsForm />}
                                </div>

                                <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
                                    <div className="flex justify-between w-full">
                                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                                            Cancel
                                        </Button>
                                        <div className="flex gap-2">
                                            {activeTab !== "basic" && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const tabs = ["basic", "knowledge", "system", "model", "tools"]
                                                        const currentIndex = tabs.indexOf(activeTab)
                                                        setActiveTab(tabs[currentIndex - 1])
                                                    }}
                                                >
                                                    Previous
                                                </Button>
                                            )}
                                            {activeTab !== "tools" ? (
                                                <Button
                                                    type="button"
                                                    onClick={() => {
                                                        const tabs = ["basic", "knowledge", "system", "model", "tools"]
                                                        const currentIndex = tabs.indexOf(activeTab)
                                                        setActiveTab(tabs[currentIndex + 1])
                                                    }}
                                                >
                                                    Next <ChevronRight className="ml-1 h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <Button type="submit" disabled={createMutation.isPending}>
                                                    {createMutation.isPending ? (agentToEdit ? "Updating..." : "Creating...") : (agentToEdit ? "Update Agent" : "Create Agent")}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </DialogFooter>
                            </form>
                        </div>
                    </SidebarProvider>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}
