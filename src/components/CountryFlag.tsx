import React, { useEffect, useRef } from 'react';
import { drawCountryFlagOnCanvas } from '../three/flagRenderer';

interface CountryFlagProps {
  code: string;
  flag: string;
  color: string;
  name?: string;
  className?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({
  code,
  flag,
  color,
  name,
  className = 'w-9 h-6',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCountryFlagOnCanvas(ctx, code, canvas.width, canvas.height, flag, color, name);
  }, [code, flag, color, name]);

  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={64}
      aria-label={`${name || code} Bayrağı`}
      className={`${className} rounded-[4px] border border-white/25 object-cover shrink-0 shadow-sm`}
    />
  );
};
