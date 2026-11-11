import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { API_ENDPOINTS } from '@/utils/api/api'
import { HumanizeTimestamp } from '@/utils/data/date'
import axios from '@/lib/api/axios'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'


interface IChatHistory {
    id: string;
    title: string;
    updated_at: string;
    // true when the conversation came from the website widget (not started inside the dashboard)
    is_website?: boolean;
}

type SourceFilter = 'all' | 'website' | 'dashboard'

const FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'website', label: 'Website visitors' },
    { value: 'dashboard', label: 'My test chats' },
]

const AgentHistoryDialog = ({ agent_id }: { agent_id: string }) => {
    const [history, setHistory] = useState<IChatHistory[]>([])
    const [loading, setLoading] = useState<boolean>(true)
    const [filter, setFilter] = useState<SourceFilter>('all')
    useEffect(() => {
        const fetchHistory = async () => {
            const response = await axios.get(`${API_ENDPOINTS.AGENT}/agent/chat/${agent_id}/conversations`)
            setHistory(response.data.data.history || [])
            setLoading(false)
        }
        fetchHistory()
    }, [])
    if (loading) {
        return <>Loading...</>
    }
    // The API returns newest first; the list is filtered here so switching tabs is instant.
    const visible = history.filter((chat) =>
        filter === 'all' ? true : filter === 'website' ? !!chat.is_website : !chat.is_website
    )
    return (
        <div className='flex flex-col gap-6'>
            <h2 className='text-2xl font-bold'>Agent History</h2>
            <div className='flex gap-2 px-6'>
                {FILTERS.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setFilter(option.value)}
                        className={`text-sm px-3 py-1 rounded-full border transition-colors ${filter === option.value
                            ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                            : 'border-gray-300 dark:border-zinc-700 text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <div className="h-[50vh] px-6 pb-6 overflow-y-auto custom-scrollbar">
                <div className="flex flex-col gap-3">
                    {visible.length === 0 && (
                        <p className='text-sm text-muted-foreground'>No conversations here yet.</p>
                    )}
                    {visible.map((chat) => (
                        <Link
                            href={`/agents/${agent_id}/chat/${chat.id}`}
                            key={chat.id}
                            className='w-full'
                        >
                            <Card
                                className="cursor-pointer transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 group"
                            >
                                <CardContent className="p-4 flex justify-between">
                                    <div className="flex justify-between mb-2 flex-col">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h3 className="font-semibold text-base group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {chat.title || 'Untitled Conversation'}
                                            </h3>
                                            {chat.is_website && (
                                                <Badge className="bg-emerald-600 hover:bg-emerald-600">Website</Badge>
                                            )}
                                        </div>
                                        {HumanizeTimestamp(chat.updated_at)}
                                    </div>
                                    <div className="flex items-center justify-center text-muted-foreground group-hover:text-foreground">
                                        <Badge variant="secondary">View</Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default AgentHistoryDialog
