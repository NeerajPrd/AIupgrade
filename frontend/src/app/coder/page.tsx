"use client";

import React, { useState, useEffect, useRef } from "react";
import { CircleDot } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { generateCode } from "@/lib/api/coder";
import { getModels } from "@/lib/api/models";
import { TerminalInput } from "@/components/coder/TerminalInput";
import { CodeOutput } from "@/components/coder/CodeOutput";
import ModelSelector from "@/components/chat/modalSelector";
import { useSelectedModelContext } from "@/contexts/SelectedModelContext";

const PROVIDER_ICONS: Record<string, string> = {
  openai: "/icons/openai.webp",
  gemini: "/icons/gemini-ai.jpg",
  anthropic: "/thirdparty/logos/anthropic.svg",
  deepseek: "/icons/deepseek.png",
  llama: "/icons/llama3.webp",
  localhost: "/spirit-monkey-icon.png",
  perplexity: "/spirit-monkey-icon.png",
};

export default function Home() {
  const [command, setCommand] = useState("");
  const [activeCode, setActiveCode] = useState(
    "// Welcome to Spirit Monkey Code.\n// Ask me to build something, and the code will appear here."
  );
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [logs, setLogs] = useState([
    { type: "info", text: "[⚡ Spirit Monkey Code Initialized] System online." },
    { type: "success", text: "[✓ System] Ready for commands." },
  ]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  
  const { selectedModel, setSelectedModel } = useSelectedModelContext();

  // TanStack Query to Fetch Models
  const { data: allModels } = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
  });

  const fetchedModelsList = React.useMemo(() => {
    const rawList = allModels?.data || allModels || [];
    return Array.isArray(rawList)
      ? rawList.map((model: any) => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          icon: PROVIDER_ICONS[model.provider] || "/spirit-monkey-icon.png",
        }))
      : [];
  }, [allModels]);

  useEffect(() => {
    if (fetchedModelsList.length > 0) {
      const isSelectedModelValid = fetchedModelsList.some(m => m.id === selectedModel);
      if (!isSelectedModelValid) {
        setSelectedModel(fetchedModelsList[0].id);
      }
    }
  }, [fetchedModelsList, selectedModel, setSelectedModel]);

  // TanStack Query Mutation for code generation
  const codeMutation = useMutation({
    mutationFn: ({ prompt, history, model }: { prompt: string; history: any[]; model: string }) => 
      generateCode(prompt, history, model),
  });

  const simulateWork = async (cmd: string) => {
    setActiveCode("");
    setIsProcessing(true);
    setLogs((prev) => [...prev, { text: `[⚡ Spirit Monkey Code Intercept]: Routing natural language prompt to AI Backend...`, type: "warning" }]);

    try {
      const currentModel = fetchedModelsList.find(m => m.id === selectedModel);
      if (!currentModel) throw new Error("No model selected");

      // Execute via TanStack Mutation to fetch the SSE Response
      const response = await codeMutation.mutateAsync({
        prompt: cmd,
        history: history,
        model: currentModel.id
      });

      if (!response.ok) {
        throw new Error(`API failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is not readable.");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulatedCode = "";
      let finished = false;

      setLogs((prev) => [...prev, { text: `[⚡ Spirit Monkey Code Intercept]: Connection established. Streaming code chunks...`, type: "info" }]);

      let cleanCodeResult = "";

      while (!finished) {
        const { value, done } = await reader.read();
        if (done) {
          finished = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep partial line for next chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed === "data: [DONE]") {
            finished = true;
            break;
          }

          if (trimmed.startsWith("data: ")) {
            try {
              const payloadStr = trimmed.slice(6);
              const payload = JSON.parse(payloadStr);
              if (payload.token) {
                accumulatedCode += payload.token;

                // Strip leading/trailing codeblock wrappers dynamically for clean code editor/preview rendering
                let cleanCode = accumulatedCode;
                if (cleanCode.startsWith("```")) {
                  cleanCode = cleanCode.replace(/^```[a-zA-Z]*\n/, "");
                }
                if (cleanCode.endsWith("```")) {
                  cleanCode = cleanCode.replace(/```$/, "");
                }

                cleanCodeResult = cleanCode;
                setActiveCode(cleanCode);
              }
            } catch (err) {
              console.debug("Partial JSON stream chunk parsing skipped", err);
            }
          }
        }
      }

      // Update history state so the next request remembers what happened
      setHistory((prev) => [
        ...prev,
        { role: "user", content: cmd },
        { role: "assistant", content: cleanCodeResult }
      ]);

      setLogs((prev) => [
        ...prev,
        { text: `[✓ System]: Code generated and compiled successfully!`, type: "success" }
      ]);

    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        { text: `[✗ System]: ${err.message || "AI Backend Unreachable."}`, type: "error" }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing || fetchedModelsList.length === 0 || !selectedModel) return;

    setLogs((prev) => [...prev, { text: `> ${command}`, type: "command" }]);
    simulateWork(command);
    setCommand("");
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="min-h-screen font-mono flex flex-col p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Spirit Monkey Code</h1>
          <p className="text-muted-foreground mt-1 font-sans text-sm">Enterprise AI Developer</p>
        </div>
        <div className="flex items-center gap-4 text-sm shrink-0">
        </div>
      </div>

      {/* Main Interface Layout - Removed sidebar wrapper */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 h-full min-h-[600px] overflow-hidden">
        {/* Terminal Input Area (Modularized) */}
        <TerminalInput
          logs={logs}
          command={command}
          setCommand={setCommand}
          onSubmit={handleCommand}
          logEndRef={logEndRef}
          isProcessing={isProcessing}
          disabled={fetchedModelsList.length === 0}
          noModelSelected={fetchedModelsList.length > 0 && !selectedModel}
          models={fetchedModelsList}
          selectedModel={selectedModel}
          onSelectModel={(modelId) => {
            console.log("Selected model in Coder:", modelId);
            setSelectedModel(modelId);
          }}
        />

        {/* Code Output / Preview Area (Modularized) */}
        <CodeOutput
          activeCode={activeCode}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </main>
    </div>
  );
}
