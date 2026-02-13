import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isPlaying: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Initializing with undefined to fix the "Expected 1 arguments, but got 0" error on line 10 (or 11 depending on spacing).
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    const bars = 24;
    const heights = new Array(bars).fill(2);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width / bars;
      
      for (let i = 0; i < bars; i++) {
        if (isPlaying) {
          // target height oscillates
          const target = 5 + Math.random() * (canvas.height - 10);
          heights[i] += (target - heights[i]) * 0.2;
        } else {
          heights[i] += (2 - heights[i]) * 0.1;
        }

        ctx.fillStyle = '#6366f1'; // indigo-500
        const h = heights[i];
        const x = i * width + 2;
        const y = (canvas.height - h) / 2;
        
        ctx.beginPath();
        ctx.roundRect(x, y, width - 4, h, 4);
        ctx.fill();
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  return <canvas ref={canvasRef} width={200} height={40} className="w-full h-10" />;
};

export default Visualizer;