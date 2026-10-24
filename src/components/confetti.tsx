import { useEffect, useRef } from 'react';
import { useData } from '../data';
import { usePrefersReducedMotion } from '../utils';

// Merkkleuren (amber + hop + foam) voor de snippers.
const COLORS = ['#ffa600', '#ffc43d', '#b06a00', '#5e8c2a', '#a3c76d', '#fffaf0'];
const GRAVITY = 0.11;
const DRAG = 0.99;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number; color: string;
  life: number; max: number;
  sway: number; swayV: number; swayA: number;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Schiet confetti af zodra er live een biertje wordt gelogd. Luistert mee met de
 * live-events uit de DataProvider; biertjes die er bij het openen al waren tellen niet.
 */
export function BeerConfetti() {
  const { events } = useData();
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const seen = useRef(new Set<string>());
  const primed = useRef(false);

  // Canvas op schermgrootte houden (scherp op retina).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const beerKeys = events.filter((e) => e.kind === 'beer').map((e) => e.key);
    // Eerste keer: alles wat er al is markeren als gezien, zonder te knallen.
    if (!primed.current) {
      primed.current = true;
      beerKeys.forEach((k) => seen.current.add(k));
      return;
    }
    const fresh = beerKeys.filter((k) => !seen.current.has(k));
    if (!fresh.length) return;
    fresh.forEach((k) => seen.current.add(k));
    if (reduced) return;
    burst(Math.min(fresh.length, 4));
  }, [events, reduced]);

  function burst(bursts: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Snippers over de volle breedte, verspreid van boven het beeld tot halverwege,
    // zodat het hele scherm meteen vol zit en daarna rustig naar beneden dwarrelt.
    const count = 220 + bursts * 50;
    for (let i = 0; i < count; i++) {
      const max = rand(200, 320);
      particles.current.push({
        x: rand(0, w),
        y: rand(-h * 0.2, h * 0.55),
        vx: rand(-2.5, 2.5),
        vy: rand(1.5, 5),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.25, 0.25),
        size: rand(6, 13),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: max, max,
        sway: rand(0, Math.PI * 2),
        swayV: rand(0.02, 0.06),
        swayA: rand(0.4, 1.6),
      });
    }
    // Begrens zodat snelle rondjes het geheugen niet laten oplopen.
    if (particles.current.length > 2400) particles.current = particles.current.slice(-2400);
    ensureLoop();
  }

  function ensureLoop() {
    if (rafRef.current != null) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const h = () => window.innerHeight;

    const step = () => {
      const width = window.innerWidth;
      const height = h();
      ctx.clearRect(0, 0, width, height);
      const list = particles.current;
      for (const p of list) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.sway += p.swayV;
        p.x += p.vx + Math.sin(p.sway) * p.swayA;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 1;
        const alpha = Math.min(1, p.life / (p.max * 0.4));
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      particles.current = list.filter((p) => p.life > 0 && p.y < height + 60);
      if (particles.current.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, width, height);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden />;
}
