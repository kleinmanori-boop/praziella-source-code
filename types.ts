export enum EditorMode {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

export enum ToolType {
  SELECT = 'SELECT',
  BRUSH = 'BRUSH',
  ERASER = 'ERASER',
  HAND = 'HAND',
  AI_ADD = 'AI_ADD',
  SMART_EDIT = 'SMART_EDIT',
  // Video Tools
  VIDEO_GEN = 'VIDEO_GEN',
  VIDEO_TRIM = 'VIDEO_TRIM',
  VIDEO_TEXT = 'VIDEO_TEXT',
  VIDEO_AUDIO = 'VIDEO_AUDIO',
}

export interface AppState {
  mode: EditorMode;
  activeTool: ToolType;
  brushSize: number;
  brushColor: string;
  isProcessing: boolean;
}

export interface VideoGenerationResult {
  uri: string | null;
  loading: boolean;
  progress?: string;
  error?: string;
}

export interface VideoGenerationOptions {
    prompt: string;
    image?: string; // base64
    aspectRatio: '16:9' | '9:16';
}