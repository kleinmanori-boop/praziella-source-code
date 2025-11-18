import React, { useState, useRef, useEffect } from 'react';
import { ToolType, EditorMode, AppState } from './types';
import { CanvasEditor, CanvasEditorRef } from './components/CanvasEditor';
import { VideoEditor } from './components/VideoEditor';
import { AssistantBubble } from './components/AssistantBubble';
import { 
    chatWithAssistant, 
    generateImage, 
    checkApiKey, 
    promptApiKeySelection, 
    editImage,
    generateSpeech,
    LiveSession
} from './services/geminiService';

// Image Tools
const IMAGE_TOOLS = [
  { id: ToolType.SELECT, icon: 'fa-arrow-pointer', label: 'Select' },
  { id: ToolType.BRUSH, icon: 'fa-paintbrush', label: 'Brush' },
  { id: ToolType.ERASER, icon: 'fa-eraser', label: 'Eraser' },
  { id: ToolType.HAND, icon: 'fa-hand', label: 'Pan' },
  { id: ToolType.AI_ADD, icon: 'fa-wand-magic-sparkles', label: 'AI Add' },
  { id: ToolType.SMART_EDIT, icon: 'fa-wand-magic', label: 'Smart Edit' },
];

// Video Tools
const VIDEO_TOOLS = [
    { id: ToolType.VIDEO_GEN, icon: 'fa-film', label: 'Generate' },
    { id: ToolType.VIDEO_TRIM, icon: 'fa-scissors', label: 'Trim' },
    { id: ToolType.VIDEO_TEXT, icon: 'fa-font', label: 'Overlay' },
    { id: ToolType.VIDEO_AUDIO, icon: 'fa-music', label: 'Audio' },
];

const FILTERS = [
    { name: 'None', value: 'none' },
    { name: 'Grayscale', value: 'grayscale(100%)' },
    { name: 'Sepia', value: 'sepia(100%)' },
    { name: 'Invert', value: 'invert(100%)' },
    { name: 'Blur', value: 'blur(5px)' },
    { name: 'Brightness', value: 'brightness(150%)' },
    { name: 'Contrast', value: 'contrast(200%)' },
];

