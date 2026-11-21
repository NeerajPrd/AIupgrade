"use client";

import { memo, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { WorkflowNodeDefinition } from '@/lib/types/nodes/nodes';
import * as Icons from 'lucide-react';
import { Play, Pin, CheckCircle, AlertTriangle } from 'lucide-react';
import { useWorkflowStore } from '@/lib/store/workflow';
import { showAlertToast } from '@/utils/toast';

interface CustomNodeProps {
  id: string;
  data: WorkflowNodeDefinition;
  selected: boolean;
}

export const CustomNode = ({ id, data, selected }: CustomNodeProps) => {
  const Icon = (Icons[data.icon as keyof typeof Icons] || Icons.Box) as React.ComponentType<{ className?: string }>;
  const [isSuccess, setIsSuccess] = useState<'completed' | 'error' | undefined>(undefined);
  const { currentExecution, nodes, selectedNodeId, executeSingleNode, pinNodeOutput, toggleNodePin } = useWorkflowStore();

  const handleNodeClick = () => {
    const nodeType = (data.type || '').toLowerCase();
    const needsStandardUrl = 
      nodeType.includes('webhook') || 
      nodeType.includes('stripe') || 
      nodeType.includes('github') || 
      nodeType.includes('twilio') ||
      nodeType.includes('slack') ||
      nodeType.includes('discord') ||
      nodeType.includes('gmail');
      
    if (needsStandardUrl && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      showAlertToast(`The ${data.display_name || data.type} service needs a standard URL/domain (not localhost) to receive external callbacks properly.`);
    }
  };

  useEffect(() => {
    const c = currentExecution?.nodes[id];
    if (c?.status === 'completed') {
      setIsSuccess('completed');
    } else if (c?.error) {
      setIsSuccess('error');
    } else {
      setIsSuccess(undefined);
    }
  }, [currentExecution]);

  useEffect(() => {
    setIsSuccess(undefined);
  }, [nodes?.length])

  const rawInputs = (data as any)?.inputs;
  let baseInputs: Array<{ id: string; name: string }> = Array.isArray(rawInputs) && rawInputs.length > 0
    ? rawInputs
    : [];

  const textareaFields = data.fields?.filter((f) => f.type === 'textarea') || [];
  const textareaInputs = textareaFields.map((f) => ({
    id: f.name,
    name: f.label || f.name,
  }));

  // Combine them, avoiding duplicates by id
  const combinedInputs = [...baseInputs];
  for (const taInput of textareaInputs) {
    if (!combinedInputs.some((i) => i.id === taInput.id)) {
      combinedInputs.push(taInput);
    }
  }

  // Fallback to a single 'input' if nothing is found
  const inputsArray = combinedInputs.length > 0 
    ? combinedInputs 
    : [{ id: 'input', name: 'Input' }];

  const rawOutputs = (data as any)?.outputs;
  const outputsArray: string[] = Array.isArray(rawOutputs)
    ? rawOutputs
    : [];

  return (
    <Card 
      onClick={handleNodeClick}
      className={`w-[280px] shadow-md  relative
      ${isSuccess == 'completed' && 'ring-1 ring-green-300'}
      ${isSuccess == 'error' && 'ring-1 ring-red-400'}
    ${selected ? 'ring-2 ring-blue-500/30' : ''}`}
    >
      <div className={`p-3 border-b flex items-center justify-between gap-2
         ${isSuccess == 'completed' && 'bg-green-200 text-black'}
         ${isSuccess == 'error' && 'bg-red-400 text-black'}
         rounded-xl`
      }>
        {/* Elegant glowing pulsing selection ring */}
        {(selected || selectedNodeId === id) && (
          <div className="absolute inset-[-4px] border-2 border-blue-500/80 rounded-2xl animate-pulse pointer-events-none z-10" />
        )}
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-5 w-5 " />
          <h3 className="font-medium text-sm truncate">{data.display_name}</h3>
          {(data as any).use_pinned && (
            <span 
              onClick={(e) => {
                e.stopPropagation();
                toggleNodePin(id);
              }}
              title="Click to toggle off pinned output bypass"
              className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-medium cursor-pointer shrink-0"
            >
              📌 Pinned
            </span>
          )}
        </div>
        
        {/* Play/Execute Single Node Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            executeSingleNode(id);
          }}
          title="Run this node in isolation"
          className="p-1 hover:bg-orange-100 dark:hover:bg-orange-950/30 rounded-full transition-colors flex items-center justify-center cursor-pointer shrink-0 select-none border-0 bg-transparent"
        >
          <Play className="h-4 w-4 text-brand-500 hover:scale-110 transition-transform" />
        </button>
      </div>
      <div className="p-3 space-y-3 bg-white/80 dark:bg-black/45 rounded-lg">
        {inputsArray.map((input) => (
          <div key={input.id} className="relative flex items-center mb-2">
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              className="w-3 h-3 -ml-1.5  border-2 border-white"
            />
            <div className="text-xs text-muted-foreground pl-4 text-black dark:text-white">
              {input.name}
            </div>
          </div>
        ))}

        {data.fields && data.fields.length > 0 && (
          <div className="py-2 px-3 my-2 bg-muted/30 rounded-md text-xs">
            {data.fields.map((setting) => (
              <div key={setting.name} className="flex justify-between py-1">
                <span className="text-muted-foreground font-medium">{setting.label}:</span>
                <span className="truncate max-w-[150px]">
                  {setting.default !== undefined ? String(setting.default) : 'Not set'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Static/Persisted Pinned Output Box */}
        {isSuccess === undefined && (data as any).pinned_output && (
          <div className="mt-2 pt-2 border-t border-dashed border-amber-200 text-xs">
            <div className="font-semibold text-amber-600 dark:text-amber-400 mb-1 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1">
                <Pin className="w-3.5 h-3.5" /> Pinned Response:
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNodePin(id);
                }}
                title={(data as any).use_pinned ? "Click to disable pinned bypass" : "Click to enable pinned bypass"}
                className={`text-[9px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-colors border-0
                  ${(data as any).use_pinned ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}
              >
                {(data as any).use_pinned ? "Active" : "Inactive"}
              </button>
            </div>
            <div className="max-h-[100px] overflow-y-auto p-2 bg-amber-50/50 dark:bg-amber-950/10 text-amber-900 dark:text-amber-300 rounded border border-amber-100 dark:border-amber-900/30 font-mono text-[10px] break-all whitespace-pre-wrap select-all">
              {typeof (data as any).pinned_output === 'object'
                ? JSON.stringify((data as any).pinned_output, null, 2)
                : String((data as any).pinned_output)}
            </div>
          </div>
        )}

        {outputsArray.map((outputName: string) => (
          <div key={outputName} className="relative flex justify-end items-center">
            <div className="text-xs text-muted-foreground pr-4">
              {outputName}
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={outputName}
              className="w-3 h-3 -mr-1.5  border-2 border-white"
            />
          </div>
        ))}

        {/* Visual Node Output/Result Box */}
        {isSuccess === 'completed' && currentExecution?.nodes[id]?.output && (
          <div className="mt-2 pt-2 border-t border-dashed border-green-200 text-xs">
            <div className="font-semibold text-green-600 dark:text-green-400 mb-1 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Output:
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  pinNodeOutput(id, currentExecution?.nodes[id]?.output);
                }}
                title="Pin this output to bypass execution next time"
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded cursor-pointer transition-colors flex items-center justify-center shrink-0 border-0 bg-transparent"
              >
                <Pin className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              </button>
            </div>
            <div className="max-h-[120px] overflow-y-auto p-2 bg-green-50/50 dark:bg-green-950/20 text-gray-700 dark:text-gray-300 rounded border border-green-100 dark:border-green-900/30 font-mono text-[10px] break-all whitespace-pre-wrap select-all">
              {typeof currentExecution?.nodes[id]?.output === 'object'
                ? JSON.stringify(currentExecution?.nodes[id]?.output, null, 2)
                : String(currentExecution?.nodes[id]?.output)}
            </div>
          </div>
        )}

        {/* Visual Node Error Box */}
        {isSuccess === 'error' && currentExecution?.nodes[id]?.error && (
          <div className="mt-2 pt-2 border-t border-dashed border-red-200 text-xs">
            <div className="font-semibold text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Error:
            </div>
            <div className="max-h-[120px] overflow-y-auto p-2 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded border border-red-100 dark:border-red-900/30 font-mono text-[10px] break-all whitespace-pre-wrap select-all">
              {String(currentExecution?.nodes[id]?.error)}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};