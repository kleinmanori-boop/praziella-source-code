import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { ToolType } from '../types';

interface CanvasEditorProps {
  activeTool: ToolType;
  brushSize: number;
  brushColor: string;
  onAssistantMessage: (msg: string) => void;
}

export interface CanvasEditorRef {
    undo: () => void;
    redo: () => void;
    applyFilter: (filter: string) => void;
    addImage: (dataUrl: string) => void;
    getCanvasData: () => string | null;
}

export const CanvasEditor = forwardRef<CanvasEditorRef, CanvasEditorProps>(({
  activeTool,
  brushSize,
  brushColor,
  onAssistantMessage,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  
  // History Management
  const historyStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const MAX_HISTORY = 20;

  const saveState = useCallback(() => {
      if (!context || !canvasRef.current) return;
      const data = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Push to history
      historyStack.current.push(data);
      if (historyStack.current.length > MAX_HISTORY) {
          historyStack.current.shift();
      }
      // Clear redo stack on new action
      redoStack.current = [];
  }, [context]);

  useImperativeHandle(ref, () => ({
      undo: () => {
          if (historyStack.current.length === 0 || !context || !canvasRef.current) return;
          
          // Save current state to redo stack before undoing
          const currentData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          redoStack.current.push(currentData);

          // Restore previous state
          const previousData = historyStack.current.pop();
          if (previousData) {
              context.putImageData(previousData, 0, 0);
              onAssistantMessage("Undid last action.");
          }
      },
      redo: () => {
          if (redoStack.current.length === 0 || !context || !canvasRef.current) return;

          // Save current to history
          const currentData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          historyStack.current.push(currentData);

          const nextData = redoStack.current.pop();
          if (nextData) {
              context.putImageData(nextData, 0, 0);
              onAssistantMessage("Redid action.");
          }
      },
      applyFilter: (filter: string) => {
          if (!context || !canvasRef.current) return;
          saveState();
          
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvasRef.current.width;
          tempCanvas.height = canvasRef.current.height;
          const tCtx = tempCanvas.getContext('2d');
          
          if (tCtx) {
              tCtx.drawImage(canvasRef.current, 0, 0);
              context.filter = filter;
              context.drawImage(tempCanvas, 0, 0);
              context.filter = 'none';
              onAssistantMessage("Filter applied!");
          }
      },
      addImage: (dataUrl: string) => {
          if (!context || !canvasRef.current) return;
          saveState();

          const img = new Image();
          img.onload = () => {
              // Draw centered, max 50% of canvas size usually good for "added" items
              const scale = Math.min((canvasRef.current!.width * 0.5) / img.width, (canvasRef.current!.height * 0.5) / img.height);
              const w = img.width * scale;
              const h = img.height * scale;
              const x = (canvasRef.current!.width - w) / 2;
              const y = (canvasRef.current!.height - h) / 2;
              
              context.drawImage(img, x, y, w, h);
              onAssistantMessage("Element added to canvas.");
          };
          img.src = dataUrl;
      },
      getCanvasData: () => {
          return canvasRef.current ? canvasRef.current.toDataURL('image/png') : null;
      }
  }));

  // Initialize Canvas
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        setContext(ctx);
        
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Initial save
        saveState();
      }
    }
    
    const handleResize = () => {
        if (canvasRef.current && context) {
            const currentData = context.getImageData(0,0, canvasRef.current.width, canvasRef.current.height);
            
            canvasRef.current.width = canvasRef.current.offsetWidth;
            canvasRef.current.height = canvasRef.current.offsetHeight;
            
            // Restore content (simple, uncached resize)
            context.putImageData(currentData, 0, 0);
        }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle File Input Import
  useEffect(() => {
      const handleImport = (e: CustomEvent<{file: File}>) => {
          const reader = new FileReader();
          reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                  if (context && canvasRef.current) {
                      saveState(); // Save before import
                      
                      // Center image logic
                      const aspect = img.width / img.height;
                      let drawWidth = canvasRef.current.width;
                      let drawHeight = drawWidth / aspect;

                      if (drawHeight > canvasRef.current.height) {
                          drawHeight = canvasRef.current.height;
                          drawWidth = drawHeight * aspect;
                      }

                      const x = (canvasRef.current.width - drawWidth) / 2;
                      const y = (canvasRef.current.height - drawHeight) / 2;

                      context.fillStyle = '#ffffff';
                      context.fillRect(0,0, canvasRef.current.width, canvasRef.current.height);
                      context.drawImage(img, x, y, drawWidth, drawHeight);
                      
                      onAssistantMessage("Image loaded! Ready to edit.");
                  }
              };
              if (event.target?.result) {
                 img.src = event.target.result as string;
              }
          };
          reader.readAsDataURL(e.detail.file);
      };

      window.addEventListener('praziella-import-image', handleImport as EventListener);
      return () => window.removeEventListener('praziella-import-image', handleImport as EventListener);
  }, [context, onAssistantMessage, saveState]);


  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!context) return;
    if (activeTool === ToolType.SELECT || activeTool === ToolType.HAND || activeTool === ToolType.AI_ADD || activeTool === ToolType.SMART_EDIT) return;

    saveState(); // Save state before stroke begins
    context.beginPath();
    context.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setIsDrawing(true);
  }, [context, activeTool, saveState]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) return;
    if (activeTool === ToolType.SELECT || activeTool === ToolType.HAND || activeTool === ToolType.AI_ADD || activeTool === ToolType.SMART_EDIT) return;

    context.strokeStyle = activeTool === ToolType.ERASER ? '#ffffff' : brushColor;
    context.lineWidth = brushSize;
    
    if (activeTool === ToolType.ERASER) {
         context.strokeStyle = '#ffffff';
    } else {
         context.globalCompositeOperation = 'source-over';
    }

    context.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    context.stroke();
  }, [isDrawing, context, brushSize, brushColor, activeTool]);

  const stopDrawing = useCallback(() => {
    if (!context || !isDrawing) return;
    context.closePath();
    setIsDrawing(false);
  }, [context, isDrawing]);

  return (
    <div className="relative w-full h-full bg-zinc-800 overflow-hidden flex items-center justify-center shadow-inner">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        className={`bg-white shadow-2xl cursor-crosshair ${activeTool === ToolType.HAND ? 'cursor-grab' : ''} ${activeTool === ToolType.AI_ADD ? 'cursor-copy' : ''} ${activeTool === ToolType.SMART_EDIT ? 'cursor-help' : ''}`}
        style={{ width: '100%', height: '100%' }}
      />
      {!context && (
          <div className="absolute pointer-events-none text-zinc-500 flex flex-col items-center">
              <i className="fa-regular fa-image text-4xl mb-2"></i>
              <span>Canvas Initializing...</span>
          </div>
      )}
    </div>
  );
});
CanvasEditor.displayName = 'CanvasEditor';