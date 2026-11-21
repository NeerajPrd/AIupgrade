"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkflowStore } from '@/lib/store/workflow';
import { ExecutionStatus } from '@/lib/types/execution/execution';
import { X, Minimize, Maximize, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showSuccessToast } from "@/utils/toast";
import { API_BASE_URL } from '@/utils/api/api';
import axiosInstance from '@/lib/api/axios';

const statusColors: Record<ExecutionStatus, string> = {
  idle: 'bg-gray-200',
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  error: 'bg-red-500'
};

export function ExecutionPanel() {
  const { currentExecution, isCurrentExecutionSavedId } = useWorkflowStore();
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(true);
  const [visible, setVisible] = useState(true);
  const [maximized, setMaximized] = useState(false);

  const getFileUrl = async (url: string): Promise<string> => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
    const finalUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}` : `/${url.replace(/^\//, '')}`;
    return finalUrl;
  }
  useEffect(() => {
    const fetchUrls = async () => {
      if (!currentExecution) return;
      const newUrls: Record<string, string> = {};

      await Promise.all(
        Object.values(currentExecution.nodes).map(async (node) => {
          console.log('node', getContentType(node.output))
          if (node.output && getContentType(node.output) !== 'text') {
            try {
              const url = await getFileUrl(node.output);
              newUrls[node.output] = url;
            } catch (e) {
              console.error(`Failed to fetch file URL for ${node.output}`, e);
            }
          }
        })
      );

      setFileUrls(newUrls);
    };

    fetchUrls();
  }, [currentExecution]);

  useEffect(() => {
    setVisible(!!currentExecution);
    // executeWorkflow();
  }, [currentExecution])

  if (!currentExecution || !visible) return null;


  function getContentType(response: string): 'text' | 'image' | 'video' | 'audio' {
    try {
      const ext = response.split('.').pop()?.toLowerCase();
      if (!ext) return 'text';

      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      const videoExts = ['mp4', 'webm', 'mov', 'avi'];
      const audioExts = ['mp3', 'wav', 'ogg', 'm4a'];
      if (imageExts.includes(ext)) return 'image';
      if (videoExts.includes(ext)) return 'video';
      if (audioExts.includes(ext)) return 'audio';
    } catch {
      // Not a valid URL
    }

    return 'text';
  }

  const handleDismiss = () => {
    setVisible(false);
    // Optionally clear the execution from the store
    // setCurrentExecution && setCurrentExecution(null);
  };

  const toggleMaximize = () => {
    setMaximized(!maximized);
    setExpanded(true);
  };

  return (
    <Card
      className={`fixed bottom-4 right-4 z-40 shadow-2xl border border-brand-500 transition-all duration-300 bg-navy-950 text-zinc-100 rounded-xl overflow-hidden max-md:bottom-2 max-md:right-2 max-md:m-0 max-md:w-[calc(100%-16px)] ${maximized ? 'w-full md:w-3/4 lg:w-2/3 h-3/4' : expanded ? 'w-full sm:w-[450px] h-[400px] max-md:h-[280px]' : 'w-full sm:w-[450px] h-auto'
        }`}
    >
      <div className="p-3 border-b flex items-center justify-between bg-[#1a1a1e] border-brand-500/30 select-none">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-3 rounded-full ${statusColors[currentExecution.status]}`} />
          <h3 className="font-semibold text-xs tracking-wider uppercase text-brand-500/95">Terminal Logs</h3>
          <span className="text-[10px] font-mono text-zinc-500 ml-2">
            {new Date(currentExecution.startTime).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="p-1 h-5 w-5 text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMaximize}
            className="p-1 h-5 w-5 text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            {maximized ? <Minimize size={12} /> : <Maximize size={12} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="p-1 h-5 w-5 text-red-400 hover:text-red-500 hover:bg-red-950/20"
          >
            <X size={12} />
          </Button>
        </div>
      </div>

      {expanded && (
        <ScrollArea className={`${maximized ? 'h-[calc(100%-3rem)]' : 'h-[330px] max-md:h-[210px]'} p-3 font-mono`}>
          {Object.values(currentExecution.nodes).map((node) => (
            <div key={node.id} className="mb-4 last:mb-2 bg-navy-900 border border-zinc-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-zinc-900">
                <div className={`w-2 h-2 rounded-full ${statusColors[node.status]}`} />
                <span className="font-bold text-xs text-brand-500 font-mono">{node.id}</span>
                <span className="text-[10px] ml-auto text-zinc-500 font-mono">
                  {new Date(currentExecution.startTime).toLocaleTimeString()}
                </span>
              </div>
              {node.output &&
                getContentType(node.output) == 'text' &&
                (
                  <div className="bg-navy-950 p-2 rounded-md border border-zinc-950">
                    <ScrollArea className="max-h-[220px] overflow-y-auto">
                      <pre className="text-[11px] whitespace-pre-wrap break-words leading-relaxed text-zinc-300 font-mono">
                        {JSON.stringify(node.output, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                )
              }
              {node.output &&
                getContentType(node.output) == 'image' &&
                (
                  <div>
                    <div className="bg-navy-950 p-2 rounded-md border border-zinc-950">
                      <ScrollArea className="max-h-[220px] overflow-y-auto">
                        <img
                          src={fileUrls[node.output]}
                          alt='output'
                          width={500}
                          height={500}
                          className="rounded-md"
                        />
                      </ScrollArea>
                    </div>
                  </div>
                )
              }
              {node.output &&
                getContentType(node.output) == 'audio' &&
                (
                  <div>
                    <div className="bg-navy-950 p-2 rounded-md border border-zinc-950">
                      <ScrollArea className="max-h-[220px] overflow-y-auto">
                        <audio controls key={node.output} className="h-8 max-w-full">
                          <source src={fileUrls[node.output]} type="audio/mpeg" />
                          Your browser does not support the audio element.
                        </audio>
                      </ScrollArea>
                    </div>
                  </div>
                )
              }
              {node.output &&
                getContentType(node.output) == 'video' &&
                (
                  <div>
                    <div className="bg-navy-950 p-2 rounded-md border border-zinc-950">
                      <ScrollArea className="max-h-[220px] overflow-y-auto">
                        <video width="640" height="360" controls className="max-w-full rounded-md">
                          <source src={fileUrls[node.output]} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      </ScrollArea>
                    </div>
                  </div>
                )
              }


              {node.error && (
                <div className="mt-2 p-2.5 bg-red-950/20 border border-red-900/40 rounded-md">
                  <ScrollArea className="max-h-[150px] overflow-y-auto">
                    <p className="text-[11px] text-red-400 whitespace-pre-wrap break-words font-mono leading-relaxed">{node.error}</p>
                  </ScrollArea>
                </div>
              )}
            </div>
          ))}
        </ScrollArea>
      )
      }
    </Card >
  );
}