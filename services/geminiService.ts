import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { VideoGenerationOptions } from "../types";

export const checkApiKey = async (): Promise<boolean> => {
  const win = window as any;
  if (win.aistudio) {
    return await win.aistudio.hasSelectedApiKey();
  }
  return true;
};

export const promptApiKeySelection = async (): Promise<void> => {
  const win = window as any;
  if (win.aistudio) {
    await win.aistudio.openSelectKey();
  }
};

// --- Veo Video Generation ---
export const generateVideo = async (options: VideoGenerationOptions): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const { prompt, image, aspectRatio } = options;
    
    let requestConfig: any = {
        numberOfVideos: 1,
        resolution: '720p', // 720p is standard for preview
        aspectRatio: aspectRatio
    };

    let requestParams: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: requestConfig
    };

    // If image is provided, attach it (Animate Image)
    if (image) {
        const mimeType = image.substring(image.indexOf(':') + 1, image.indexOf(';'));
        const data = image.substring(image.indexOf(',') + 1);
        requestParams.image = {
            imageBytes: data,
            mimeType: mimeType
        };
    }

    let operation = await ai.models.generateVideos(requestParams);

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    if (downloadLink) {
      return `${downloadLink}&key=${process.env.API_KEY}`;
    }
    return null;

  } catch (error) {
    console.error("Veo generation error:", error);
    throw error;
  }
};

// --- Imagen Image Generation ---
export const generateImage = async (prompt: string): Promise<string | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: '1:1',
                outputMimeType: 'image/jpeg',
            },
        });

        const base64 = response.generatedImages?.[0]?.image?.imageBytes;
        if (base64) {
            return `data:image/jpeg;base64,${base64}`;
        }
        return null;
    } catch (error) {
        console.error("Image generation error:", error);
        return null;
    }
};

// --- Smart Edit (Gemini 2.5 Flash Image) ---
export const editImage = async (imageBase64: string, prompt: string): Promise<string | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const mimeType = imageBase64.substring(imageBase64.indexOf(':') + 1, imageBase64.indexOf(';'));
        const data = imageBase64.substring(imageBase64.indexOf(',') + 1);

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: data,
                            mimeType: mimeType
                        }
                    },
                    { text: prompt }
                ]
            },
            config: {
                responseModalities: [Modality.IMAGE]
            }
        });

        // Extract image from parts
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (error) {
        console.error("Smart edit error:", error);
        throw error;
    }
};

// --- Chat (Gemini 3 Pro) ---
export const chatWithAssistant = async (message: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: message,
      config: {
        systemInstruction: "You are Praziella, a helpful, witty, and concise creative AI assistant. Keep responses short (under 2 sentences) and helpful.",
      }
    });
    return response.text || "I'm having trouble thinking right now.";
  } catch (error) {
    console.error("Assistant error:", error);
    return "Connection error. Please check your settings.";
  }
};

// --- TTS (Gemini 2.5 Flash TTS) ---
export const generateSpeech = async (text: string): Promise<void> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.start();
        }
    } catch (e) {
        console.error("TTS Error", e);
    }
}

// --- Live API (Conversational) ---
export class LiveSession {
    private ws: any = null;
    private audioContext: AudioContext | null = null;
    private inputSource: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private nextStartTime = 0;
    private active = false;

    constructor(private onStatusChange: (status: string) => void) {}

    async start() {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        
        // Output Context (for higher quality playback)
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outputNode = outputAudioContext.createGain();
        outputNode.connect(outputAudioContext.destination);

        this.onStatusChange("Connecting...");

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    this.onStatusChange("Live");
                    this.active = true;
                    
                    // Setup Input Streaming
                    if (!this.audioContext) return;
                    this.inputSource = this.audioContext.createMediaStreamSource(stream);
                    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
                    
                    this.processor.onaudioprocess = (e) => {
                        if(!this.active) return;
                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcmBlob = this.createBlob(inputData);
                        sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                    };

                    this.inputSource.connect(this.processor);
                    this.processor.connect(this.audioContext.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                    // Handle Audio Output
                    const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio) {
                        this.nextStartTime = Math.max(this.nextStartTime, outputAudioContext.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext);
                        const source = outputAudioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputNode);
                        source.start(this.nextStartTime);
                        this.nextStartTime += audioBuffer.duration;
                    }
                    
                    if (msg.serverContent?.interrupted) {
                        this.nextStartTime = 0;
                    }
                },
                onclose: () => {
                    this.onStatusChange("Disconnected");
                    this.stop();
                },
                onerror: (err) => {
                    console.error(err);
                    this.onStatusChange("Error");
                    this.stop();
                }
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                },
                systemInstruction: "You are Praziella, a creative AI companion. Be brief, friendly, and encouraging."
            }
        });
        
        // Ensure session is initiated
        await sessionPromise;
    }

    stop() {
        this.active = false;
        if (this.inputSource) this.inputSource.disconnect();
        if (this.processor) this.processor.disconnect();
        if (this.audioContext) this.audioContext.close();
        // Note: session.close() isn't strictly available on the promise wrapper in this pattern 
        // but disconnecting audio stops the flow.
    }

    private createBlob(data: Float32Array) {
        const l = data.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            int16[i] = data[i] * 32768;
        }
        return {
            data: encode(new Uint8Array(int16.buffer)),
            mimeType: 'audio/pcm;rate=16000',
        };
    }
}

// --- Audio Helpers ---

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    // Assuming Mono 1 channel for simplification or checking numChannels
    const numChannels = 1; 
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, 24000); // 24kHz usually for response

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}
