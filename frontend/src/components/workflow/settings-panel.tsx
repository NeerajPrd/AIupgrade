"use client";

import { useEffect, useState } from 'react';
import { X, Trash2, Pin, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/lib/store/workflow';
import { NodeDefinition, NodePort, NodeSetting, SettingType } from '@/lib/types/nodes/nodes';
import { API_BASE_URL } from '@/utils/api/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import axiosInstance from '@/lib/api/axios';

export function SettingsPanel() {
  const { nodes, selectedNodeId, updateNodeSettings, setSelectedNode, updateNodeInput, onNodesChange, currentExecution, pinNodeOutput, toggleNodePin } = useWorkflowStore();
  const selectedNode = nodes.find(node => node.id === selectedNodeId);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [connections, setConnections] = useState<{ id: string; name: string; type: string }[]>([]);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const response = await axiosInstance.get(`/api/v1/connections`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('upgrade-token')}`
          }
        });
        if (Array.isArray(response.data)) {
          setConnections(response.data);
        } else if (response.data?.connections && Array.isArray(response.data.connections)) {
          setConnections(response.data.connections);
        }
      } catch (error) {
        console.warn("Could not load backend connections, using mock fallbacks:", error);
        // Fallback mockup connections for local dev
        setConnections([
          { id: 'conn-openai-1', name: 'My Personal OpenAI Key', type: 'openai' },
          { id: 'conn-gmail-1', name: 'Work Gmail Account (OAuth)', type: 'gmail' },
          { id: 'conn-slack-1', name: 'Spirit Monkey Slack Bot', type: 'slack' },
          { id: 'conn-gcs-1', name: 'GCS Project Bucket Integration', type: 'gcs' }
        ]);
      }
    };

    fetchConnections();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNode(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedNode]);

  if (!selectedNode) return null;

  const nodeData = selectedNode.data as unknown as NodeDefinition & Record<string, unknown>;

  // Check if data exists to prevent errors
  if (!nodeData || typeof nodeData !== 'object') {
    console.error('Node data is not an object:', nodeData);
    return (
      <Card className="w-80 border-l h-full overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-medium">Node Settings</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedNode(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground">No settings available for this node.</p>
        </div>
      </Card>
    );
  }

  // Function to safely get the current value of a setting
  const getSettingValue = (settingId: string) => {
    if (!nodeData) return undefined;

    // First check if the value exists directly in the node data (top-level)
    if (nodeData[settingId] !== undefined) {
      return nodeData[settingId];
    }

    // If not found directly, check if there's a setting definition with a default value
    if (nodeData.fields && Array.isArray(nodeData.fields)) {
      const settingDef = nodeData.fields.find((s: NodeSetting) => s.name === settingId);
      if (settingDef && settingDef.default !== undefined) {
        return settingDef.default;
      }
    }

    return undefined;
  };
  const renderSetting = (setting: NodeSetting) => {
    const value = getSettingValue(setting.name);

    const handleChange = (newValue: unknown) => {
      if (selectedNodeId === null) return;
      updateNodeSettings(selectedNodeId, { [setting.name]: newValue });
    };

    switch (setting.type) {
      case 'range':
        const rangeValue = value !== undefined && value !== '' ? Number(value) : (setting.default || 0);
        return (
          <Slider
            value={[rangeValue]}
            onValueChange={([newValue]) => handleChange(newValue)}
            min={setting.min || 0}
            max={setting.max || 100}
            step={setting.step || 0.1}
            className="w-full"
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value !== undefined && value !== null ? value : ''}
            onChange={(e) => {
              const numValue = e.target.value === '' ? '' : parseFloat(e.target.value);
              handleChange(numValue);
            }}
            className="w-full"
            min={setting.min}
            max={setting.max}
            step={setting.step || 1}
          />
        );

      case 'boolean':
        return (
          <>
            <br />
            <Switch
              checked={Boolean(value)}
              onCheckedChange={handleChange}
            />
          </>
        );

      case 'textarea':
        return (
          <textarea
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => handleChange(e.target.value)}
            rows={setting.rows || 3}
            className="w-full min-h-24 p-2 border rounded"
            placeholder={setting.placeholder || ''}
          />
        );

      case 'credential':
      case 'connection': {
        const settingWithConn = setting as { connection_type?: string };
        const filteredConnections = settingWithConn.connection_type
          ? connections.filter(c => c.type === settingWithConn.connection_type)
          : connections;

        return (
          <select
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">-- Select Connection --</option>
            {filteredConnections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.type || conn.name})
              </option>
            ))}
          </select>
        );
      }

      case 'select': {
        let options = setting.options;
        if ((!options || options.length === 0) && setting.name === 'model') {
          const nodeTypeLower = selectedNode.type?.toLowerCase() || '';
          const nodeDataIdLower = (selectedNode.data as any)?.id?.toLowerCase() || '';
          if (nodeTypeLower.includes('gemini') || nodeTypeLower.includes('google') || nodeTypeLower.includes('vertex') ||
            nodeDataIdLower.includes('gemini') || nodeDataIdLower.includes('google') || nodeDataIdLower.includes('vertex')) {
            options = [
              { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
              { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
              { label: "Gemini 2.0 Flash Lite", value: "gemini-2.0-flash-lite" },
              { label: "models/gemini-2.5-flash", value: "models/gemini-2.5-flash" },
              { label: "models/gemini-2.0-flash", value: "models/gemini-2.0-flash" },
              { label: "models/gemini-2.0-flash-lite", value: "models/gemini-2.0-flash-lite" }
            ];
          }
        }

        // Map any string options to { label, value } with humanizing
        if (options && Array.isArray(options)) {
          options = options.map((opt: any) => {
            if (typeof opt === 'string') {
              const label = opt
                .split('-')
                .map(word => {
                  if (word === 'gemini') return 'Gemini';
                  if (word === 'pro') return 'Pro';
                  if (word === 'flash') return 'Flash';
                  if (word === 'lite') return 'Lite';
                  return word.charAt(0).toUpperCase() + word.slice(1);
                })
                .join(' ');
              return { label, value: opt };
            }
            return {
              label: opt.label || opt.name || opt.text || opt.id || '',
              value: opt.value || opt.id || opt.name || ''
            };
          });
        }

        if (options && Array.isArray(options)) {
          return (
            <select
              value={value !== undefined ? value : (setting.default || '')}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          );
        }
        return null;
      }

      case 'text':
      default:
        return (
          <Input
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full"
            placeholder={setting.placeholder || ''}
          />
        );
    }
  };

  const renderInputs = () => {
    const inputs = (nodeData as unknown as { inputs?: Array<{ id: string; default?: unknown }> }).inputs;
    if (!inputs || !Array.isArray(inputs)) {
      return null;
    }
    const handleInputChange = (newValue: unknown, id: string) => {
      if (selectedNodeId === null) return;
      updateNodeInput(selectedNodeId, { [id]: newValue });
    };

    return inputs.map((input) => {
      return (
        <div key={input.id} className="space-y-2 mb-4">
          <Label htmlFor={input.id}>
            {input.id}
          </Label>
          <Input
            id={input.id}
            type="text"
            placeholder={input.id}
            value={input.default !== undefined ? String(input.default) : ''}
            onChange={(e) => {
              handleInputChange(e.target.value, input.id);
            }}
            className="w-full"
          />
        </div>
      );
    });
  };

  const renderSettings = () => {
    const settings = nodeData.fields;

    if (!settings || !Array.isArray(settings)) {
      console.warn('Node fields has unexpected type:', typeof settings);
      return <p className="text-sm text-muted-foreground">No configurable settings for this node.</p>;
    }

    return settings.map((setting: NodeSetting) => {
      return (
        <div key={setting.name} className="space-y-2 mb-4">
          <Label htmlFor={setting.name}>
            {setting.label.includes("Connection") ? "Key" : setting.label}
            {setting.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {renderSetting(setting)}
          {setting.description && (
            <p className="text-sm text-muted-foreground">
              {setting.description}
            </p>
          )}
        </div>
      );
    });
  };

  return (
    <>
      <Card className="z-30 w-80 border-l h-full overflow-y-auto flex flex-col justify-between max-md:absolute max-md:right-0 max-md:top-0 max-md:shadow-xl bg-background">
        <div>
          <div className="p-4 border-b flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedNode(null)}
              className="h-8 w-8 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
            <h3 className="font-medium ml-2">Node Configuration Properties</h3>
          </div>

          <div className="p-4 space-y-4">
            {renderInputs()}
            {renderSettings()}

            {/* Visual Node Output & Pin Section inside Settings Panel */}
            {selectedNodeId && (
              <div className="space-y-4 pt-4 border-t border-muted">
                {/* 1. Live Successful Output */}
                {currentExecution?.nodes[selectedNodeId]?.status === 'completed' && currentExecution?.nodes[selectedNodeId]?.output && (
                  <div className="space-y-1.5 text-xs bg-green-50/50 dark:bg-green-950/10 p-3 rounded-md border border-green-100 dark:border-green-900/30">
                    <div className="font-semibold text-green-600 dark:text-green-400 flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Live Output:
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => pinNodeOutput(selectedNodeId, currentExecution?.nodes[selectedNodeId]?.output)}
                        title="Pin this output to bypass execution next time"
                        className="h-6 w-6 text-green-600 dark:text-green-400 hover:bg-green-100/50 dark:hover:bg-green-900/20"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <pre className="max-h-[150px] overflow-y-auto p-2 bg-white/50 dark:bg-black/30 rounded border text-[10px] font-mono break-all whitespace-pre-wrap select-all text-gray-700 dark:text-gray-300">
                      {typeof currentExecution?.nodes[selectedNodeId]?.output === 'object'
                        ? JSON.stringify(currentExecution?.nodes[selectedNodeId]?.output, null, 2)
                        : String(currentExecution?.nodes[selectedNodeId]?.output)}
                    </pre>
                  </div>
                )}

                {/* 2. Live Failed Error Output */}
                {currentExecution?.nodes[selectedNodeId]?.status === 'error' && currentExecution?.nodes[selectedNodeId]?.error && (
                  <div className="space-y-1.5 text-xs bg-red-50/50 dark:bg-red-950/10 p-3 rounded-md border border-red-100 dark:border-red-900/30">
                    <div className="font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Live Error:
                    </div>
                    <pre className="max-h-[150px] overflow-y-auto p-2 bg-white/50 dark:bg-black/30 rounded border text-[10px] font-mono break-all whitespace-pre-wrap select-all text-red-700 dark:text-red-400">
                      {String(currentExecution?.nodes[selectedNodeId]?.error)}
                    </pre>
                  </div>
                )}

                {/* 3. Static/Persisted Pinned Output */}
                {(nodeData as any).pinned_output && (
                  <div className="space-y-1.5 text-xs bg-amber-50/50 dark:bg-amber-950/10 p-3 rounded-md border border-amber-100 dark:border-amber-900/30">
                    <div className="font-semibold text-amber-600 dark:text-amber-400 flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1">
                        <Pin className="w-4 h-4" /> Pinned Output:
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleNodePin(selectedNodeId)}
                        className={`h-6 px-2 text-[10px] font-medium border
                          ${(nodeData as any).use_pinned
                            ? 'bg-amber-500 text-white hover:bg-amber-600 border-transparent'
                            : 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 border-muted'}`}
                      >
                        {(nodeData as any).use_pinned ? "Active" : "Inactive"}
                      </Button>
                    </div>
                    <pre className="max-h-[150px] overflow-y-auto p-2 bg-white/50 dark:bg-black/30 rounded border text-[10px] font-mono break-all whitespace-pre-wrap select-all text-amber-900 dark:text-amber-300">
                      {typeof (nodeData as any).pinned_output === 'object'
                        ? JSON.stringify((nodeData as any).pinned_output, null, 2)
                        : String((nodeData as any).pinned_output)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t shrink-0 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-brand-500 hover:bg-brand-500/10 dark:text-white"
            onClick={() => setSelectedNode(null)}
          >
            Close
          </Button>
          <Button
            variant="destructive"
            className="flex-1 bg-red-500 hover:bg-red-600 text-white flex items-center justify-center"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </Card>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="border-brand-500">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this node? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="border-brand-500 hover:bg-brand-500/20"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedNodeId) {
                  onNodesChange([{ type: 'remove', id: selectedNodeId }]);
                  setSelectedNode(null);
                }
                setIsDeleteDialogOpen(false);
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}