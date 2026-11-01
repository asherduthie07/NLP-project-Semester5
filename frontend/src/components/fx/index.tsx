import { useMotionPreference } from '../../lib/motion';
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { animate, motion, useInView } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { durations, softSpring } from '../../design/motion';
import { Button } from '../ui';

gsap.registerPlugin(ScrollTrigger);
export function NoiseOverlay() { return <div className="noise-overlay" aria-hidden="true" />; }
export function CornerBrackets({ children }: { children: ReactNode }) { return <div className="corner-frame"><i /><i /><i /><i />{children}</div>; }
export function GlowBorder({ children }: { children: ReactNode }) { return <div className="glow-border">{children}</div>; }
export function SpotlightCard({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useMotionPreference();
  return <div ref={ref} className={`card spotlight ${className}`} onPointerMove={event => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    ref.current.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }} {...props}>{children}</div>;
}
export function TiltCard({ children }: { children: ReactNode }) {
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const reduced = useMotionPreference();
  return <motion.div className="tilt-card" animate={tilt} transition={softSpring} onPointerMove={event => {
    if (reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTilt({ rotateX: -((event.clientY - rect.top) / rect.height - .5) * 12, rotateY: ((event.clientX - rect.left) / rect.width - .5) * 12 });
  }} onPointerLeave={() => setTilt({ rotateX: 0, rotateY: 0 })}>{children}<div className="tilt-glare" aria-hidden="true" /></motion.div>;
}
export function MagneticButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reduced = useMotionPreference();
  return <div className="magnetic-zone" onPointerMove={event => {
    if (reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
    setOffset(Math.hypot(x, y) <= 80 ? { x: x * .16, y: y * .16 } : { x: 0, y: 0 });
  }} onPointerLeave={() => setOffset({ x: 0, y: 0 })}><motion.div animate={offset} transition={softSpring}><Button onClick={onClick}>{children}</Button></motion.div></div>;
}
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true });
  const reduced = useMotionPreference();
  useEffect(() => {
    if (!visible || !ref.current) return;
    if (reduced) { ref.current.textContent = value.toLocaleString(); return; }
    const controls = animate(0, value, { duration: durations.count, onUpdate: n => { if (ref.current) ref.current.textContent = Math.round(n).toLocaleString(); } });
    return () => controls.stop();
  }, [visible, reduced, value]);
  return <span className="mono"><span className="sr-only">{value.toLocaleString()}</span><span ref={ref} aria-hidden="true">{reduced ? value.toLocaleString() : 0}</span></span>;
}
export function ScrambleText({ children }: { children: string }) {
  const [text, setText] = useState(children);
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true });
  const reduced = useMotionPreference();
  useEffect(() => {
    if (!visible || reduced) { setText(children); return; }
    const start = performance.now();
    const glyphs = '01{}[]<>/';
    const interval = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / (durations.scramble * 1000));
      setText(children.split('').map((char, index) => index / children.length <= progress || char === ' ' ? char : glyphs[index % glyphs.length]).join(''));
      if (progress === 1) clearInterval(interval);
    }, 40);
    return () => clearInterval(interval);
  }, [visible, reduced, children]);
  return <span ref={ref}><span className="sr-only">{children}</span><span aria-hidden="true">{text}</span></span>;
}
export function ParallaxLayer({ children, speed = .2 }: { children: ReactNode; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useMotionPreference();
  useEffect(() => {
    if (reduced || !ref.current) return;
    const context = gsap.context(() => { gsap.fromTo(ref.current, { y: -24 * speed }, { y: 24 * speed, ease: 'none', scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true } }); }, ref);
    return () => context.revert();
  }, [reduced, speed]);
  return <div ref={ref}>{children}</div>;
}
export function Marquee({ children, reverse = false }: { children: ReactNode; reverse?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  return <div ref={ref} className={`marquee ${reverse ? 'reverse' : ''}`}><div className="marquee-track" style={{ animationPlayState: visible ? 'running' : 'paused' } as CSSProperties}><div>{children}</div><div aria-hidden="true">{children}</div></div></div>;
}
