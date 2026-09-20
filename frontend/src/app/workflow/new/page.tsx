"use client";

import React, { useState, useEffect } from 'react';
import { NextPage } from 'next';
import { useTheme } from 'next-themes';

// Types based on the API schema
interface LLMConfig {
  model_type: string;
  stream: boolean;
  temperature: number;
  max_token: number;
  api_key?: string;
  model_name: string;
}

interface TTSConfig {
  model_type: string;
  temperature: number;
  api_key?: string;
  model_name: string;
}

interface DiffusionModelConfig {
  api_key?: string;
  model_type: string;
  model_name: string;
}

interface ChatResponse {
  status: string;
  data: {
    response: string;
  };
}

type UserType = 'general' | 'pro' | 'premium';

// Component for the Fagoon Agents page
const FagoonAgentsPage: NextPage = () => {
  // API base URL
  const API_BASE_URL = '/agent-workflow';
  
  // Theme handling
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // State for user inputs
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [userType, setUserType] = useState<UserType>('general');
  const [selectedService, setSelectedService] = useState<'chat' | 'tts' | 'image'>('chat');
  
  // State for model configurations
  const [chatModel, setChatModel] = useState('gpt-3.5-turbo');
  const [ttsModel, setTtsModel] = useState('speecht5_tts');
  const [imageModel, setImageModel] = useState('stable-diffusion-v1-5');
  const [modelType, setModelType] = useState<'openai' | 'hugging_face'>('openai');
  
  // State for responses
  const [chatResponse, setChatResponse] = useState('');
  const [ttsAudioUrl, setTtsAudioUrl] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle theme mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Function to handle chat completion
  const handleChatCompletion = async () => {
    setIsLoading(true);
    setError('');
    setChatResponse('');
    
    try {
      const llmConfig: LLMConfig = {
        model_type: modelType,
        stream: false,
        temperature: 0.7,
        max_token: 1000,
        model_name: chatModel,
      };
      
      // Only include API key for general users
      if (userType === 'general' && apiKey) {
        llmConfig.api_key = apiKey;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_prompt: prompt,
          user_type: userType,
          llm_config: llmConfig,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data: ChatResponse = await response.json();
      setChatResponse(data.data.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle text-to-speech
  const handleTextToSpeech = async () => {
    setIsLoading(true);
    setError('');
    setTtsAudioUrl('');
    
    try {
      const ttsConfig: TTSConfig = {
        model_type: 'hugging_face',
        temperature: 0.1,
        model_name: ttsModel,
      };
      
      // Only include API key for general users
      if (userType === 'general' && apiKey) {
        ttsConfig.api_key = apiKey;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/v1/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_prompt: prompt,
          user_type: userType,
          tts_config: ttsConfig,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const audioData = await response.json();
      setTtsAudioUrl(audioData); // Assuming the API returns a URL or base64 audio data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle image generation
  const handleImageGeneration = async () => {
    setIsLoading(true);
    setError('');
    setGeneratedImageUrl('');
    
    try {
      const diffusionConfig: DiffusionModelConfig = {
        model_type: 'hugging_face',
        model_name: imageModel,
      };
      
      // Only include API key for general users
      if (userType === 'general' && apiKey) {
        diffusionConfig.api_key = apiKey;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_prompt: prompt,
          user_type: userType,
          diffusion_model_config: diffusionConfig,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const imageData = await response.json();
      setGeneratedImageUrl(imageData); // Assuming the API returns a URL or base64 image data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt) {
      setError('Please enter a prompt');
      return;
    }
    
    // Only validate API key for general users
    if (userType === 'general' && !apiKey) {
      setError('Please enter an API key');
      return;
    }
    
    switch (selectedService) {
      case 'chat':
        handleChatCompletion();
        break;
      case 'tts':
        handleTextToSpeech();
        break;
      case 'image':
        handleImageGeneration();
        break;
      default:
        break;
    }
  };

  // If the component hasn't mounted yet, don't render to avoid theme flickering
  if (!mounted) return null;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Fagoon Agents Workflow</h1>
      
      {/* User Type Selection */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">User Type</h2>
        <div className="flex space-x-4">
          <button
            type="button"
            className={`px-4 py-2 rounded ${userType === 'general' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
            onClick={() => setUserType('general')}
          >
            General
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded ${userType === 'pro' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
            onClick={() => setUserType('pro')}
          >
            Pro
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded ${userType === 'premium' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
            onClick={() => setUserType('premium')}
          >
            Premium
          </button>
        </div>
      </div>
      
      {/* Service Selection */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Service</h2>
        <div className="flex space-x-4">
          <button
            type="button"
            className={`px-4 py-2 rounded ${selectedService === 'chat' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
            onClick={() => setSelectedService('chat')}
          >
            Chat Completion
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded ${selectedService === 'tts' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
            onClick={() => setSelectedService('tts')}
          >
            Text-to-Speech
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded ${selectedService === 'image' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
            onClick={() => setSelectedService('image')}
          >
            Image Generation
          </button>
        </div>
      </div>
      
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg mb-6">
        <div className="mb-4">
          <label htmlFor="prompt" className="block text-sm font-medium mb-2 dark:text-gray-200">
            Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
            rows={4}
            placeholder="Enter your prompt here..."
          />
        </div>
        
        {/* API Key - Only show for general users */}
        {userType === 'general' && (
          <div className="mb-4">
            <label htmlFor="apiKey" className="block text-sm font-medium mb-2 dark:text-gray-200">
              API Key
            </label>
            <input
              type="password"
              autoComplete="new-password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
              placeholder="Enter your API key"
            />
          </div>
        )}
        
        {/* Model Configuration */}
        {selectedService === 'chat' && (
          <div className="mb-4">
            <label htmlFor="chatModel" className="block text-sm font-medium mb-2 dark:text-gray-200">
              Chat Model
            </label>
            <div className="flex space-x-4 mb-2">
              <button
                type="button"
                className={`px-4 py-2 rounded ${modelType === 'openai' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
                onClick={() => setModelType('openai')}
              >
                OpenAI
              </button>
              <button
                type="button"
                className={`px-4 py-2 rounded ${modelType === 'hugging_face' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
                onClick={() => setModelType('hugging_face')}
              >
                Hugging Face
              </button>
            </div>
            <input
              type="text"
              id="chatModel"
              value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
              placeholder="Enter model name"
            />
          </div>
        )}
        
        {selectedService === 'tts' && (
          <div className="mb-4">
            <label htmlFor="ttsModel" className="block text-sm font-medium mb-2 dark:text-gray-200">
              TTS Model
            </label>
            <input
              type="text"
              id="ttsModel"
              value={ttsModel}
              onChange={(e) => setTtsModel(e.target.value)}
              className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
              placeholder="Enter TTS model name"
            />
          </div>
        )}
        
        {selectedService === 'image' && (
          <div className="mb-4">
            <label htmlFor="imageModel" className="block text-sm font-medium mb-2 dark:text-gray-200">
              Image Model
            </label>
            <input
              type="text"
              id="imageModel"
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
              className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
              placeholder="Enter image model name"
            />
          </div>
        )}
        
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-blue-400"
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : 'Submit'}
        </button>
      </form>
      
      {/* User Type Information */}
      <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900 dark:text-blue-100">
        <p className="text-sm">
          {userType === 'general' 
            ? "General users require an API key for all services."
            : `${userType === 'pro' ? 'Pro' : 'Premium'} users don't need to provide an API key.`}
        </p>
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      
      {/* Results */}
      {selectedService === 'chat' && chatResponse && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6 dark:text-gray-200">
          <h2 className="text-xl font-semibold mb-4">Chat Response</h2>
          <div className="whitespace-pre-wrap">{chatResponse}</div>
        </div>
      )}
      
      {selectedService === 'tts' && ttsAudioUrl && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4 dark:text-gray-200">Audio Result</h2>
          <audio controls src={ttsAudioUrl} className="w-full">
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
      
      {selectedService === 'image' && generatedImageUrl && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4 dark:text-gray-200">Generated Image</h2>
          <img 
            src={generatedImageUrl} 
            alt="Generated from prompt" 
            className="w-full rounded"
          />
        </div>
      )}
    </div>
  );
};

export default FagoonAgentsPage;