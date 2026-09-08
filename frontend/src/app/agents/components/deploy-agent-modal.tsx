"use client"

import { useState, useEffect } from "react"
import { Copy, CheckCircle2, Save, Loader2, MessageSquare, Key, Eye, EyeOff, Trash2, Globe } from "lucide-react"
import { FaTelegramPlane, FaWhatsapp, FaFacebookMessenger } from "react-icons/fa"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    getAgentWebhookConfig,
    setAgentChannelConfig,
    publishAgentApi,
    getAgentApiInfo,
    revokeAgentApi,
} from "@/lib/api/agent"
import { showSuccessToast, showErrorToast } from "@/utils/toast"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { API_BASE_URL } from "@/utils/api/api"

// Import our new WhatsApp QR Components
import { WhatsAppMethodSelector } from "./whatsapp-method-selector"
import { WhatsAppDisclaimer } from "./whatsapp-disclaimer"
import { WhatsAppQRPanel } from "./whatsapp-qr-panel"

interface DeployAgentModalProps {
    isOpen: boolean
    onClose: () => void
    agentId: string
    agentName: string
}

export function DeployAgentModal({ isOpen, onClose, agentId, agentName }: DeployAgentModalProps) {
    const [activeTab, setActiveTab] = useState("whatsapp")
    const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})
    const queryClient = useQueryClient()

    // Form states
    const [whatsappConfig, setWhatsappConfig] = useState({ phone_number_id: "", app_secret: "", access_token: "" })
    const [messengerConfig, setMessengerConfig] = useState({ page_id: "", app_secret: "", page_access_token: "" })
    const [telegramConfig, setTelegramConfig] = useState({ bot_token: "" })

    // WhatsApp QR states
    const [whatsappMethod, setWhatsappMethod] = useState<'meta' | 'qr'>('meta')
    const [whatsappDisclaimerAccepted, setWhatsappDisclaimerAccepted] = useState(false)

    // API tab states
    const [revealApiKey, setRevealApiKey] = useState(false)
    const [oneTimeApiKey, setOneTimeApiKey] = useState<string | null>(null)

    const { data: webhookConfig, isLoading: isLoadingWebhooks } = useQuery({
        queryKey: ['agent-webhook-config', agentId],
        queryFn: () => getAgentWebhookConfig(agentId),
        enabled: isOpen && !!agentId
    })

    const { data: apiInfoResponse, isLoading: isLoadingApiInfo } = useQuery({
        queryKey: ['agent-api-info', agentId],
        queryFn: () => getAgentApiInfo(agentId),
        enabled: isOpen && !!agentId,
        retry: false,
    })
    const apiInfo = apiInfoResponse?.data || null

    const publishApiMutation = useMutation({
        mutationFn: () => publishAgentApi(agentId),
        onSuccess: (response) => {
            const data = response?.data || response
            if (data?.api_key) {
                setOneTimeApiKey(data.api_key)
                setRevealApiKey(true)
            }
            queryClient.invalidateQueries({ queryKey: ['agent-api-info', agentId] })
            showSuccessToast("API Key generated! Copy it now — it won't be shown again.")
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.message || "Failed to publish agent API"
            showErrorToast(msg)
        }
    })

    const revokeApiMutation = useMutation({
        mutationFn: () => revokeAgentApi(agentId),
        onSuccess: () => {
            setOneTimeApiKey(null)
            setRevealApiKey(false)
            queryClient.invalidateQueries({ queryKey: ['agent-api-info', agentId] })
            showSuccessToast("API credentials revoked successfully.")
        },
        onError: () => {
            showErrorToast("Failed to revoke API credentials.")
        }
    })

    const mutation = useMutation({
        mutationFn: (data: any) => setAgentChannelConfig(agentId, data),
        onSuccess: () => {
            showSuccessToast("Channel configuration saved successfully")
            queryClient.invalidateQueries({ queryKey: ['agent-webhook-config', agentId] })
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.message || error?.response?.data?.error || "Failed to save configuration"
            showErrorToast(msg)
        }
    })

    useEffect(() => {
        if (!isOpen) {
            setRevealApiKey(false)
            setOneTimeApiKey(null)
        }
    }, [isOpen])

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text)
        setCopiedStates(prev => ({ ...prev, [key]: true }))
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [key]: false }))
        }, 2000)
    }

    const handleSaveWhatsapp = () => {
        mutation.mutate({
            channel: "whatsapp",
            ...whatsappConfig
        })
    }

    const handleSaveMessenger = () => {
        mutation.mutate({
            channel: "messenger",
            ...messengerConfig
        })
    }

    const handleSaveTelegram = () => {
        mutation.mutate({
            channel: "telegram",
            ...telegramConfig
        })
    }

    const getWebhookUrl = (channel: string) => {
        return `${API_BASE_URL}/api/v1/webhook/${channel}/${agentId}`
    }

    const getVerifyToken = (channel: string) => {
        if (webhookConfig?.data && webhookConfig.data[channel]?.verify_token) {
            return webhookConfig.data[channel].verify_token
        }
        return `verify_${agentId}_${channel}`
    }

    const getAgentChatApiUrl = () => {
        if (!apiInfo?.slug) return ''
        return `${API_BASE_URL}/api/v1/agent-api/${apiInfo.slug}/chat`
    }

    const getMaskedApiKey = () => {
        const prefix = apiInfo?.api_key_prefix || ''
        return `${prefix}••••••••••••••••••••••••`
    }

    const escapeHtmlAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

    const getWidgetEmbedSnippet = () => {
        if (!apiInfo?.slug) return ''
        const scriptOrigin = typeof window !== 'undefined' ? window.location.origin : ''
        const apiKey = oneTimeApiKey || 'YOUR_API_KEY'
        return [
            '<script',
            `  src="${scriptOrigin}/widget.js"`,
            `  data-api-base="${API_BASE_URL}"`,
            `  data-agent-slug="${apiInfo.slug}"`,
            `  data-api-key="${apiKey}"`,
            `  data-agent-name="${escapeHtmlAttr(agentName)}"`,
            '  async',
            '></script>',
        ].join('\n')
    }

    const handleRevokeApi = () => {
        if (!confirm("Are you sure you want to revoke this API Key? Any external integrations using this key will immediately stop working.")) {
            return
        }
        revokeApiMutation.mutate()
    }

    const WebhookSection = ({ channel, label }: { channel: string, label: string }) => {
        const webhookUrl = getWebhookUrl(channel)
        const verifyToken = getVerifyToken(channel)
        
        return (
            <div className="space-y-4 mb-6 p-4 bg-muted/50 rounded-lg border">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                    {label} Webhook Details
                </h4>
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                    <div className="flex gap-2">
                        <Input readOnly value={webhookUrl} className="font-mono text-xs bg-background" />
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => handleCopy(webhookUrl, `${channel}_url`)}
                            className="shrink-0"
                        >
                            {copiedStates[`${channel}_url`] ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
                {channel !== 'telegram' && (
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Verify Token</Label>
                        <div className="flex gap-2">
                            <Input readOnly value={verifyToken} className="font-mono text-xs bg-background" />
                            <Button
                                variant="secondary"
                                size="icon"
                                onClick={() => handleCopy(verifyToken, `${channel}_token`)}
                                className="shrink-0"
                            >
                                {copiedStates[`${channel}_token`] ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Deploy to Channels
                    </DialogTitle>
                    <DialogDescription>
                        Connect <strong>{agentName}</strong> to popular messaging platforms.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="whatsapp" className="flex items-center gap-2">
                            <FaWhatsapp className="text-[#25D366]" /> WhatsApp
                        </TabsTrigger>
                        <TabsTrigger value="messenger" className="flex items-center gap-2">
                            <FaFacebookMessenger className="text-[#0084FF]" /> Messenger
                        </TabsTrigger>
                        <TabsTrigger value="telegram" className="flex items-center gap-2">
                            <FaTelegramPlane className="text-[#0088cc]" /> Telegram
                        </TabsTrigger>
                        <TabsTrigger value="website" className="flex items-center gap-2">
                            <Globe className="h-4 w-4" /> Website
                        </TabsTrigger>
                        <TabsTrigger value="api" className="flex items-center gap-2">
                            <Key className="h-4 w-4" /> API
                        </TabsTrigger>
                    </TabsList>

                    {/* WHATSAPP TAB */}
                    <TabsContent value="whatsapp" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <FaWhatsapp className="text-[#25D366]" /> WhatsApp Configuration
                                </CardTitle>
                                <CardDescription>
                                    Configure how your agent connects to WhatsApp.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <WhatsAppMethodSelector 
                                    selectedMethod={whatsappMethod} 
                                    onChange={setWhatsappMethod} 
                                />

                                {whatsappMethod === 'meta' && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                        <WebhookSection channel="whatsapp" label="WhatsApp" />
                                        
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <Label>Phone Number ID</Label>
                                                <Input 
                                                    placeholder="e.g. 104561234567890" 
                                                    value={whatsappConfig.phone_number_id}
                                                    onChange={e => setWhatsappConfig({...whatsappConfig, phone_number_id: e.target.value})}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label>App Secret</Label>
                                                <Input 
                                                    type="password"
                                                    placeholder="From your Meta App Dashboard" 
                                                    value={whatsappConfig.app_secret}
                                                    onChange={e => setWhatsappConfig({...whatsappConfig, app_secret: e.target.value})}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label>Permanent Access Token</Label>
                                                <Input 
                                                    type="password"
                                                    placeholder="EAAL..." 
                                                    value={whatsappConfig.access_token}
                                                    onChange={e => setWhatsappConfig({...whatsappConfig, access_token: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <Button 
                                            className="w-full mt-4" 
                                            onClick={handleSaveWhatsapp}
                                            disabled={mutation.isPending}
                                        >
                                            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                            Save WhatsApp Config
                                        </Button>
                                    </div>
                                )}

                                {whatsappMethod === 'qr' && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                        {!whatsappDisclaimerAccepted ? (
                                            <WhatsAppDisclaimer onAccept={() => setWhatsappDisclaimerAccepted(true)} />
                                        ) : (
                                            <WhatsAppQRPanel agentId={agentId} />
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* MESSENGER TAB */}
                    <TabsContent value="messenger" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <FaFacebookMessenger className="text-[#0084FF]" /> Messenger Configuration
                                </CardTitle>
                                <CardDescription>
                                    Connect your Facebook Page to allow the agent to handle Messenger conversations.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <WebhookSection channel="messenger" label="Messenger" />
                                
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label>Page ID</Label>
                                        <Input 
                                            placeholder="e.g. 104561234567890" 
                                            value={messengerConfig.page_id}
                                            onChange={e => setMessengerConfig({...messengerConfig, page_id: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>App Secret</Label>
                                        <Input 
                                            type="password"
                                            placeholder="From your Meta App Dashboard" 
                                            value={messengerConfig.app_secret}
                                            onChange={e => setMessengerConfig({...messengerConfig, app_secret: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Page Access Token</Label>
                                        <Input 
                                            type="password"
                                            placeholder="EAAL..." 
                                            value={messengerConfig.page_access_token}
                                            onChange={e => setMessengerConfig({...messengerConfig, page_access_token: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <Button 
                                    className="w-full mt-4" 
                                    onClick={handleSaveMessenger}
                                    disabled={mutation.isPending}
                                >
                                    {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    Save Messenger Config
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* TELEGRAM TAB */}
                    <TabsContent value="telegram" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <FaTelegramPlane className="text-[#0088cc]" /> Telegram Configuration
                                </CardTitle>
                                <CardDescription>
                                    Connect a Telegram Bot created via BotFather.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <WebhookSection channel="telegram" label="Telegram" />
                                
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label>Bot Token</Label>
                                        <Input 
                                            type="password"
                                            placeholder="e.g. 123456789:ABCdefGHIjklmNOPQrsTUVwxyZ" 
                                            value={telegramConfig.bot_token}
                                            onChange={e => setTelegramConfig({...telegramConfig, bot_token: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <Button
                                    className="w-full mt-4"
                                    onClick={handleSaveTelegram}
                                    disabled={mutation.isPending}
                                >
                                    {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    Save Telegram Config
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* WEBSITE TAB */}
                    <TabsContent value="website" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Globe className="h-4.5 w-4.5" /> Website Widget
                                </CardTitle>
                                <CardDescription>
                                    Embed a floating chat bubble powered by <strong>{agentName}</strong> on any website with a single script tag.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isLoadingApiInfo ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : apiInfo ? (
                                    <div className="space-y-4">
                                        {!oneTimeApiKey && (
                                            <Alert>
                                                <AlertDescription className="text-xs">
                                                    The snippet below uses a placeholder for the API key because the full key is only shown once, right after it's generated.
                                                    Copy it from the <strong>API</strong> tab if you still have it, or revoke and regenerate there to get a fresh one.
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Embed Snippet</Label>
                                            <div className="flex gap-2">
                                                <Textarea
                                                    readOnly
                                                    value={getWidgetEmbedSnippet()}
                                                    rows={8}
                                                    className="font-mono text-xs bg-background resize-none"
                                                />
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    onClick={() => handleCopy(getWidgetEmbedSnippet(), 'website_snippet')}
                                                    className="shrink-0"
                                                >
                                                    {copiedStates['website_snippet'] ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground pt-1">
                                                Paste this right before the closing <code>{'</body>'}</code> tag of your site. It renders a floating chat bubble that opens a chat panel talking to this agent — no other setup required.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-center py-8 gap-4">
                                        <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl text-primary">
                                            <Globe className="h-8 w-8" />
                                        </div>
                                        <p className="text-xs text-muted-foreground max-w-sm">
                                            This widget reuses the agent's API key. Generate one from the <strong>API</strong> tab first, then come back here for the embed snippet.
                                        </p>
                                        <Button
                                            variant="secondary"
                                            className="w-full"
                                            onClick={() => setActiveTab('api')}
                                        >
                                            <Key className="h-4 w-4 mr-2" />
                                            Go to API Tab
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* API TAB */}
                    <TabsContent value="api" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Key className="h-4.5 w-4.5" /> Agent Chat API
                                </CardTitle>
                                <CardDescription>
                                    Let other apps chat with <strong>{agentName}</strong> (grounded in its uploaded documents) using a secure API key.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isLoadingApiInfo ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : apiInfo ? (
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Slug</Label>
                                            <div className="flex gap-2">
                                                <Input readOnly value={apiInfo.slug || ''} className="font-mono text-xs bg-background" />
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    onClick={() => handleCopy(apiInfo.slug || '', 'api_slug')}
                                                    className="shrink-0"
                                                >
                                                    {copiedStates['api_slug'] ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Secret API Key</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    readOnly
                                                    value={revealApiKey ? (oneTimeApiKey || getMaskedApiKey()) : getMaskedApiKey()}
                                                    className="font-mono text-xs bg-background"
                                                />
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    onClick={() => setRevealApiKey(!revealApiKey)}
                                                    className="shrink-0"
                                                    title={revealApiKey ? "Hide API Key" : "Show API Key"}
                                                >
                                                    {revealApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    onClick={() => {
                                                        const keyToCopy = oneTimeApiKey || ''
                                                        if (!keyToCopy) {
                                                            showErrorToast("Full API key is no longer available. Revoke and regenerate to get a new one.")
                                                            return
                                                        }
                                                        handleCopy(keyToCopy, 'api_key')
                                                    }}
                                                    className="shrink-0"
                                                >
                                                    {copiedStates['api_key'] ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Chat Endpoint URL</Label>
                                            <div className="flex gap-2">
                                                <Input readOnly value={getAgentChatApiUrl()} className="font-mono text-xs bg-background" />
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    onClick={() => handleCopy(getAgentChatApiUrl(), 'api_url')}
                                                    className="shrink-0"
                                                >
                                                    {copiedStates['api_url'] ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground pt-1">
                                                POST with header <code>X-API-Key</code> and JSON body <code>{`{"message": "..."}`}</code>.
                                            </p>
                                        </div>

                                        <Button
                                            variant="destructive"
                                            className="w-full mt-2"
                                            onClick={handleRevokeApi}
                                            disabled={revokeApiMutation.isPending}
                                        >
                                            {revokeApiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                            Revoke API Credentials
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-center py-8 gap-4">
                                        <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl text-primary">
                                            <Key className="h-8 w-8" />
                                        </div>
                                        <p className="text-xs text-muted-foreground max-w-sm">
                                            Publish this agent as a callable API so external apps can chat with it using its uploaded documents via RAG.
                                        </p>
                                        <Button
                                            className="w-full"
                                            onClick={() => publishApiMutation.mutate()}
                                            disabled={publishApiMutation.isPending}
                                        >
                                            {publishApiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
                                            Generate API Key
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