const App: React.FC = () => {
  const canvasRef = useRef<CanvasEditorRef>(null);
  const [state, setState] = useState<AppState>({
    mode: EditorMode.IMAGE,
    activeTool: ToolType.BRUSH,
    brushSize: 10,
    brushColor: '#06b6d4', // cyan-500
    isProcessing: false,
  });

  const [assistantMessage, setAssistantMessage] = useState<string | null>("Welcome to Praziella! Select a tool to begin.");
  const [aiPrompt, setAiPrompt] = useState('');
  const [smartEditPrompt, setSmartEditPrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  
  // Live API State
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Ready");
  const liveSessionRef = useRef<LiveSession | null>(null);

  const handleToolChange = (tool: ToolType) => {
    setState(prev => ({ ...prev, activeTool: tool }));
    setAssistantMessage(`Switched to ${tool.toLowerCase().replace('_', ' ')} tool.`);
  };

  const handleModeChange = (mode: EditorMode) => {
    setState(prev => ({ 
        ...prev, 
        mode, 
        activeTool: mode === EditorMode.IMAGE ? ToolType.BRUSH : ToolType.VIDEO_GEN 
    }));
    setAssistantMessage(mode === EditorMode.VIDEO ? "Video Mode activated. Try Veo!" : "Image Mode activated.");
  };

  const handleAssistantClose = () => setAssistantMessage(null);

  const triggerFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
              window.dispatchEvent(new CustomEvent('praziella-import-image', { detail: { file } }));
              setAssistantMessage("Importing image...");
          }
      };
      input.click();
  };

  const askAssistant = async () => {
      setAssistantMessage("How can I help you with your creation today?");
      const tip = await chatWithAssistant("Give me a very short, one-sentence creative tip for digital art.");
      setAssistantMessage(tip);
  };

  // Toggle Live API
  const toggleLive = async () => {
      if (isLive) {
          liveSessionRef.current?.stop();
          setIsLive(false);
          setLiveStatus("Ready");
          setAssistantMessage("Live voice session ended.");
      } else {
          setAssistantMessage("Connecting to Gemini Live...");
          setIsLive(true);
          liveSessionRef.current = new LiveSession((status) => setLiveStatus(status));
          try {
             const hasKey = await checkApiKey();
             if (!hasKey) await promptApiKeySelection();
             await liveSessionRef.current.start();
          } catch (e) {
              setIsLive(false);
              setAssistantMessage("Failed to connect to Live API.");
          }
      }
  };

  const handleTTS = async () => {
      if (assistantMessage) {
          await generateSpeech(assistantMessage);
      }
  };

  const handleAiAdd = async () => {
      if (!aiPrompt.trim()) return;
      setGeneratingImage(true);
      setAssistantMessage("Dreaming up your image with Imagen 4...");
      
      const hasKey = await checkApiKey();
      if (!hasKey) await promptApiKeySelection();

      const result = await generateImage(aiPrompt);
      if (result) {
          canvasRef.current?.addImage(result);
          setAssistantMessage("Added to canvas! You can now draw over it.");
          setAiPrompt('');
      } else {
          setAssistantMessage("Sorry, I couldn't generate that image.");
      }
      setGeneratingImage(false);
  };

  const handleSmartEdit = async () => {
      if (!smartEditPrompt.trim()) return;
      const canvasData = canvasRef.current?.getCanvasData();
      if (!canvasData) {
          setAssistantMessage("Canvas is empty!");
          return;
      }

      setGeneratingImage(true);
      setAssistantMessage("Applying magic edits with Gemini 2.5...");
      
      const hasKey = await checkApiKey();
      if (!hasKey) await promptApiKeySelection();

      try {
        const result = await editImage(canvasData, smartEditPrompt);
        if (result) {
            canvasRef.current?.addImage(result); // Add edited version on top
            setAssistantMessage("Edit applied!");
            setSmartEditPrompt('');
        } else {
            setAssistantMessage("Could not edit image.");
        }
      } catch(e) {
          setAssistantMessage("Smart edit failed.");
      }
      setGeneratingImage(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="font-bold text-xl tracking-tighter bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Praziella
          </div>
          <div className="h-4 w-px bg-zinc-700 mx-2"></div>
          {/* Undo/Redo */}
          <div className="flex space-x-1">
             <button onClick={() => canvasRef.current?.undo()} className="text-zinc-400 hover:text-white p-2 rounded hover:bg-zinc-800 transition-colors" title="Undo">
                 <i className="fa-solid fa-rotate-left"></i>
             </button>
             <button onClick={() => canvasRef.current?.redo()} className="text-zinc-400 hover:text-white p-2 rounded hover:bg-zinc-800 transition-colors" title="Redo">
                 <i className="fa-solid fa-rotate-right"></i>
             </button>
          </div>
        </div>
        
        <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800">
           <button 
             onClick={() => handleModeChange(EditorMode.IMAGE)}
             className={`px-3 py-1 text-xs rounded-md transition-all ${state.mode === EditorMode.IMAGE ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
           >
             Image
           </button>
           <button 
             onClick={() => handleModeChange(EditorMode.VIDEO)}
             className={`px-3 py-1 text-xs rounded-md transition-all ${state.mode === EditorMode.VIDEO ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
           >
             Video
           </button>
        </div>

        <div className="flex items-center space-x-3">
             <button onClick={triggerFileUpload} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded text-xs border border-zinc-700 transition-all">
                <i className="fa-solid fa-upload mr-2"></i> Import
             </button>
             <button className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded text-xs transition-all shadow-lg shadow-cyan-500/20">
                Export
             </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Tools */}
        <div className="w-16 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4 space-y-4 z-10">
            {(state.mode === EditorMode.IMAGE ? IMAGE_TOOLS : VIDEO_TOOLS).map(tool => (
                <div key={tool.id} className="group relative flex items-center justify-center">
                    <button
                        onClick={() => handleToolChange(tool.id)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                            state.activeTool === tool.id 
                            ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                            : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                        }`}
                    >
                        <i className={`fa-solid ${tool.icon} text-lg`}></i>
                    </button>
                    {/* Tooltip */}
                    <span className="absolute left-14 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none border border-zinc-800 shadow-lg">
                        {tool.label}
                    </span>
                </div>
            ))}

            <div className="flex-1"></div>
            
            {/* Live Voice Button */}
            <div className="relative group">
                <button 
                    onClick={toggleLive}
                    className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${isLive ? 'bg-red-500 animate-pulse text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    title="Live Voice Chat"
                >
                    <i className={`fa-solid ${isLive ? 'fa-microphone-lines' : 'fa-microphone'}`}></i>
                </button>
                {isLive && (
                    <div className="absolute left-14 top-2 bg-zinc-900 border border-zinc-700 text-xs px-2 py-1 rounded text-red-400 whitespace-nowrap">
                        {liveStatus}
                    </div>
                )}
            </div>

            {/* Text Chat Trigger */}
            <button 
                onClick={askAssistant}
                className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform mb-2"
                title="Text Chat"
            >
                <i className="fa-solid fa-robot"></i>
            </button>
        </div>

        {/* Center Canvas/Video Area */}
        <div className="flex-1 bg-zinc-950 relative">
           {state.mode === EditorMode.IMAGE ? (
               <CanvasEditor 
                  ref={canvasRef}
                  activeTool={state.activeTool} 
                  brushSize={state.brushSize}
                  brushColor={state.brushColor}
                  onAssistantMessage={setAssistantMessage}
               />
           ) : (
               <VideoEditor 
                   onAssistantMessage={setAssistantMessage} 
                   activeTool={state.activeTool}
               />
           )}
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-64 bg-zinc-900 border-l border-zinc-800 flex flex-col p-4 z-10 overflow-y-auto">
            <h3 className="text-xs font-bold text-zinc-500 uppercase mb-4 tracking-wider">Properties</h3>
            
            {state.mode === EditorMode.IMAGE && (
                <div className="space-y-6">
                    {/* AI ADD PANEL */}
                    {state.activeTool === ToolType.AI_ADD && (
                         <div className="p-3 bg-zinc-800/50 rounded-lg border border-purple-500/30">
                             <label className="text-xs text-purple-400 mb-2 block font-bold"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> Imagen 4.0</label>
                             <textarea
                                 value={aiPrompt}
                                 onChange={(e) => setAiPrompt(e.target.value)}
                                 placeholder="Describe object to add..."
                                 className="w-full h-20 bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-200 mb-2 focus:outline-none focus:border-purple-500"
                             />
                             <button 
                                 onClick={handleAiAdd}
                                 disabled={generatingImage}
                                 className="w-full bg-purple-600 hover:bg-purple-500 text-white py-1.5 rounded text-xs font-medium transition-colors"
                             >
                                 {generatingImage ? 'Generating...' : 'Generate & Add'}
                             </button>
                         </div>
                    )}

                    {/* SMART EDIT PANEL */}
                    {state.activeTool === ToolType.SMART_EDIT && (
                         <div className="p-3 bg-zinc-800/50 rounded-lg border border-pink-500/30">
                             <label className="text-xs text-pink-400 mb-2 block font-bold"><i className="fa-solid fa-wand-magic mr-1"></i> Smart Edit (Gemini)</label>
                             <textarea
                                 value={smartEditPrompt}
                                 onChange={(e) => setSmartEditPrompt(e.target.value)}
                                 placeholder="E.g. 'Add a retro filter', 'Remove background'"
                                 className="w-full h-20 bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-200 mb-2 focus:outline-none focus:border-pink-500"
                             />
                             <button 
                                 onClick={handleSmartEdit}
                                 disabled={generatingImage}
                                 className="w-full bg-pink-600 hover:bg-pink-500 text-white py-1.5 rounded text-xs font-medium transition-colors"
                             >
                                 {generatingImage ? 'Processing...' : 'Apply Edit'}
                             </button>
                         </div>
                    )}

                    {/* FILTERS */}
                    <div>
                        <label className="text-xs text-zinc-400 mb-2 block">Filters</label>
                        <div className="grid grid-cols-2 gap-2">
                            {FILTERS.map(filter => (
                                <button
                                    key={filter.name}
                                    onClick={() => canvasRef.current?.applyFilter(filter.value)}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded border border-zinc-700 transition-colors"
                                >
                                    {filter.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-400 mb-2 block">Brush Size</label>
                        <div className="flex items-center space-x-2">
                            <input 
                                type="range" 
                                min="1" 
                                max="100" 
                                value={state.brushSize}
                                onChange={(e) => setState(p => ({...p, brushSize: Number(e.target.value)}))}
                                className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <span className="text-xs text-zinc-500 w-6">{state.brushSize}</span>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-400 mb-2 block">Color</label>
                        <div className="flex flex-wrap gap-2">
                            {['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'].map(color => (
                                <button
                                    key={color}
                                    onClick={() => setState(p => ({...p, brushColor: color}))}
                                    className={`w-6 h-6 rounded-full border border-zinc-700 ${state.brushColor === color ? 'ring-2 ring-white scale-110' : ''}`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                            <input 
                              type="color" 
                              value={state.brushColor}
                              onChange={(e) => setState(p => ({...p, brushColor: e.target.value}))}
                              className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            )}

            {state.mode === EditorMode.VIDEO && (
                <div className="text-zinc-500 text-sm italic text-center mt-10">
                   <i className="fa-solid fa-layer-group text-2xl mb-2 opacity-30"></i>
                   <p>Timeline properties vary by tool.</p>
                </div>
            )}
        </div>
      </div>

      {/* Assistant Bubble with TTS */}
      <div className="relative">
          <AssistantBubble message={assistantMessage} onClose={handleAssistantClose} />
          {assistantMessage && (
              <button 
                  onClick={handleTTS}
                  className="fixed bottom-20 left-24 bg-zinc-800 text-zinc-400 hover:text-white p-2 rounded-full z-50 shadow-lg border border-zinc-700 w-8 h-8 flex items-center justify-center"
                  title="Read Aloud"
              >
                  <i className="fa-solid fa-volume-high text-xs"></i>
              </button>
          )}
      </div>
    </div>
  );
};

export default App;