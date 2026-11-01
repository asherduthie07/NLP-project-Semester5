import { useMotionPreference } from './lib/motion';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowRight, Box, Check, CheckCheck, Code2, Copy, Layers3, MousePointer2, MoveUpRight, Radio, SlidersHorizontal, Sparkles, Terminal, Workflow } from 'lucide-react';
import { Badge, Button, Card, Chip, Kbd, ProgressRing, Skeleton, Slider, Sparkline, Tabs, Toast, Toggle, Tooltip } from './components/ui';
import { CornerBrackets, CountUp, GlowBorder, MagneticButton, Marquee, NoiseOverlay, ParallaxLayer, ScrambleText, SpotlightCard, TiltCard } from './components/fx';
import { entrance, stagger } from './design/motion';
import { designSystemDemo } from './data/mock';

const palette = [ ['Blue', '--blue'], ['Cyan', '--cyan'], ['Violet', '--violet'], ['Mint', '--mint'], ['Amber', '--amber'], ['Coral', '--coral'], ['Pink', '--pink'], ['Canvas', '--bg-0'] ];
function Section({ id, number, title, caption, children }: { id: string; number: string; title: string; caption: string; children: ReactNode }) {
  return <section id={id} className="showcase-section"><div className="section-heading"><span className="section-number">{number}</span><h2>{title}</h2><span>{caption}</span></div>{children}</section>;
}
function Title({ children, icon }: { children: ReactNode; icon: ReactNode }) { return <div className="card-title"><span>{children}</span>{icon}</div>; }

