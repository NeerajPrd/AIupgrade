import { AgentSpend } from "@/lib/api/admin"
import SpendBar from "@/app/admin/leads/spend-bar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { IAgentView } from "@/types/agent"
import axios from '@/lib/api/axios'
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { DeployAgentModal } from "./deploy-agent-modal"
import { AgentDetailsModal } from "./agent-details-modal"

export default function AgentCard({ agent, isCustom = false, spend }: {
    agent: IAgentView,
    isCustom?: boolean,
    // Admins only: this month's AI spend for the assistant (website chats).
    spend?: AgentSpend,
}) {
    const [imageUrl, setImageUrl] = useState<string>('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIALcAwwMBIgACEQEDEQH/xAAbAAEAAgMBAQAAAAAAAAAAAAAABAUBAwYCB//EADEQAQACAQIDBwIDCQAAAAAAAAABAgMEESExUQUSIjJBYXEjUhMUwRUzYoGRoaKx0f/EABcBAQEBAQAAAAAAAAAAAAAAAAABAgP/xAAWEQEBAQAAAAAAAAAAAAAAAAAAARH/2gAMAwEAAhEDEQA/APoIDo5gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9232z/QGAAAAAAAAAAAAAAAAAAAAASdHpLam2/lxxzt/wABqw4cme/dx13n/SywdmY67Tmnvz0jhCZixUw0imOu1Ye2dakeaY6Y42x0rX4jZ73YEV4yYseSPqUrb5hEzdmYr7zimaT05wnAKDUaXNp/PXw/dHGGl0s8Y2nkr9X2bW299P4bfZ6T8NSs2KoZtE0tNbRMTHOJFRgAAABmtbXtFaxMzPpEMLzQaeuHBWdvHaN7T+iWrIq/yOp23/Bnb5homJrMxaJiY5xLpEPtPT1yYZyxHjpG+/WDVxTAKyAAA94cVs2WuOnOf7A26PTW1OTblSPNK8pSuOkUpG1Y5Q84MVcGKMdOUevV7ZtakAEUAAAAAA2iecQwyA5oBtgAAdDp7xkwUvXlNXPJGk1l9NO0R3qTzrKWLKvWjXXimkyzPrXux/NG/auPb91ffpwQdVqsmptE34VjlWPRJFtaAGmQABd9n6b8vi3tH1Lc/b2Q+y9N37/jXjw1nw+8rZm1qQARQAAAAAAAAAFVbsrJHky1n5jZFzaXPh43xzt1jjC/F1Mc0LvUaDDm3msdy/WsfoqtRpsunttkrw9LRyldTGkBUAAAAG3TYbZ80Y6+vOekNS80Gm/L4vFH1Lcbe3slqyJFKVx0ilI2rEbQyDLQAAAAAAAAAAAAAAxatb1mt4iazziWQFRrOz7Yt74d7U9Y9YQXSq/XaCL75MEbW9a9fhZUsVQTG07TwkaZAS9Bo51Fu/eNsUf5ewN3Zel70xnyRwjyR191oREREREbRHKBhuAAAAAAAAAAAAAAAAAAAAIur0VNR4qz3MnXr8oE9m6iJ2iKz7xZci6mK7T9mRExbPaLfw15LGIiIiIiIiOUQCKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//Z');
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const agentId = (agent as any)._id || (agent as any).id || "";

    useEffect(() => {
        const getImageUrl = async (image: string) => {
            if (!image) return null;
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
            const imagePath = `agents/${image}`;
            const finalUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${imagePath.replace(/^\//, '')}` : `/${imagePath.replace(/^\//, '')}`;
            setImageUrl(finalUrl);
        }
        if (!agent.image) return;
        getImageUrl(agent.image)
    }, [agent.image])
    return (
        <>
            <Card className="overflow-hidden hover:shadow-md transition-shadow">
                <div>
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <Image src={imageUrl} width={50} height={50} className="rounded-full" alt="" />
                        <div>
                            <CardTitle className="text-xl">{agent.name}</CardTitle>
                            {isCustom && (
                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mt-1">
                                    Custom
                                </span>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <CardDescription className="line-clamp-2 min-h-[40px]">{agent.description}</CardDescription>
                        {spend && (
                            <div className="mt-3" title="AI spending on website chats this month (UTC)">
                                <SpendBar spend={spend} compact />
                            </div>
                        )}
                    </CardContent>
                </div>
                <CardFooter className="flex justify-end gap-2 border-t p-4">
                    <Button variant="outline" size="sm" onClick={() => setIsDetailsModalOpen(true)}>
                        View Details
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsDeployModalOpen(true)}>
                        Deploy
                    </Button>
                    <Button asChild size="sm">
                        <Link href={`/agents/${agentId}/chat?userId=${(agent as any).user_id || ""}`}>Chat</Link>
                    </Button>
                </CardFooter>
            </Card>
            
            <DeployAgentModal 
                isOpen={isDeployModalOpen}
                onClose={() => setIsDeployModalOpen(false)}
                agentId={agentId}
                agentName={agent.name}
            />

            {isDetailsModalOpen && (
                <AgentDetailsModal 
                    isOpen={isDetailsModalOpen}
                    onClose={() => setIsDetailsModalOpen(false)}
                    agentId={agentId}
                />
            )}
        </>
    )
}