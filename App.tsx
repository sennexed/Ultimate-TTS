
import React, { useState, useEffect, useRef } from 'react';
import { parsePdf, renderPageToCanvas } from './services/pdfService';
import { performOCR } from './services/ocrService';
import { processRawLayout, generateSpeech, decodeAudioData } from './services/geminiService';
import { DocumentData, PageContent, TTSState } from './types';
import Visualizer from './components/Visualizer';

const App: React.FC = () => {
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [ttsState, setTtsState] = useState<TTSState>({
    isPlaying: false,
    currentPage: 0,
    currentBlockIndex: 0,
    speed: 1.0,
    pitch: 1.0,
    voice: 'Kore',
    volume: 1.0
  });

  const [currentText, setCurrentText] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isPlayingRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = ttsState.isPlaying;
  }, [ttsState.isPlaying]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessingStatus("Identifying document...");
    
    try {
      let pages: PageContent[] = [];

      if (file.type === 'application/pdf') {
        setProcessingStatus("Decoding PDF structure...");
        pages = await parsePdf(file);
        
        const totalText = pages.reduce((acc, p) => acc + p.rawText.length, 0);
        if (totalText < 100 && pages.length > 0) {
          setProcessingStatus("Image-based PDF detected. Initializing OCR...");
          const image = await renderPageToCanvas(file, 1, 3.0);
          const ocrText = await performOCR(image);
          pages[0].rawText = ocrText;
        }
      } else if (file.type.startsWith('image/')) {
        setProcessingStatus("Performing OCR...");
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((res) => {
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(file);
        });
        const ocrText = await performOCR(dataUrl);
        pages = [{ pageNumber: 1, blocks: [], rawText: ocrText }];
      } else if (file.type === 'text/plain') {
        setProcessingStatus("Processing text...");
        const text = await file.text();
        pages = [{ pageNumber: 1, blocks: [], rawText: text }];
      } else {
        throw new Error("Format not supported. Please use PDF, JPG, PNG, or TXT.");
      }

      if (pages.length > 0) {
        setProcessingStatus("Optimizing layout for audio...");
        const cleaned = await processRawLayout(pages[0].rawText);
        pages[0].blocks = [{ type: 'paragraph', content: cleaned, order: 0, confidence: 1.0 }];

        setDoc({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type.includes('pdf') ? 'pdf' : (file.type.includes('image') ? 'image' : 'text'),
          pages: pages,
          totalBlocks: pages.length
        });
      }
    } catch (err: any) {
      alert(err.message || "An error occurred during processing.");
      console.error(err);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const stopPlayback = () => {
    setTtsState(prev => ({ ...prev, isPlaying: false }));
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const playTTS = async () => {
    if (!doc) return;
    if (ttsState.isPlaying) { stopPlayback(); return; }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    } else if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    
    setTtsState(prev => ({ ...prev, isPlaying: true }));
    readLoop();
  };

  const readLoop = async () => {
    if (!doc || !audioContextRef.current) return;

    let pIdx = ttsState.currentPage;
    let bIdx = ttsState.currentBlockIndex;

    while (pIdx < doc.pages.length) {
      const page = doc.pages[pIdx];
      
      if (!page.blocks || page.blocks.length === 0) {
         setProcessingStatus(`Analyzing Page ${pIdx + 1}...`);
         const cleaned = await processRawLayout(page.rawText);
         page.blocks = [{ type: 'paragraph', content: cleaned, order: 0, confidence: 1.0 }];
         setProcessingStatus("");
      }

      while (bIdx < (page.blocks?.length || 0)) {
        if (!isPlayingRef.current) return;
        
        const block = page.blocks[bIdx];
        setCurrentText(block.content);
        setTtsState(prev => ({ ...prev, currentPage: pIdx, currentBlockIndex: bIdx }));

        try {
          const audioBytes = await generateSpeech(block.content, ttsState.voice);
          const audioBuffer = await decodeAudioData(audioBytes, audioContextRef.current);
          
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.playbackRate.value = ttsState.speed;

          const now = audioContextRef.current.currentTime;
          const startTime = Math.max(nextStartTimeRef.current, now);
          
          source.start(startTime);
          nextStartTimeRef.current = startTime + (audioBuffer.duration / ttsState.speed);
          
          activeSourcesRef.current.add(source);
          source.onended = () => activeSourcesRef.current.delete(source);

          const waitTime = (startTime - now) * 1000 + ((audioBuffer.duration / ttsState.speed) * 1000) - 150;
          await new Promise(r => setTimeout(r, Math.max(0, waitTime)));
        } catch (e) {
          console.error("Audio block failed", e);
        }
        bIdx++;
      }
      pIdx++;
      bIdx = 0;
    }
    setTtsState(prev => ({ ...prev, isPlaying: false, currentPage: 0, currentBlockIndex: 0 }));
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-white flex flex-col font-sans selection:bg-indigo-500/30">
      <header className="p-6 flex items-center justify-between border-b border-white/5 sticky top-0 bg-[#0F1115]/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">OMNIVOICE</h1>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest leading-none">AI Intelligence</p>
          </div>
        </div>
        {doc && (
          <button onClick={() => { stopPlayback(); setDoc(null); }} className="text-sm font-bold text-gray-500 hover:text-white transition-colors">DISMISS</button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 blur-[120px] rounded-full -z-10 pointer-events-none"></div>

        {!doc ? (
          <div className="max-w-xl w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-700">
            <div className="space-y-4">
              <h2 className="text-5xl md:text-6xl font-black tracking-tighter leading-none">The Future <br/>of Reading.</h2>
              <p className="text-gray-400 text-lg font-medium leading-relaxed">Experience a new standard of document intelligence. Clean OCR, multi-column analysis, and ultra-realistic voice synthesis.</p>
            </div>

            <label className="group relative block">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-[2.5rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-[#1A1D24] border border-white/10 rounded-[2.5rem] p-12 cursor-pointer flex flex-col items-center hover:bg-[#1f232b] transition-all">
                <div className="w-16 h-16 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </div>
                <p className="text-xl font-bold mb-1">Upload Document</p>
                <p className="text-gray-500 text-sm">PDF, Image, or Text files</p>
                <input type="file" className="hidden" accept=".pdf,image/*,.txt" onChange={handleFileUpload} disabled={isProcessing} />
              </div>
            </label>

            {isProcessing && (
              <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-4">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-indigo-400 font-bold text-xs uppercase tracking-widest">{processingStatus}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-4xl space-y-6 animate-in slide-in-from-bottom-8 duration-1000 pb-32">
            <div className="bg-[#1A1D24] border border-white/5 rounded-[3rem] p-8 md:p-16 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8">
                 <Visualizer isPlaying={ttsState.isPlaying} />
               </div>
               
               <div className="space-y-12">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-black tracking-widest rounded-full uppercase">
                      Page {ttsState.currentPage + 1}
                    </span>
                    <span className="text-gray-600 text-[10px] font-bold uppercase tracking-widest">{doc.name}</span>
                  </div>

                  <div className="text-3xl md:text-5xl font-bold leading-[1.3] text-gray-100 min-h-[300px] selection:bg-indigo-600 selection:text-white">
                    {currentText || "Starting synthesis..."}
                  </div>
               </div>
            </div>
          </div>
        )}
      </main>

      {/* Advanced Control Dock */}
      {doc && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6 z-50">
          <div className="bg-[#1A1D24]/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-8">
              <div className="flex items-center gap-4">
                <button 
                  onClick={playTTS}
                  className="w-16 h-16 bg-white text-black rounded-3xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
                >
                  {ttsState.isPlaying ? (
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  ) : (
                    <svg className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Speed</span>
                    <span className="text-[10px] font-black text-indigo-400">{ttsState.speed}x</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="2.0" step="0.1" 
                    value={ttsState.speed} 
                    onChange={(e) => setTtsState(p => ({...p, speed: parseFloat(e.target.value)}))}
                    className="w-32 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center">
                 <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Voice Engine</span>
                 <div className="flex bg-white/5 rounded-2xl p-1 gap-1">
                   {['Kore', 'Puck', 'Zephyr'].map(v => (
                     <button 
                       key={v}
                       onClick={() => setTtsState(p => ({...p, voice: v}))}
                       className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${ttsState.voice === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                     >
                       {v}
                     </button>
                   ))}
                 </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const next = Math.max(0, ttsState.currentPage - 1);
                    setTtsState(p => ({...p, currentPage: next, currentBlockIndex: 0}));
                    if (isPlayingRef.current) { stopPlayback(); setTimeout(playTTS, 100); }
                  }}
                  className="p-3 bg-white/5 rounded-2xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M8.445 14.832A1 1 0 0010 14V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" /></svg>
                </button>
                <button 
                  onClick={() => {
                    const next = Math.min(doc.pages.length - 1, ttsState.currentPage + 1);
                    setTtsState(p => ({...p, currentPage: next, currentBlockIndex: 0}));
                    if (isPlayingRef.current) { stopPlayback(); setTimeout(playTTS, 100); }
                  }}
                  className="p-3 bg-white/5 rounded-2xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4z" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