export default function DesignSystem() {
  const [labels, setLabels] = useState(true);
  const [intensity, setIntensity] = useState(64);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reduced = useMotionPreference();
  async function copyToken() {
    try { await navigator.clipboard.writeText('var(--cyan)'); setCopied(true); setToast('Copied var(--cyan) to clipboard'); }
    catch { setToast('Clipboard unavailable. Token: var(--cyan)'); }
  }
  return <>
    <a href="#main" className="skip-link">Skip to content</a><NoiseOverlay />
    <div className="world" aria-hidden="true"><div className="orb" /><div className="orb second" /></div>
    <header className="top-nav"><div className="nav-inner"><a className="wordmark" href="/design-system" aria-label="CodeAtlas AI design system"><span className="logo"><Workflow size={20} /></span>CodeAtlas<em>AI</em></a><nav className="nav-links" aria-label="Design system sections"><a href="#foundations">Foundations</a><a href="#components">Components</a><a href="#effects">Effects</a><a href="#motion">Motion</a></nav><div className="version"><span className="status-dot cyan" /><span className="mono">M1 / v0.1.0</span></div></div></header>
    <main id="main">
      <motion.section className="hero" initial={reduced ? false : 'hidden'} animate="visible" variants={stagger}>
        <motion.div variants={entrance}><div className="eyebrow"><Layers3 size={12} /> Interface foundations <span className="cyan">/ 001</span></div><h1><ScrambleText>A language for</ScrambleText><br /><span className="gradient-text">understanding.</span></h1><p>The visual building blocks of CodeAtlas AI. Precise, luminous, and grounded in evidence — from the first source token to the last verified claim.</p><div className="hero-meta"><span><span className="mint">●</span> Design system showcase</span><span>Illustrative values only</span><span>React 18 · TypeScript</span></div></motion.div>
        <motion.div className="hero-art" variants={entrance}><TiltCard><CornerBrackets><Card><div className="preview-header"><span className="eyebrow">Evidence, by design</span><Box size={14} className="cyan" /></div><div className="preview-body"><ProgressRing value={designSystemDemo.progress} label="Illustrative progress" /><div><h3>Traceable.<br />At every level.</h3><p>ProgressRing · HUD panel</p></div></div><div className="preview-footer"><Chip tone="mint"><CheckCheck size={11} /> Verified style</Chip><span className="mono">DEMO COMPONENT</span></div></Card></CornerBrackets></TiltCard></motion.div>
      </motion.section>
      <Section id="foundations" number="01" title="Foundations" caption="COLOR / TYPE / SURFACE">
        <div className="palette">{palette.map(([name, token]) => <div className="swatch" key={token}><div className="swatch-color" style={{ background: `var(${token})`, border: '1px solid var(--line)' } as CSSProperties} /><span><strong>{name}</strong></span><span>{token}</span></div>)}</div>
        <div className="grid cols-3" style={{ marginTop: 16 }}><Card><Title icon={<Code2 />}>DISPLAY / SPACE GROTESK</Title><p className="type-display">Clarity in complexity.</p><p className="type-ui">Inter · Interfaces that put evidence first.</p><p className="type-code">JetBrains Mono · file.py:42–58</p></Card><Card><Title icon={<Layers3 />}>SURFACES / ELEVATION</Title><div className="row">{['--bg-0', '--bg-1', '--bg-2', '--bg-3'].map((token, index) => <div key={token} style={{ width: 48, height: 48, borderRadius: 10, border: '1px solid var(--line-strong)', background: `var(${token})`, display: 'grid', placeItems: 'center' }}><span className="mono muted" style={{ fontSize: 10 }}>0{index}</span></div>)}</div><p className="type-ui" style={{ marginTop: 15 }}>14px cards · 10px inputs · 4px grid</p></Card><Card><Title icon={<Radio />}>SEMANTICS / EVIDENCE</Title><div className="stack"><Badge tone="mint">Verified — mechanically supported</Badge><Badge tone="amber">Uncertain — inferred behavior</Badge><Badge tone="coral">Unsupported — review required</Badge></div></Card></div>
      </Section>
      <Section id="components" number="02" title="Interface components" caption="13 REUSABLE PRIMITIVES">
        <div className="grid cols-3">
          <Card><Title icon={<MousePointer2 />}>BUTTON / MAGNETIC CTA</Title><div className="stack"><div className="row"><MagneticButton onClick={() => setToast('MagneticButton interaction preview')}>Explore evidence <ArrowRight size={13} /></MagneticButton></div><div className="row"><Button variant="ghost" onClick={() => setToast('Secondary action preview')}>Secondary action</Button><Button disabled>Disabled</Button></div></div></Card>
          <Card><Title icon={<CheckCheck />}>CHIP / BADGE / SOURCE</Title><div className="stack"><div className="row"><Chip tone="mint">Verified</Chip><Chip tone="amber">Uncertain</Chip><Chip tone="coral">Unsupported</Chip></div><div className="row"><Chip><Code2 size={10} /> catalog.py:8–16</Chip><Chip tone="violet">Python</Chip></div><span className="muted" style={{ fontSize: 10 }}>Style samples; no source analysis is asserted.</span></div></Card>
          <Card><Title icon={<SlidersHorizontal />}>TOGGLE / SLIDER</Title><Toggle label="Show labels" checked={labels} onChange={setLabels} /><Slider label="Glow intensity preview" value={intensity} onChange={setIntensity} /></Card>
          <Card><Title icon={<Layers3 />}>TABS / LAYOUT TRANSITION</Title><Tabs items={[{ id: 'source', label: 'Source', content: 'Original bytes remain the foundation of every source location.' }, { id: 'tokens', label: 'Tokens', content: 'Lexical tokens retain their file, line, column and source text.' }, { id: 'evidence', label: 'Evidence', content: 'Verification behavior is reserved for a later authorized phase.' }]} /></Card>
          <Card><Title icon={<Copy />}>TOOLTIP / KBD / COPY</Title><div className="row"><Button variant="ghost" onClick={copyToken}>{copied ? <motion.span initial={{ scale: .7 }} animate={{ scale: 1 }}><Check size={13} /></motion.span> : <Copy size={13} />}{copied ? 'Copied' : 'Copy token'}</Button><Tooltip label="Open source" shortcut="S"><Code2 size={18} /></Tooltip></div><div className="row" style={{ marginTop: 18 }}><Kbd>⌘</Kbd><Kbd>K</Kbd><span className="muted" style={{ fontSize: 10 }}>Command palette reserved for M2</span></div></Card>
          <Card><Title icon={<Sparkles />}>SKELETON / TOAST</Title><div className="stack"><Skeleton width="85%" label="Skeleton component sample" /><Skeleton width="62%" label="Short skeleton component sample" /><Button variant="ghost" onClick={() => setToast('Evidence panel preference saved — component demo')}>Preview notification <MoveUpRight size={12} /></Button></div></Card>
        </div>
      </Section>
      <Section id="effects" number="03" title="Depth & interaction" caption="LIGHT FOLLOWS INTENT">
        <div className="grid cols-3">
          <SpotlightCard className="fx-demo"><div className="row"><span className="fx-index">FX.01</span><MousePointer2 size={14} className="cyan" /></div><div><h3>Follow the light.</h3><p>SpotlightCard tracks the pointer across its surface and border.</p></div></SpotlightCard>
          <GlowBorder><Card className="fx-demo"><span className="fx-index">FX.02</span><div><h3>A quiet signal.</h3><p>GlowBorder carries a conic beam around the edge of a featured panel.</p></div></Card></GlowBorder>
          <TiltCard><Card className="fx-demo"><span className="fx-index">FX.03</span><div><h3>A little perspective.</h3><p>TiltCard responds within six degrees. Try the hero panel, too.</p></div></Card></TiltCard>
        </div>
      </Section>
      <Section id="motion" number="04" title="Motion with meaning" caption="SHARED PRESETS / REDUCED MOTION">
        <div className="grid cols-2"><CornerBrackets><Card><Title icon={<Workflow />}>COUNTUP / SPARKLINE / PROGRESS</Title><div className="row" style={{ justifyContent: 'space-between' }}><div><div style={{ fontSize: 38 }}><CountUp value={designSystemDemo.counter} /></div><span className="eyebrow">Illustrative counter</span></div><Sparkline values={[6, 10, 8, 16, 13, 21, 19, 29, 27, 34]} label="Illustrative sparkline, no measured data" /><ProgressRing value={intensity} label="Slider-controlled demonstration progress" /></div></Card></CornerBrackets><Card><Title icon={<Terminal />}>SCRAMBLE / PARALLAX / SCANLINES</Title><ParallaxLayer speed={.6}><div className="terminal"><pre className="code-box"><span className="keyword">[design]</span> <ScrambleText>Evidence is a first-class element.</ScrambleText>{'\n'}<span className="literal">[motion]</span> {reduced ? 'reduced motion enabled' : 'shared springs · 60ms stagger'}{'\n'}<span className="cyan">[scope]</span> M1 showcase · no analysis performed</pre></div></ParallaxLayer><p className="type-ui" style={{ marginTop: 18 }}>NoiseOverlay is global. Parallax and loops respect your motion preference.</p></Card></div>
        <div className="card" style={{ marginTop: 16, padding: '12px 0' }}><Marquee><span className="eyebrow">SOURCE PRESERVATION</span><Code2 size={16} className="cyan" /><span className="eyebrow">TYPED CONTRACTS</span><Workflow size={16} className="cyan" /><span className="eyebrow">TRACEABLE LOCATIONS</span><CheckCheck size={16} className="cyan" /><span className="eyebrow">DETERMINISTIC PREPROCESSING</span></Marquee><div className="marquee-row"><Marquee reverse><span>tokens → source</span><span>comments → locations</span><span>snapshots → hashes</span><span>design → evidence</span><span>motion → intention</span></Marquee></div></div>
      </Section>
      <footer className="footer"><span>CodeAtlas AI · M1 design-system foundation</span><span className="row">M2–M7 awaiting authorization <ArrowDown size={12} /></span><span>Missing references: ref-1 · ref-2 · ref-3 · ref-4</span></footer>
    </main><Toast message={toast} onClose={() => setToast(null)} />
  </>;
}
