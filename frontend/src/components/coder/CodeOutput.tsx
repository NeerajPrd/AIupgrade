"use client";

import React, { useState } from "react";
import { Code2, Maximize, Minimize, Copy, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CodeOutputProps {
  activeCode: string;
  viewMode: "code" | "preview";
  setViewMode: (mode: "code" | "preview") => void;
}

export function CodeOutput({
  activeCode,
  viewMode,
  setViewMode,
}: CodeOutputProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`${
        isFullscreen
          ? "fixed inset-0 z-50 bg-slate-50 dark:bg-navy-950 w-screen h-screen rounded-none border-none"
          : "flex-1 flex flex-col rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-gray-800/80 shadow-2xl backdrop-blur-md"
      } flex flex-col overflow-hidden relative`}
    >
      <div className="bg-slate-100 dark:bg-navy-900 px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-gray-800/80 shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("code")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              viewMode === "code"
                ? "bg-brand-500/10 dark:bg-brand-500/20 text-brand-500 dark:text-brand-500"
                : "text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300"
            }`}
          >
            Code
          </button>
          <button
            onClick={() => setViewMode("preview")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              viewMode === "preview"
                ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300"
            }`}
          >
            Preview Render
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 hover:bg-slate-200/50 dark:hover:bg-gray-800/50 transition-all"
            title={copied ? "Code Copied!" : "Copy Code"}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-md text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 hover:bg-slate-200/50 dark:hover:bg-gray-800/50 transition-all"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>
          <Code2 className="w-4 h-4 text-slate-400 dark:text-gray-500" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden bg-white dark:bg-[#0a0a0c] relative min-h-[300px] flex flex-col">
        {viewMode === "code" ? (
          <ScrollArea className={`w-full ${isFullscreen ? "h-[calc(100vh-50px)]" : "h-[380px] lg:h-[calc(100vh-200px)]"}`}>
            <pre className="p-6 text-sm text-blue-600 dark:text-blue-300 font-mono whitespace-pre-wrap select-text">
              <code>{activeCode}</code>
            </pre>
          </ScrollArea>
        ) : (
          <iframe
            srcDoc={activeCode}
            className="w-full h-full border-none bg-white min-h-[400px]"
            sandbox="allow-scripts allow-same-origin"
            title="Rendered Preview"
          />
        )}
      </div>
    </div>
  );
}
