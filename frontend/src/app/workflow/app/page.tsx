"use client";

import { useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    Background,
    MiniMap,
    Edge,
    Node,
    Connection,
    NodeMouseHandler,
    OnNodesDelete,
    OnEdgesDelete,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { NodeSidebar } from '@/components/sidebar/node-sidebar';
import { SettingsPanel } from '@/components/workflow/settings-panel';
import { EdgeSettingsPanel } from '@/components/workflow/edge-settings-panel';
import { ExecutionPanel } from '@/components/workflow/execution-panel';
import { SaveWorkflowDialog } from '@/components/workflow/save-workflow-dialog';
import { LoadWorkflowDialog } from '@/components/workflow/load-workflow-dialog';
import { ApiSettingsDialog } from '@/components/workflow/api-settings-dialog';
import { CustomNode } from '@/components/workflow/custom-node';
import { useWorkflowStore } from '@/lib/store/workflow';
import { NODE_DEFINITIONS } from '@/lib/types/nodes/nodes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, ZoomIn, ZoomOut, Maximize, Trash2 } from 'lucide-react';
import { TbWorldShare } from "react-icons/tb";
import { showSuccessToast, showErrorToast } from "@/utils/toast";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WorkflowDashboard from '@/components/workflow/dashboard/workflow-dashboard';
import { getNodeDetails } from '@/lib/api/workflow';
import axiosInstance from '@/lib/api/axios';

// Node type definitions
const nodeTypes = {
    custom: CustomNode,
};

// Delete dialog state interface
interface DeleteDialogState {
    isOpen: boolean;
    itemType: 'node' | 'edge' | null;
    itemId: string | null;
}

/**
 * DFS Cycle Detection for the Workflow DAG
 * Verifies if targetNode can reach sourceNode via existing edges
 */
const checkCycle = (newSource: string, newTarget: string, currentEdges: Edge[]): boolean => {
    const adjList: Record<string, string[]> = {};
    currentEdges.forEach((edge) => {
        if (!adjList[edge.source]) adjList[edge.source] = [];
        adjList[edge.source].push(edge.target);
    });

    const visited = new Set<string>();

    const dfs = (nodeId: string): boolean => {
        if (nodeId === newSource) return true; // Reached source, cycle exists!
        if (visited.has(nodeId)) return false;
        visited.add(nodeId);

        const neighbors = adjList[nodeId] || [];
        for (const neighbor of neighbors) {
            if (dfs(neighbor)) return true;
        }
        return false;
    };

    return dfs(newTarget);
};

/**
 * WorkflowPage Component
 * A professional workflow editor with node management, execution, and visualization
 */
export default function WorkflowPage() {

    const reactFlow = useReactFlow();


    // Access workflow store
    const {
        nodes,
        edges,
        selectedNodeId,
        selectedEdgeId,
        isRunning,
        userInput,
        isCurrentExecutionSavedId,
        onNodesChange,
        onEdgesChange,
        onConnect: storeOnConnect,
        addNode,
        setSelectedNode,
        setSelectedEdge,
        executeWorkflow,
        setUserInput,
        loadWorkflow,
        loadNodeDefinitions,
        nodeDefinitions
    } = useWorkflowStore();

    // Delete confirmation dialog state
    const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
        isOpen: false,
        itemType: null,
        itemId: null,
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete') {
                if (selectedNodeId) {
                    handleDeleteSelected('node')
                }
                if (selectedEdgeId) {
                    handleDeleteSelected('edge')
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    useEffect(() => {
        loadNodeDefinitions()
    }, [])

    // Reference to ReactFlow instance for viewport manipulation
    const [isPublishing, setIsPublishing] = useState(false);

    const [isWorkflowDashboardOpen, setIsWorkflowDashboardOpen] = useState(false);

    /**
     * Performs pre-flight checks to ensure all required fields are satisfied
     */
    const validateWorkflowFields = (): boolean => {
        for (const node of nodes) {
            const nodeData = node.data as any;
            if (!nodeData || !Array.isArray(nodeData.fields)) continue;

            for (const field of nodeData.fields) {
                if (field.required) {
                    const fieldName = field.name;
                    // Check 1: Is there a static value set for this field in data?
                    const staticValue = nodeData[fieldName];
                    const isStaticValFilled = staticValue !== undefined && staticValue !== null && String(staticValue).trim() !== '';

                    // Check 2: Is there an incoming edge targeting this handle?
                    const hasIncomingConnection = edges.some(edge =>
                        edge.target === node.id &&
                        (edge.targetHandle === fieldName || edge.targetHandle === 'input' || edge.targetHandle === 'prompt')
                    );

                    // If both are missing, it violates the schema constraints!
                    if (!isStaticValFilled && !hasIncomingConnection) {
                        showErrorToast(`Required field "${field.label || fieldName}" is missing on node "${nodeData.display_name || node.id}"!`);
                        return false;
                    }
                }
            }
        }
        return true;
    };

    const handlePublish = async () => {
        if (isPublishing) return;
        if (nodes.length === 0) {
            showErrorToast("Cannot publish an empty workflow");
            return;
        }

        if (!isCurrentExecutionSavedId || isCurrentExecutionSavedId.startsWith('workflow-')) {
            showErrorToast("Please save the workflow before publishing");
            return;
        }

        // Pre-flight required fields validation
        if (!validateWorkflowFields()) return;

        setIsPublishing(true);
        try {
            const response = await axiosInstance.post(`/api/v1/workflows/${isCurrentExecutionSavedId}/publish`, {
                workflowId: isCurrentExecutionSavedId,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('upgrade-token')}`,
                },
            });
            if (response.status === 200) {
                showSuccessToast("Workflow published successfully");
            } else {
                showErrorToast("Failed to publish workflow");
            }

        } catch (e) {
            console.error('Error publishing workflow:', e);
            showErrorToast("Failed to publish workflow");
        } finally {
            setIsPublishing(false);
        }
    }
    /**
     * Adds a new node to the workflow by fetching its complete schema details from the API
     */
    const handleNodeAdd = useCallback(async (nodeId: string) => {
        try {
            // Fetch complete detailed schema from backend API
            const response = await getNodeDetails(nodeId);
            const detailedNode = response?.data || response;
            if (detailedNode) {
                addNode(detailedNode, { x: 100, y: 100 });
            } else {
                const nodeDefinition = nodeDefinitions.find(def => def.type === nodeId);
                if (nodeDefinition) {
                    addNode(nodeDefinition, { x: 100, y: 100 });
                }
            }
        } catch (err) {
            console.error("Error fetching node schema/details during addition:", err);
            // Fallback to local definitions
            const nodeDefinition = nodeDefinitions.find(def => def.type === nodeId);
            if (nodeDefinition) {
                addNode(nodeDefinition, { x: 100, y: 100 });
            }
        }
    }, [addNode, nodeDefinitions]);

    /**
     * Handles node selection
     */
    const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
        setSelectedNode(node.id);
    }, [setSelectedNode]);


    const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.stopPropagation();
        setSelectedEdge(edge.id);
    }, [setSelectedEdge]);
    /**
     * Handles edge connections between nodes
     */
    const handleConnect = useCallback(
        (connection: Connection) => {
            // Prevent self-connections
            if (connection.source === connection.target) {
                showErrorToast("Cannot connect a node to itself");
                return;
            }

            // Prevent cyclic connections (Infinite Loops)
            if (connection.source && connection.target) {
                // Prevent duplicate edges between these same nodes
                const isDuplicate = edges.some(edge => edge.source === connection.source && edge.target === connection.target);
                if (isDuplicate) {
                    showErrorToast("A connection between these nodes already exists!");
                    return;
                }

                const isCyclic = checkCycle(connection.source, connection.target, edges);
                if (isCyclic) {
                    showErrorToast("Connecting these nodes would create a cycle (infinite loop)!");
                    return;
                }
            }

            storeOnConnect(connection);
        },
        [storeOnConnect, edges]
    );

    /**
     * Intercepts node deletion to show confirmation dialog
     */
    const handleNodesDelete: OnNodesDelete = useCallback((nodesToDelete: Node[]) => {
        if (nodesToDelete.length === 1) {
            setDeleteDialog({
                isOpen: true,
                itemType: 'node',
                itemId: nodesToDelete[0].id,
            });
            // Return false to prevent automatic deletion
            return false;
        }
        return true;
    }, []);

    /**
     * Intercepts edge deletion to show confirmation dialog
     */
    const handleEdgesDelete: OnEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
        if (edgesToDelete.length === 1) {
            setDeleteDialog({
                isOpen: true,
                itemType: 'edge',
                itemId: edgesToDelete[0].id,
            });
            // Return false to prevent automatic deletion
            return false;
        }
        return true;
    }, []);

    /**
     * Handles request to delete currently selected node
     */
    const handleDeleteSelected = useCallback((itemType: 'edge' | 'node') => {
        if (selectedNodeId) {
            setDeleteDialog({
                isOpen: true,
                itemType: itemType,
                itemId: selectedNodeId,
            });
        }
        if (selectedEdgeId) {
            setDeleteDialog({
                isOpen: true,
                itemType: itemType,
                itemId: selectedEdgeId,
            });
        }
    }, [selectedNodeId, selectedEdgeId]);

    /**
     * Confirms deletion of node or edge
     */
    const handleConfirmDelete = useCallback(() => {
        if (!deleteDialog.itemId) return;

        if (deleteDialog.itemType === 'node') {
            onNodesChange([{ type: 'remove', id: deleteDialog.itemId }]);
            setSelectedNode(null);
        } else if (deleteDialog.itemType === 'edge') {
            onEdgesChange([{ type: 'remove', id: deleteDialog.itemId }]);
            setSelectedEdge(null)
        }

        setDeleteDialog({ isOpen: false, itemType: null, itemId: null });
    }, [deleteDialog.itemType, deleteDialog.itemId, onNodesChange, onEdgesChange, setSelectedNode, setSelectedEdge]);

    /**
     * Viewport control handlers
     */
    const handleZoomIn = () => reactFlow.zoomIn();


    const handleZoomOut = () => {
        reactFlow.zoomOut();
    };

    const handleFitView = () => {
        reactFlow.fitView();
    };

    /**
     * Handles workflow execution
     */
    const runWorkflow = () => {
        if (isRunning) return;

        if (nodes.length === 0) {
            showErrorToast("Cannot run an empty workflow");
            return;
        }

        // Pre-flight required fields validation
        if (!validateWorkflowFields()) return;

        executeWorkflow();
    };

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-background">
            {/* Node palette sidebar */}
            <NodeSidebar onNodeSelect={handleNodeAdd} onOpenDashboard={() => setIsWorkflowDashboardOpen(true)} />

            {/* Main workflow area */}
            <div className="flex-1 relative">
                {/* Workflow controls */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-[95%] md:max-w-max px-2 max-md:left-auto max-md:right-4 max-md:translate-x-0 max-md:w-[calc(100%-80px)]">
                    <div className="flex flex-col lg:flex-row items-center gap-2 bg-background/80 backdrop-blur-sm p-3 rounded-xl border border-brand-500 shadow-md w-full">
                        <Input
                            placeholder="Enter workflow input..."
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            className="w-full focus-visible:ring-brand-500 shrink-0"
                        />
                        <div className="flex flex-wrap items-center justify-center gap-2 w-full md:w-auto">
                            <LoadWorkflowDialog />
                            <SaveWorkflowDialog />
                            {isCurrentExecutionSavedId && !isCurrentExecutionSavedId.startsWith('workflow-') && (
                                <ApiSettingsDialog workflowId={isCurrentExecutionSavedId} />
                            )}
                            <Button
                                onClick={runWorkflow}
                                disabled={isRunning}
                                className="flex-1 md:flex-initial bg-brand-500 hover:bg-brand-500/80 text-white shadow-sm h-9 px-3"
                            >
                                <Play className="h-4 w-4 mr-2" />
                                {isRunning ? "Running..." : <span>Run<span className="hidden md:inline"> Workflow</span></span>}
                            </Button>
                            <Button
                                onClick={handlePublish}
                                disabled={isPublishing}
                                className="flex-1 md:flex-initial bg-brand-500 hover:bg-brand-500/80 text-white shadow-sm h-9 px-3"
                            >
                                <TbWorldShare className="h-4 w-4 mr-2" />
                                {isPublishing ? "Publishing..." : <span>Publish<span className="hidden md:inline"> Workflow</span></span>}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Delete selected edge button */}
                {selectedEdgeId && (
                    <div className="absolute top-20 right-4 z-10">
                        <div className="bg-background/90 backdrop-blur-sm p-2 rounded-lg border border-brand-500 shadow-md">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteSelected('edge')}
                                className="bg-red-500 hover:bg-red-600"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Selected Edge
                            </Button>
                        </div>
                    </div>
                )}


                {/* ReactFlow canvas */}
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={handleConnect}
                    onEdgeClick={handleEdgeClick}
                    onNodeClick={handleNodeClick}
                    onNodesDelete={handleNodesDelete}
                    onEdgesDelete={handleEdgesDelete}
                    nodeTypes={nodeTypes}
                    //Enter custom edge logic here
                    fitView
                    // ref={flowRef}
                    proOptions={{ hideAttribution: true }}
                    className="touch-none"
                >
                    <Background color="#3b82f6" gap={16} />

                    {/* Zoom controls */}
                    <div className="absolute z-10 bottom-4 left-4 bg-background/90 backdrop-blur-sm p-2 rounded-lg border border-brand-500 shadow-md">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleZoomIn}
                                className="hover:bg-brand-500/20"
                                title="Zoom In"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleZoomOut}
                                className="hover:bg-brand-500/20"
                                title="Zoom Out"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleFitView}
                                className="hover:bg-brand-500/20"
                                title="Fit View"
                            >
                                <Maximize className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </ReactFlow>

                {/* Execution results panel */}
                <ExecutionPanel />
            </div>

            {/* Settings panel for selected node */}
            {selectedNodeId && <SettingsPanel />}

            {/* Settings panel for selected edge */}
            {selectedEdgeId && <EdgeSettingsPanel />}

            {/* Mobile backdrop for Settings Panels */}
            {(selectedNodeId || selectedEdgeId) && (
                <div
                    onClick={() => {
                        setSelectedNode(null);
                        setSelectedEdge(null);
                    }}
                    className="fixed inset-0 bg-black/45 z-20 md:hidden transition-opacity duration-300"
                />
            )}

            {/* Delete confirmation dialog */}
            <Dialog
                open={deleteDialog.isOpen}
                onOpenChange={(open: boolean) => {
                    if (!open) {
                        setDeleteDialog({ isOpen: false, itemType: null, itemId: null });
                    }
                }}
            >
                <DialogContent className="border-brand-500">
                    <DialogHeader>
                        <DialogTitle>Confirm Deletion</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this {deleteDialog.itemType}? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialog({ isOpen: false, itemType: null, itemId: null })}
                            className="border-brand-500 hover:bg-brand-500/20"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={isWorkflowDashboardOpen} onOpenChange={setIsWorkflowDashboardOpen}>
                <DialogContent className="sm:max-w-[900px] h-[80vh] p-0">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle>Workflows Dashboard</DialogTitle>
                        <DialogDescription>Monitor and analyze your workflow executions</DialogDescription>
                    </DialogHeader>
                        <ScrollArea className="h-[calc(80vh-120px)] px-6 py-4">
                            <WorkflowDashboard />
                        </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    );
}