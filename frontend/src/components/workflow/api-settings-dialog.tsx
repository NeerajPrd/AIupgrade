"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Key, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Loader2, 
  Trash2, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/utils/toast';
import { 
  getWorkflowApiInfo, 
  publishWorkflowApi, 
  revokeWorkflowApi 
} from '@/lib/api/workflow';

interface ApiSettingsDialogProps {
  workflowId: string;
}

export function ApiSettingsDialog({ workflowId }: ApiSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [apiInfo, setApiInfo] = useState<{
    is_active?: boolean;
    api_key?: string;
    slug?: string;
    rate_limit?: number;
    timeout?: number;
    api_key_prefix?: string;
  } | null>(null);

  const [revealKey, setRevealKey] = useState(false);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Fetch API information
  const fetchApiInfo = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    try {
      const response = await getWorkflowApiInfo(workflowId);
      const data = response?.data || response;
      if (data && (data.api_key || data.slug || data.api_key_prefix)) {
        setApiInfo(data);
      } else {
        setApiInfo(null);
      }
    } catch (error) {
      console.warn("Workflow API not configured yet:", error);
      setApiInfo(null);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    if (open && workflowId) {
      fetchApiInfo();
    } else {
      setApiInfo(null);
      setRevealKey(false);
      setOneTimeKey(null);
    }
  }, [open, workflowId, fetchApiInfo]);

  // Generate / Publish API key and slug
  const handleGenerate = async () => {
    if (!workflowId) return;
    setActionLoading(true);
    try {
      const response = await publishWorkflowApi(workflowId);
      const data = response?.data || response;
      setApiInfo(data);
      if (data.api_key) {
        setOneTimeKey(data.api_key);
        setRevealKey(true);
      }
      showSuccessToast("API Key generated! Copy it now — it won't be shown again.");
    } catch (error) {
      console.error("Failed to generate API details:", error);
      showErrorToast("Failed to generate API details.");
    } finally {
      setActionLoading(false);
    }
  };

  // Revoke API Key and slug
  const handleRevoke = async () => {
    if (!workflowId) return;
    if (!confirm("Are you sure you want to revoke this API Key? Any external integrations using this key will immediately stop working.")) {
      return;
    }
    setActionLoading(true);
    try {
      await revokeWorkflowApi(workflowId);
      setApiInfo(null);
      showSuccessToast("API credentials revoked successfully.");
    } catch (error) {
      console.error("Failed to revoke API credentials:", error);
      showErrorToast("Failed to revoke API credentials.");
    } finally {
      setActionLoading(false);
    }
  };

  // Copy helper
  const handleCopy = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showSuccessToast("Copied to clipboard!");
  };

  // Get full execution URL
  const getExecutionUrl = () => {
    if (typeof window === 'undefined' || !apiInfo?.slug) return '';
    return `${window.location.origin}/api/v1/workflow-api/${apiInfo.slug}/execute`;
    // Note: In production, replace with your backend URL if different from frontend
  };

  // Mask Key Generator (keeps prefix visible at first)
  const getMaskedKey = () => {
    const prefix = apiInfo?.api_key_prefix || '';
    return `${prefix}••••••••••••••••••••••••`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="hover:bg-brand-500/20 shrink-0 border-brand-500/50 h-9 transition-all hover:scale-105 active:scale-95">
          <Key className="h-4 w-4 mr-2 text-brand-500" />
          <span>API<span className="hidden md:inline"> Integration</span></span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl bg-navy-950 border-zinc-800/80 text-foreground p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="border-b border-zinc-900 pb-4">
          <DialogTitle className="flex items-center justify-between text-lg font-bold text-zinc-100">
            <span className="flex items-center gap-2">
              <span className="p-1.5 bg-brand-500/10 rounded-lg text-brand-500">
                <Key className="h-4.5 w-4.5" />
              </span>
              Workflow API Integration
            </span>
            {apiInfo && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Active Connection
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-9 w-9 animate-spin text-brand-500" />
            <p className="text-xs text-zinc-400 font-mono">Fetching active API configuration...</p>
          </div>
        ) : apiInfo ? (
          <div className="space-y-5 pt-4">
            {/* Slug & API Key Card Wrapper */}
            <div className="bg-navy-950 border border-zinc-900 rounded-xl p-4 space-y-4">
              {/* Slug Info */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase">Workflow Slug</label>
                <div className="flex gap-2">
                  <Input 
                    readOnly 
                    value={apiInfo.slug || ''} 
                    className="bg-black/40 border-zinc-800 text-zinc-300 focus-visible:ring-0 select-all font-mono text-xs h-9"
                  />
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 h-9 w-9 text-zinc-400 hover:text-zinc-200"
                    onClick={() => handleCopy(apiInfo.slug || '', setCopiedSlug)}
                  >
                    {copiedSlug ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {/* API Key Info with Prefix Visible while Masked */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase">Secret API Key</label>
                <div className="flex gap-2">
                  <Input 
                    readOnly 
                    type="text"
                    value={revealKey ? (oneTimeKey || apiInfo.api_key || getMaskedKey()) : getMaskedKey()} 
                    className="bg-black/40 border-zinc-800 text-zinc-300 focus-visible:ring-0 font-mono text-xs h-9 tracking-wider"
                  />
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 h-9 w-9 text-zinc-400 hover:text-zinc-200"
                    onClick={() => setRevealKey(!revealKey)}
                    title={revealKey ? "Hide API Key" : "Show API Key"}
                  >
                    {revealKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 h-9 w-9 text-zinc-400 hover:text-zinc-200"
                    onClick={() => {
                      const keyToCopy = oneTimeKey || apiInfo.api_key || '';
                      if (!keyToCopy || keyToCopy === getMaskedKey()) {
                        showErrorToast("Full API key is no longer available. Revoke and regenerate to get a new one.");
                        return;
                      }
                      handleCopy(keyToCopy, setCopiedKey);
                    }}
                  >
                    {copiedKey ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Webhook Endpoint Card */}
            <div className="bg-navy-950 border border-zinc-900 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase">Webhook Endpoint URL</label>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="h-auto p-0 text-[11px] text-brand-500 hover:text-brand-500/80"
                  onClick={() => handleCopy(getExecutionUrl(), setCopiedUrl)}
                >
                  {copiedUrl ? "Copied!" : "Copy URL"}
                </Button>
              </div>
              <Input 
                readOnly 
                value={getExecutionUrl()} 
                className="bg-black/40 border-zinc-800 text-zinc-300 focus-visible:ring-0 select-all font-mono text-[11px] h-9"
              />
            </div>

            {/* Revoke Option */}
            <div className="pt-3 border-t border-zinc-900/60 flex justify-end">
              <Button 
                variant="destructive" 
                disabled={actionLoading}
                onClick={handleRevoke}
                className="bg-red-950/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 hover:border-transparent flex items-center gap-2 h-9 text-xs font-semibold px-4 transition-all"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Revoke Integration Credentials
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            {/* Pulsing visual indicator */}
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-brand-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative p-5 bg-brand-500/5 border border-brand-500/15 rounded-2xl text-brand-500">
                <Key className="h-10 w-10" />
              </div>
            </div>
            
            <div className="space-y-2 mb-6">
              <h4 className="font-bold text-base text-zinc-100 flex items-center justify-center gap-1.5">
                Configure Workflow API
                <Sparkles className="h-4 w-4 text-brand-500" />
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                Connect and trigger this AI workflow programmatically from external apps, servers, or webhooks using a secure API Key and personalized Slug endpoint.
              </p>
            </div>

            <Button 
              disabled={actionLoading}
              onClick={handleGenerate}
              className="w-full bg-brand-500 hover:bg-brand-500/90 text-white font-bold flex items-center justify-center gap-2 h-10 shadow-lg shadow-brand-500/10 transition-transform active:scale-98"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Integration...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" />
                  Generate API Key & Slug
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}