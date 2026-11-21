

import { NodeDefinition } from "./nodes";

export const VOICESYNTHESIS_NODE_DEFINITIONS: NodeDefinition[] = [
  // SECTION: Voice Synthesis
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'voice-synthesis',
    description: 'High-quality text-to-speech voice synthesis',
    icon: 'mic',
    inputs: [
      {
        id: 'text',
        name: 'Text',
        type: 'string'
      }
    ],
    outputs: [
      {
        id: 'audio',
        name: 'Audio',
        type: 'audio'
      }
    ],
    settings: [
      {
        id: 'voice',
        name: 'Voice',
        type: 'select',
        options: [
          { label: 'Rachel', value: 'rachel' },
          { label: 'Drew', value: 'drew' },
          { label: 'Clyde', value: 'clyde' },
          { label: 'Bella', value: 'bella' },
          { label: 'Antoni', value: 'antoni' },
          { label: 'Elli', value: 'elli' }
        ],
        default: 'rachel'
      },
      {
        id: 'stability',
        name: 'Stability',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5
      },
      {
        id: 'clarity',
        name: 'Clarity',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.75
      },
      {
        id: 'style',
        name: 'Style',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.3,
        description: 'Higher values enhance the voice\'s style'
      }
    ],
    tags: ['audio', 'voice', 'tts', 'speech'],
    version: '1.0.0',
    author: 'ElevenLabs'
  },
  {
    id: 'openai-tts',
    name: 'OpenAI TTS',
    category: 'voice-synthesis',
    description: 'OpenAI\'s text-to-speech system',
    icon: 'volume',
    inputs: [
      {
        id: 'text',
        name: 'Text',
        type: 'string'
      }
    ],
    outputs: [
      {
        id: 'audio',
        name: 'Audio',
        type: 'audio'
      }
    ],
    settings: [
      {
        id: 'voice',
        name: 'Voice',
        type: 'select',
        options: [
          { label: 'Alloy', value: 'alloy' },
          { label: 'Echo', value: 'echo' },
          { label: 'Fable', value: 'fable' },
          { label: 'Onyx', value: 'onyx' },
          { label: 'Nova', value: 'nova' },
          { label: 'Shimmer', value: 'shimmer' }
        ],
        default: 'alloy'
      },
      {
        id: 'model',
        name: 'Model',
        type: 'select',
        options: [
          { label: 'TTS-1', value: 'tts-1' },
          { label: 'TTS-1-HD', value: 'tts-1-hd' }
        ],
        default: 'tts-1-hd'
      },
      {
        id: 'speed',
        name: 'Speed',
        type: 'range',
        min: 0.5,
        max: 1.5,
        step: 0.1,
        default: 1.0
      }
    ],
    tags: ['audio', 'voice', 'tts', 'speech', 'openai'],
    version: '1.0.0',
    author: 'OpenAI'
  },
  {
    id: 'fagoon-tts',
    name: 'Spirit Monkey TTS',
    category: 'voice-synthesis',
    description: 'Spirit Monkey text-to-speech',
    icon: 'volume',
    inputs: [
      {
        id: 'text',
        name: 'Text',
        type: 'string'
      }
    ],
    outputs: [
      {
        id: 'audio',
        name: 'Audio',
        type: 'audio'
      }
    ],
    settings: [
      // {
      //   id: 'voice',
      //   name: 'Voice',
      //   type: 'select',
      //   options: [
      //     { label: 'Alloy', value: 'alloy' },
      //     { label: 'Echo', value: 'echo' },
      //     { label: 'Fable', value: 'fable' },
      //     { label: 'Onyx', value: 'onyx' },
      //     { label: 'Nova', value: 'nova' },
      //     { label: 'Shimmer', value: 'shimmer' }
      //   ],
      //   default: 'alloy'
      // },
      // {
      //   id: 'model',
      //   name: 'Model',
      //   type: 'select',
      //   options: [
      //     { label: 'TTS-1', value: 'tts-1' },
      //     { label: 'TTS-1-HD', value: 'tts-1-hd' }
      //   ],
      //   default: 'tts-1-hd'
      // },
      // {
      //   id: 'speed',
      //   name: 'Speed',
      //   type: 'range',
      //   min: 0.5,
      //   max: 1.5,
      //   step: 0.1,
      //   default: 1.0
      // }
    ],
    tags: ['audio', 'voice', 'tts', 'speech', 'fagoon'],
    version: '1.0.0',
    author: 'Spirit Monkey'
  },
  {
    id: 'audio-to-text',
    name: 'Audio Transcription',
    category: 'voice-synthesis',
    description: 'Transcribe audio to text',
    icon: 'file-audio',
    inputs: [
      {
        id: 'audio',
        name: 'Audio',
        type: 'audio'
      }
    ],
    outputs: [
      {
        id: 'text',
        name: 'Transcribed Text',
        type: 'string'
      }
    ],
    settings: [
      {
        id: 'language',
        name: 'Language',
        type: 'select',
        options: [
          { label: 'English', value: 'en' },
          { label: 'Spanish', value: 'es' },
          { label: 'French', value: 'fr' },
          { label: 'German', value: 'de' },
          { label: 'Japanese', value: 'ja' },
          { label: 'Auto-detect', value: 'auto' }
        ],
        default: 'auto'
      },
      {
        id: 'model',
        name: 'Model',
        type: 'select',
        options: [
          { label: 'Whisper', value: 'whisper' },
          { label: 'AssemblyAI', value: 'assemblyai' }
        ],
        default: 'whisper'
      }
    ],
    tags: ['audio', 'transcription', 'speech-to-text', 'stt'],
    version: '1.0.0'
  },
]