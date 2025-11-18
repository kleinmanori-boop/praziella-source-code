import React, { useState, useRef } from 'react';
import { generateVideo, promptApiKeySelection, checkApiKey } from '../services/geminiService';
import { ToolType, VideoGenerationOptions } from '../types';

interface VideoEditorProps {
  onAssistantMessage: (msg: string) => void;
  activeTool?: ToolType;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ onAssistantMessage, activeTool }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [loading, setLoading] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => setUploadedImage(evt.target?.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStatus('Checking API Key...');

    try {
      const hasKey = await checkApiKey();
      if (!hasKey) {
        setStatus('Waiting for API Key selection...');
        onAssistantMessage("I need you to select an API Key for Veo.");
        await promptApiKeySelection();
      }

      setStatus('Initializing Veo 3.1...');
      onAssistantMessage("Sending your idea to the Veo model...");
      
      const options: VideoGenerationOptions = {
          prompt: prompt || (uploadedImage ? "Animate this image" : "Abstract video"),
          image: uploadedImage || undefined,
          aspectRatio: aspectRatio
      };

      const uri = await generateVideo(options);
      if (uri) {
        setVideoUri(uri);
        setStatus('Complete!');
        onAssistantMessage("Video generated! Check it out.");
      } else {
        setStatus('Failed to generate.');
        onAssistantMessage("Something went wrong generating the video.");
      }
    } catch (e: any) {
      console.error(e);
      let errorMsg = "Generation failed.";
      if (e.message?.includes("Requested entity was not found")) {
          errorMsg = "API Key invalid or not found. Please try again.";
          await promptApiKeySelection();
      }
      setStatus(errorMsg);
      onAssistantMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const renderToolInterface = () => {
      if (activeTool === ToolType.VIDEO_TRIM) {
          return (
              <div className="p-6 bg-zinc-900 text-center text-zinc-500 border-t border-zinc-800 h-48 flex flex-col items-center justify-center">
                  <i className="fa-solid fa-scissors text-3xl mb-2"></i>
                  <p>Trim Tool Active</p>
              </div>
          );
      }
      
      // Default GEN Interface
      return (
        <div className="h-auto p-6 bg-zinc-900 border-t border-zinc-800">
            <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase">Video Settings</label>
                <div className="flex space-x-2">
                    <button onClick={() => setAspectRatio('16:9')} className={`text-xs px-2 py-1 rounded border ${aspectRatio === '16:9' ? 'bg-cyan-900 border-cyan-500 text-cyan-100' : 'border-zinc-700 text-zinc-500'}`}>16:9</button>
                    <button onClick={() => setAspectRatio('9:16')} className={`text-xs px-2 py-1 rounded border ${aspectRatio === '9:16' ? 'bg-cyan-900 border-cyan-500 text-cyan-100' : 'border-zinc-700 text-zinc-500'}`}>9:16</button>
                </div>
            </div>
            
            <div className="flex gap-4 items-start">
                <div className="flex-1 space-y-3">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe video..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none h-24"
                        disabled={loading}
                    />
                </div>
                
                <div className="w-32 flex flex-col gap-2">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="h-16 bg-zinc-800 border border-dashed border-zinc-600 rounded flex items-center justify-center cursor-pointer hover:bg-zinc-750 overflow-hidden relative"
                        title="Upload Image to Animate"
                    >
                        {uploadedImage ? (
                            <img src={uploadedImage} alt="ref" className="w-full h-full object-cover opacity-80" />
                        ) : (
                            <div className="text-zinc-500 text-xs text-center">
                                <i className="fa-solid fa-image mb-1"></i><br/>+ Img
                            </div>
                        )}
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </div>
                    {uploadedImage && (
                        <button onClick={() => setUploadedImage(null)} className="text-xs text-red-400 hover:text-red-300">Clear Image</button>
                    )}
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className={`h-24 w-24 rounded-lg font-bold uppercase tracking-wide transition-all flex flex-col items-center justify-center ${
                        loading 
                        ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' 
                        : 'bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                    }`}
                >
                    {loading ? <i className="fa-solid fa-spinner fa-spin text-2xl"></i> : <><i className="fa-solid fa-film text-2xl mb-2"></i>GO</>}
                </button>
            </div>
            <div className="mt-2 text-xs text-zinc-500 flex justify-between">
                <span>Model: Veo 3.1 Fast Preview</span>
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="hover:text-cyan-500 underline">Billing Info</a>
            </div>
        </div>
      );
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-900">
      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center bg-zinc-950 relative overflow-hidden">
        {videoUri ? (
          <video 
            src={videoUri} 
            controls 
            autoPlay 
            loop 
            className="max-h-full max-w-full shadow-2xl"
          />
        ) : (
          <div className="text-zinc-600 flex flex-col items-center animate-pulse">
             <i className="fa-solid fa-film text-6xl mb-4 opacity-50"></i>
             <p className="text-lg font-light">Veo Video Preview</p>
             {loading && (
                 <div className="mt-4 flex flex-col items-center text-cyan-500">
                     <i className="fa-solid fa-circle-notch fa-spin text-2xl"></i>
                     <p className="text-sm mt-2">{status}</p>
                 </div>
             )}
          </div>
        )}
      </div>

      {/* Controls based on tool */}
      {renderToolInterface()}
    </div>
  );
};