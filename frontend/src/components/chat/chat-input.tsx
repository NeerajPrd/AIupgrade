import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect } from 'react'
import { LuBrain } from 'react-icons/lu';
import { TfiWorld } from 'react-icons/tfi';
import axios from 'axios';
import { useUpgradeChat } from '@/app/(chat1)/hooks/useUpgradeChat';
import ModelSelector from './modalSelector';
import { ChatArea } from './ChatArea';
import { useSelectedModelContext } from '@/contexts/SelectedModelContext';
import { useQuery } from '@tanstack/react-query';
import { getModels } from '@/lib/api/models';
const ChatInput = ({ history_id, handleSubmitInput }: { history_id: string, handleSubmitInput: (text: string, fileData?: string | null, fileName?: string | null) => void }) => {
    const [fileData, setFileData] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

    const { assignmentMode,
        browserMode,
        inputText,
        internetSearchEnabled,
        isStreaming,
        setAssignmentMode,
        setBrowserMode,
        setInputText,
        setInternetSearchEnabled,
        stopResponse,
    }
        = useUpgradeChat()

    const { selectedModel, setSelectedModel } = useSelectedModelContext();

    const { data: allModels } = useQuery({
        queryKey: ["models"],
        queryFn: getModels
    });

    const PROVIDER_ICONS: Record<string, string> = {
        openai: '/icons/openai.webp',
        gemini: '/icons/gemini-ai.jpg',
        anthropic: '/thirdparty/logos/anthropic.svg',
        deepseek: '/icons/deepseek.png',
        groq: '/icons/llama3.webp',
        hugging_face: '/icons/llama3.webp',
        localhost: '/spirit-monkey-icon.png',
        perplexity: '/spirit-monkey-icon.png'
    };

    const fetchedModelsList = React.useMemo(() => {
        const rawList = allModels?.data || allModels || [];
        return Array.isArray(rawList) ? rawList.map((model: any) => ({
            id: model.model_id || model.id,
            name: model.name,
            icon: PROVIDER_ICONS[model.provider] || '/spirit-monkey-icon.png'
        })) : [];
    }, [allModels]);

    // Set default model once loaded if the current selection isn't configured in the database
    useEffect(() => {
        if (fetchedModelsList.length > 0) {
            const isSelectionValid = fetchedModelsList.some(model => model.id === selectedModel);
            if (!isSelectionValid) {
                setSelectedModel(fetchedModelsList[0].id);
            }
        }
    }, [fetchedModelsList, selectedModel, setSelectedModel]);

    const handleSelectModel = (model: string) => {
        setSelectedModel(model)
    }

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                const base64Part = result.includes(',') ? result.split(',')[1] : result;
                resolve(base64Part);
            };
            reader.onerror = (error) => reject(error);
        });
    };

    const handleSubmit = async () => {
        if (!inputText.trim()) return;
        const textarea = document.querySelector("textarea");
        if (textarea) {
            textarea.style.height = "auto";
        }
        handleSubmitInput(inputText.trim(), fileData, fileName);
        setInputText("");
        setFileData(null);
        setFileName(null);
        setFilePreviewUrl(null);
    };

    const handleFileSelect = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            if (file.size > 5 * 1024 * 1024) {
                alert("File is too large. Maximum size is 5MB.");
                return;
            }
            
            const base64 = await fileToBase64(file);
            setFileData(base64);
            setFileName(file.name);

            // Generate a local object URL if it's an image for direct thumbnail rendering
            if (file.type.startsWith("image/")) {
                const previewUrl = URL.createObjectURL(file);
                setFilePreviewUrl(previewUrl);
            } else {
                setFilePreviewUrl(null);
            }
        } catch (error) {
            console.error("File processing error:", error);
        }
    };
    const isInputDisabled = fetchedModelsList.length === 0;

    return (
        <div className="w-full max-w-4xl mx-auto px-4 pb-6 pt-2 flex flex-col">
            <div className="flex items-center w-full">
                <div className="flex flex-col bg-white dark:bg-navy-800/90 rounded-3xl flex-1">
                    <div className="flex flex-row">
                        <div className={`relative flex flex-1 items-center`}>

                            {/* Main Input */}
                            <div className={`relative flex-1 h-full flex items-center`}>
                                <ChatArea
                                    value={inputText}
                                    onValueChange={setInputText}
                                    onSubmit={handleSubmit}
                                    onFileSelect={handleFileSelect}
                                    selectedFile={filePreviewUrl || fileName}
                                    onRemoveFile={() => {
                                        setFileData(null);
                                        setFileName(null);
                                        setFilePreviewUrl(null);
                                    }}
                                    isStreaming={isStreaming}
                                    onStop={stopResponse}
                                    disabled={isInputDisabled}
                                />
                            </div>
                            <div className='pr-4'>
                                <ModelSelector
                                    models={fetchedModelsList}
                                    selectedModel={selectedModel}
                                    onSelect={handleSelectModel}
                                />
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}

export default ChatInput