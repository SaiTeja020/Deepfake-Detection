import React, { useEffect, useRef } from 'react';

interface NeuralMeshProps {
  isDark: boolean;
  noLines?: boolean;
}

const NeuralMesh: React.FC<NeuralMeshProps> = ({ isDark, noLines = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const particleCount = 70;
    const connectionRadius = 180;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;

      constructor(width: number, height: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.3; // Slower, more graceful movement
        this.vy = (Math.random() - 0.5) * 0.3;
        this.radius = Math.random() * 1.5 + 0.5;
      }

      update(width: number, height: number) {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
      }

      draw(ctx: CanvasRenderingContext2D, color: string) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        ctx.shadowBlur = isDark ? 8 : 4;
        ctx.shadowColor = color;
      }
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };

    const init = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(canvas.width, canvas.height));
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Sophisticated, subtle colors
      // Dark mode: Electric blue | Light mode: Soft slate blue
      const particleColor = isDark ? 'rgba(100, 200, 255, 0.7)' : 'rgba(15, 42, 110, 0.7)';
      const lineColorTemplate = isDark ? 'rgba(100, 200, 255,' : 'rgba(15, 42, 110,';

      particles.forEach((p, i) => {
        p.update(canvas.width, canvas.height);
        p.draw(ctx, particleColor);

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (!noLines && distance < connectionRadius) {
            // Very subtle connections
            const opacity = (1 - distance / connectionRadius) * (isDark ? 0.4 : 0.35);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `${lineColorTemplate} ${opacity})`;
            ctx.lineWidth = 1.2; // Balanced line thickness
            ctx.stroke();
          }
        }
      });
      ctx.shadowBlur = 0;

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', resize);
    resize();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      style={{ filter: 'blur(0.5px)' }}
    />
  );
};

export default NeuralMesh;
