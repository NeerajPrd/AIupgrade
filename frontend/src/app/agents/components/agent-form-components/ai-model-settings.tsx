import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import React, { useEffect, useState } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import { AgentFormData } from '@/lib/schemas/agent'
import { Slider } from '@/components/ui/slider'

const PREDEFINED_PROVIDERS = [
    { value: "openAI", label: "OpenAI" },
    { value: "gemini", label: "Gemini" },
    { value: "anthropic", label: "Anthropic" },
    { value: "groq", label: "Groq" },
    { value: "grok", label: "Grok" },
    { value: "deepseek", label: "DeepSeek" },
]

const AIModelSettingsForm = () => {
    const { register, control, watch, setValue, formState: { errors } } = useFormContext<AgentFormData>()
    
    const temperature = watch('model_settings.temperature')
    const currentModel = watch('model_settings.llm_model')

    // Determine initial dropdown selection based on current form value
    const [dropdownSelection, setDropdownSelection] = useState<string>(() => {
        const isPredefined = PREDEFINED_PROVIDERS.some(p => p.value === currentModel)
        return isPredefined ? currentModel : "custom"
    })

    const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value
        setDropdownSelection(value)
        if (value !== "custom") {
            setValue('model_settings.llm_model', value, { shouldValidate: true })
        } else {
            setValue('model_settings.llm_model', '', { shouldValidate: true }) // clear for custom input
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">AI Model Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Configure the AI model provider and parameters for your agent.
                </p>
            </div>
            
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="provider_select">Provider</Label>
                    <select 
                        id="provider_select"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={dropdownSelection}
                        onChange={handleDropdownChange}
                    >
                        {PREDEFINED_PROVIDERS.map(provider => (
                            <option key={provider.value} value={provider.value}>{provider.label}</option>
                        ))}
                        <option value="custom">Custom Provider</option>
                    </select>
                </div>

                {dropdownSelection === "custom" && (
                    <div className="space-y-2">
                        <Label htmlFor="custom_model">Custom Provider Name</Label>
                        <Input 
                            id="custom_model" 
                            placeholder="Enter custom provider name"
                            {...register('model_settings.llm_model')}
                        />
                        {errors.model_settings?.llm_model && (
                            <p className="text-xs text-red-500 font-medium">{errors.model_settings.llm_model.message}</p>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="api_key">API Key (Optional)</Label>
                    <Input
                        id="api_key"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Enter your API key"
                        {...register('model_settings.api_key')}
                    />
                    {errors.model_settings?.api_key && (
                        <p className="text-xs text-red-500 font-medium">{errors.model_settings.api_key.message}</p>
                    )}
                </div>
            </div>
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label htmlFor="temperature">Temperature: <span className="font-mono text-blue-600">{temperature}</span></Label>
                </div>
                <Controller
                    control={control}
                    name="model_settings.temperature"
                    render={({ field: { onChange, value } }) => (
                        <Slider
                            id="temperature"
                            min={0}
                            max={1}
                            step={0.1}
                            value={[value]}
                            onValueChange={(vals) => onChange(vals[0])}
                        />
                    )}
                />
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <span>Precise</span>
                    <span>Balanced</span>
                    <span>Creative</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                    <Label htmlFor="max_tokens">Max Tokens</Label>
                    <Input 
                        id="max_tokens" 
                        type="number" 
                        placeholder="Optional" 
                        {...register('model_settings.max_tokens', { valueAsNumber: true })} 
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="top_p">Top P</Label>
                    <Input 
                        id="top_p" 
                        type="number" 
                        step="0.1" 
                        placeholder="Optional" 
                        {...register('model_settings.top_p', { valueAsNumber: true })} 
                    />
                </div>
            </div>
        </div>
    )
}

export default AIModelSettingsForm