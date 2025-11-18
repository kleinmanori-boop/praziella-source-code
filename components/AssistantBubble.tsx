import React, { useState, useEffect } from 'react';

interface AssistantBubbleProps {
  message: string | null;
  onClose: () => void;
}

export const AssistantBubble: React.FC<AssistantBubbleProps> = ({ message, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      // Auto-hide after 8 seconds if not interaction
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300); // Allow animation to finish
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message && !visible) return null;

  return (
    <div
      className={`fixed bottom-6 left-20 z-50 max-w-xs transition-all duration-500 transform ${
        visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
      }`}
    >
      <div className="flex items-end space-x-2">
        <div className="bg-cyan-500 w-10 h-10 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0 border-2 border-cyan-400">
            <i className="fa-solid fa-sparkles text-white animate-pulse"></i>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 text-zinc-200 p-3 rounded-2xl rounded-bl-none shadow-xl relative">
          <p className="text-sm leading-relaxed font-medium">{message}</p>
          <button 
            onClick={() => setVisible(false)}
            className="absolute -top-2 -right-2 bg-zinc-700 text-zinc-400 hover:text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    </div>
  );
};
