
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextItem {
  text: string;
  box: BoundingBox;
  fontSize: number;
  fontName: string;
}

export interface PageContent {
  pageNumber: number;
  blocks: TextBlock[];
  rawText: string;
}

export interface TextBlock {
  type: 'paragraph' | 'heading' | 'list' | 'table' | 'sidebar' | 'math' | 'chart-desc';
  content: string;
  order: number;
  confidence: number;
}

export interface TTSState {
  isPlaying: boolean;
  currentPage: number;
  currentBlockIndex: number;
  speed: number;
  pitch: number;
  voice: string;
  volume: number;
}

export interface DocumentData {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'text';
  pages: PageContent[];
  totalBlocks: number;
}
