"use client";

import React from "react";
import { Terminal, Cpu, ArrowRight, SendHorizontal, Sparkles } from "lucide-react";
import ModelSelector from "@/components/chat/modalSelector";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogEntry {
  text: string;
  type: string;
}

interface TerminalInputProps {
  logs: LogEntry[];
  command: string;
  setCommand: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  logEndRef: React.RefObject<any>;
  isProcessing: boolean;
  disabled?: boolean;
  noModelSelected?: boolean;
  models: any[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

export function TerminalInput({
  logs,
  command,
  setCommand,
  onSubmit,
  logEndRef,
  isProcessing,
  disabled,
  noModelSelected,
  models,
  selectedModel,
  onSelectModel,
}: TerminalInputProps) {
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <div className={`flex-1 flex flex-col rounded-2xl bg-white/80 dark:bg-[#0f0f13]/90 border transition-all duration-500 shadow-2xl overflow-hidden relative backdrop-blur-xl
      ${isFocused ? "border-brand-500/50 ring-1 ring-brand-500/20" : "border-slate-200 dark:border-gray-800/80"}
    `}>
      {/* Mac-style window controls */}
      <div className="bg-slate-50/50 dark:bg-navy-900/50 px-5 py-4 flex items-center justify-between border-b border-slate-200 dark:border-gray-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors cursor-pointer" />
          <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors cursor-pointer" />
          <span className="ml-4 text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-widest font-mono">Spirit Monkey Terminal</span>
        </div>
        {isProcessing && (
          <div className="flex items-center gap-2 text-[10px] text-brand-500 font-bold animate-pulse font-mono">
            <Sparkles className="w-3 h-3" />
            COMPILING...
          </div>
        )}
      </div>

      {/* Logs Area with Styled Custom ScrollArea & Responsive Sizing */}
      <div className="flex-1 overflow-hidden bg-transparent relative min-h-[250px] flex flex-col">
        <ScrollArea className="flex-1 w-full h-[380px] lg:h-[calc(100vh-270px)]">
          <div className="p-6 space-y-3 text-[13px] leading-relaxed">
            {logs.map((log, i) => {
              let colorClass = "text-slate-600 dark:text-gray-400";
              let bgClass = "";
              
              if (log.type === "command") {
                colorClass = "text-brand-500 dark:text-brand-500 font-bold mt-6 mb-2";
                bgClass = "bg-orange-50/50 dark:bg-orange-500/5 px-3 py-1 rounded-md w-fit";
              }
              if (log.type === "success") colorClass = "text-emerald-600 dark:text-emerald-400 font-medium";
              if (log.type === "warning") colorClass = "text-amber-600 dark:text-amber-400";
              if (log.type === "error") colorClass = "text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-500/5 px-2 py-1 rounded";

              return (
                <div key={i} className={`flex items-start gap-4 transition-all duration-300 animate-in fade-in slide-in-from-left-2 ${bgClass}`}>
                  <span className="text-[10px] text-slate-300 dark:text-gray-700 select-none font-mono mt-0.5" suppressHydrationWarning>
                    [{new Date().toLocaleTimeString([], { hour12: false })}]
                  </span>
                  <span className={`break-all whitespace-pre-wrap font-mono ${colorClass}`}>{log.text}</span>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-[#121218] border-t border-slate-100 dark:border-gray-800/80 shrink-0 relative">
        
        <div className={`flex items-center gap-4 px-4 py-1 rounded-2xl transition-all duration-300 border-2
          ${isFocused 
            ? "bg-slate-50/50 dark:bg-slate-400/5 border-brand-500/50 shadow-[0_0_15px_rgba(251,146,60,0.15)]" 
            : "bg-white dark:bg-black/20 border-slate-200 dark:border-gray-800"}
        `}>
          <div className={`p-2 rounded-xl transition-colors ${isFocused ? "text-brand-500" : "text-slate-400"}`}>
            <Terminal className="w-5 h-5 shrink-0" />
          </div>
          
          <form onSubmit={onSubmit} className="flex-1 flex items-center gap-3">
            <input
              type="text"
              value={command}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onChange={(e) => setCommand(e.target.value)}
              disabled={isProcessing || disabled}
              placeholder={
                disabled
                  ? "Configure a model in settings..."
                  : isProcessing
                  ? "Compilation in progress..."
                  : "How can I help you build today?"
              }
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-slate-800 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-600 focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed py-3"
              autoFocus
            />
            
            <div className="flex items-center gap-2 shrink-0">
              {command.trim() && !isProcessing && (
                <button
                  type="submit"
                  className="p-2.5 rounded-xl bg-brand-500 hover:bg-brand-500/90 text-white shadow-lg shadow-brand-500/20 transition-all active:scale-95 animate-in fade-in zoom-in-75 duration-300"
                >
                  <SendHorizontal className="w-4 h-4" />
                </button>
              )}
              
              <div className={`h-6 w-[1px] bg-slate-200 dark:bg-gray-800 mx-1 ${noModelSelected ? "opacity-100" : "opacity-0"}`} />
              
              {(() => {
                const selectedModelObj = models?.find((m) => m.id === selectedModel);
                const triggerIcon = selectedModelObj ? (
                  <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-transparent border border-slate-200 dark:border-gray-800 hover:scale-105 active:scale-95 transition-all">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedModelObj.icon} alt={selectedModelObj.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <Cpu className={`w-5 h-5 transition-colors ${noModelSelected ? "text-brand-500 animate-pulse" : "text-slate-400 hover:text-brand-500"}`} />
                );

                return (
                  <ModelSelector
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={onSelectModel}
                    showCheckmark={!noModelSelected}
                    triggerIcon={triggerIcon}
                  />
                );
              })()}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
