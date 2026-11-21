"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "@radix-ui/react-icons";

type Model = {
    id: string;
    name: string;
    icon: string;
};

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    onSelect: (modelId: string) => void;
    triggerIcon?: React.ReactNode;
    showCheckmark?: boolean;
}

export default function ModelSelector({
    models,
    selectedModel,
    onSelect,
    triggerIcon,
    showCheckmark = true,
}: ModelSelectorProps) {
    if (models.length === 0) {
        return null;
    }

    const currentModel =
        models.find((model) => model.id === selectedModel) ?? models[0];

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    className="flex items-center justify-center w-10 h-10 rounded-lg bg-white dark:bg-navy-800 hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
                >
                    {triggerIcon || (
                        <img
                            src={currentModel.icon}
                            alt={currentModel.name}
                            className="w-6 h-6 rounded-full"
                        />
                    )}
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    sideOffset={8}
                    align="end"
                    className="min-w-[240px] overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-navy-800 shadow-lg p-1 z-50 animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-gray-400 border-b border-slate-100 dark:border-gray-800 mb-1 flex items-center gap-2">
                        <CheckIcon className="w-3.5 h-3.5 opacity-0" /> {/* Spacer */}
                        Select Model
                    </div>
                    {models.map((model) => (
                        <DropdownMenu.Item
                            key={model.id}
                            onSelect={() => onSelect(model.id)}
                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-md cursor-pointer outline-none hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <img
                                    src={model.icon}
                                    alt={model.name}
                                    className="w-5 h-5 rounded-full"
                                />
                                <span className="text-sm font-medium">{model.name}</span>
                            </div>

                            {showCheckmark && selectedModel === model.id && (
                                <CheckIcon className="w-4 h-4 text-brand-500" />
                            )}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}