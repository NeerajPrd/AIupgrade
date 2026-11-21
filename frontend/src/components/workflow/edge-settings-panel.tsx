"use client";

import React, { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/lib/store/workflow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { showErrorToast } from '@/utils/toast';

export function EdgeSettingsPanel() {
  const { edges, selectedEdgeId, updateEdgeSettings, setSelectedEdge } = useWorkflowStore();
  
  // Find the selected edge
  const selectedEdge = edges.find(edge => edge.id === selectedEdgeId);

  if (!selectedEdge) return null;

  // Extract variables with defaults
  const label = (selectedEdge.label as string) || '';
  const animated = !!selectedEdge.animated;
  const auto_map = selectedEdge.auto_map !== false; // default true
  const merge_strategy = (selectedEdge.merge_strategy as string) || 'concatenate';
  const data_mappings = (selectedEdge.data_mappings as unknown[]) || [];

  const handleUpdate = (fields: Record<string, unknown>) => {
    if (selectedEdgeId) {
      updateEdgeSettings(selectedEdgeId, fields);
    }
  };

  return (
    <Card className="z-30 w-80 border-l h-full overflow-y-auto flex flex-col justify-between bg-background max-md:absolute max-md:right-0 max-md:top-0 max-md:shadow-xl">
      <div>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-medium text-lg">Connection Settings</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedEdge(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="p-4">
          <div className="space-y-6">
            {/* Visual Customization */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Edge Label</Label>
              <Input
                placeholder="e.g., JSON response, payload..."
                value={label}
                onChange={(e) => handleUpdate({ label: e.target.value })}
                className="focus-visible:ring-brand-500"
              />
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">Animated Path</Label>
                <p className="text-xs text-muted-foreground">Animates flow direction along connection</p>
              </div>
              <Switch
                checked={animated}
                onCheckedChange={(checked) => handleUpdate({ animated: checked })}
              />
            </div>

            {/* Backend-Driven Configs */}
            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <Label className="font-semibold text-sm">Auto Map Fields</Label>
                <p className="text-xs text-muted-foreground">Automatically link matching parameters</p>
              </div>
              <Switch
                checked={auto_map}
                onCheckedChange={(checked) => handleUpdate({ auto_map: checked })}
              />
            </div>

            <div className="space-y-2 border-b pb-4">
              <Label className="font-semibold text-sm">Data Merge Strategy</Label>
              <select
                value={merge_strategy}
                onChange={(e) => handleUpdate({ merge_strategy: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="concatenate">Concatenate (Default)</option>
                <option value="array">Convert to Array</option>
                <option value="merge_json">Merge JSON Objects</option>
              </select>
            </div>

            {/* Data Mappings Array Editor */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center justify-between">
                <span>Field Mappings</span>
                <span className="text-xs font-normal text-muted-foreground">({data_mappings.length})</span>
              </h4>

              {data_mappings.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto border p-2 rounded-lg bg-gray-50/10">
                  {data_mappings.map((mapping, idx) => (
                    <div key={idx} className="p-2 border rounded-lg bg-gray-50/50 dark:bg-muted/40 relative group flex justify-between items-center">
                      <div className="text-xs space-y-1">
                        <div><strong className="text-gray-400">Src:</strong> {mapping.source_field}</div>
                        <div><strong className="text-gray-400">Tgt:</strong> {mapping.target_field}</div>
                        <div className="text-[10px] text-muted-foreground">Type: {mapping.transform}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const nextMappings = data_mappings.filter((_, i) => i !== idx);
                          handleUpdate({ data_mappings: nextMappings });
                        }}
                        className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Mapping Row Form */}
              <div className="space-y-2 bg-brand-500/5 p-3 rounded-lg border border-dashed border-brand-500/50">
                <p className="text-xs font-semibold text-brand-500">Add Explicit Mapping</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="source_field"
                    id="mapping-source"
                    className="h-8 text-xs focus-visible:ring-brand-500"
                  />
                  <Input
                    placeholder="target_field"
                    id="mapping-target"
                    className="h-8 text-xs focus-visible:ring-brand-500"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="transform (e.g. json, text)"
                    id="mapping-transform"
                    defaultValue="json"
                    className="h-8 text-xs focus-visible:ring-brand-500"
                  />
                  <Button
                    size="sm"
                    className="bg-brand-500 hover:bg-brand-500/80 text-white h-8 shrink-0 text-xs px-2"
                    onClick={() => {
                      const srcInput = document.getElementById('mapping-source') as HTMLInputElement;
                      const tgtInput = document.getElementById('mapping-target') as HTMLInputElement;
                      const transformInput = document.getElementById('mapping-transform') as HTMLInputElement;
                      
                      const source_field = srcInput?.value || '';
                      const target_field = tgtInput?.value || '';
                      const transform = transformInput?.value || 'json';
                      
                      if (!source_field || !target_field) return;

                      // Validate dot-notation paths!
                      const pathRegex = /^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/;
                      if (!pathRegex.test(source_field) || !pathRegex.test(target_field)) {
                        showErrorToast("Invalid mapping path. Dot-notation must be valid (e.g. 'output.data' or 'status'). Double dots or trailing dots are invalid.");
                        return;
                      }

                      const newMapping = {
                        source_field,
                        target_field,
                        transform,
                        default_value: ''
                      };

                      handleUpdate({
                        data_mappings: [...data_mappings, newMapping]
                      });

                      // Reset inputs
                      if (srcInput) srcInput.value = '';
                      if (tgtInput) tgtInput.value = '';
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 border-t shrink-0">
        <Button
          variant="outline"
          className="w-full border-brand-500 hover:bg-brand-500/10 dark:text-white"
          onClick={() => setSelectedEdge(null)}
        >
          Close Settings
        </Button>
      </div>
    </Card>
  );
}
