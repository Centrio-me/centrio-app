'use client';
import React, { useRef, useEffect, useState } from 'react';
import { RippleButton } from "@/components/ui/multi-type-ripple-buttons";

const CheckIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
    className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glProgramRef = useRef<WebGLProgram | null>(null);
  const glBgColorLocationRef = useRef<WebGLUniformLocation | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [backgroundColor, setBackgroundColor] = useState([0, 0, 0]);

  useEffect(() => {
    const root = document.documentElement;
    const updateColor = () => {
      const isDark = root.classList.contains('dark') || true; // always dark
      setBackgroundColor(isDark ? [0.024, 0.024, 0.059] : [1.0, 1.0, 1.0]);
    };
    updateColor();
    const observer = new MutationObserver(() => updateColor());
    observer.observe(root, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    const program = glProgramRef.current;
    const location = glBgColorLocationRef.current;
    if (gl && program && location) {
      gl.useProgram(program);
      gl.uniform3fv(location, new Float32Array(backgroundColor));
    }
  }, [backgroundColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;
    glRef.current = gl;

    const vertexShaderSource = `attribute vec2 aPosition; void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
    const fragmentShaderSource = `
      precision highp float;
      uniform float iTime;
      uniform vec2 iResolution;
      uniform vec3 uBackgroundColor;
      mat2 rotate2d(float angle){ float c=cos(angle),s=sin(angle); return mat2(c,-s,s,c); }
      float variation(vec2 v1,vec2 v2,float strength,float speed){ return sin(dot(normalize(v1),normalize(v2))*strength+iTime*speed)/100.0; }
      vec3 paintCircle(vec2 uv,vec2 center,float rad,float width){
        vec2 diff=center-uv;
        float len=length(diff);
        len+=variation(diff,vec2(0.,1.),5.,2.);
        len-=variation(diff,vec2(1.,0.),5.,2.);
        float circle=smoothstep(rad-width,rad,len)-smoothstep(rad,rad+width,len);
        return vec3(circle);
      }
      void main(){
        vec2 uv=gl_FragCoord.xy/iResolution.xy;
        uv.x*=1.5; uv.x-=0.25;
        float mask=0.0;
        float radius=.35;
        vec2 center=vec2(.5);
        mask+=paintCircle(uv,center,radius,.035).r;
        mask+=paintCircle(uv,center,radius-.018,.01).r;
        mask+=paintCircle(uv,center,radius+.018,.005).r;
        vec2 v=rotate2d(iTime)*uv;
        // Blue-purple palette — no rainbow, no white
        float r=0.22+0.15*sin(iTime*0.4+v.x*2.8);
        float g=0.08+0.08*sin(iTime*0.3+v.y*2.8+1.6);
        float b=0.65+0.28*sin(iTime*0.25+v.x*1.8+0.8);
        vec3 fg=vec3(r,g,b)*0.8;
        vec3 color=mix(uBackgroundColor,fg,mask);
        gl_FragColor=vec4(color,1.);
      }`;

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
    gl.linkProgram(program);
    gl.useProgram(program);
    glProgramRef.current = program;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const iTimeLoc = gl.getUniformLocation(program, 'iTime');
    const iResLoc = gl.getUniformLocation(program, 'iResolution');
    glBgColorLocationRef.current = gl.getUniformLocation(program, 'uBackgroundColor');
    gl.uniform3fv(glBgColorLocationRef.current, new Float32Array(backgroundColor));

    let raf: number;
    const render = (time: number) => {
      gl.uniform1f(iTimeLoc, time * 0.001);
      gl.uniform2f(iResLoc, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };
    const onResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || canvas.offsetWidth || 400;
      canvas.height = rect.height || canvas.offsetHeight || 300;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    };
    // Delay first resize to let layout settle
    setTimeout(onResize, 50);
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(render);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', zIndex: 0 }} />;
};

/** Fixed full-page version — drop once at the root to cover the whole site */
export const FullPageShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glBgLocRef = useRef<WebGLUniformLocation | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;
    glRef.current = gl;

    const vert = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.,1.); }`;
    const frag = `
      precision highp float;
      uniform float t; uniform vec2 r; uniform vec3 bg;
      mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
      float var(vec2 a,vec2 b,float s,float sp){ return sin(dot(normalize(a),normalize(b))*s+t*sp)/100.; }
      vec3 ring(vec2 uv,vec2 c,float rad,float w){
        vec2 d=c-uv; float l=length(d);
        l+=var(d,vec2(0.,1.),5.,2.); l-=var(d,vec2(1.,0.),5.,2.);
        return vec3(smoothstep(rad-w,rad,l)-smoothstep(rad,rad+w,l));
      }
      void main(){
        vec2 uv=gl_FragCoord.xy/r; uv.x*=1.5; uv.x-=0.25;
        vec2 c=vec2(.5);
        float m=ring(uv,c,.35,.035).r+ring(uv,c,.332,.01).r+ring(uv,c,.368,.005).r;
        vec2 v=rot(t)*uv;
        vec3 fg=vec3(v.x,v.y,.7-v.y*v.x);
        vec3 col=mix(bg,fg,m);
        col=mix(col,vec3(1.),ring(uv,c,.35,.003).r);
        gl_FragColor=vec4(col,1.);
      }`;

    const mkShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog); gl.useProgram(prog);
    progRef.current = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

    const tLoc = gl.getUniformLocation(prog, 't');
    const rLoc = gl.getUniformLocation(prog, 'r');
    glBgLocRef.current = gl.getUniformLocation(prog, 'bg');
    gl.uniform3fv(glBgLocRef.current, new Float32Array([0, 0, 0.04]));

    let raf: number;
    const resize = () => {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);
    const render = (time: number) => {
      gl.uniform1f(tLoc, time * 0.001);
      gl.uniform2f(rLoc, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', display: 'block' }}
    />
  );
};

export interface PricingCardProps {
  planName: string;
  description: string;
  price: string;        // e.g. "0 ₽", "199 ₽", "133 ₽"
  period?: string;      // e.g. "/мес"
  features: string[];
  disabledFeatures?: string[];
  badge?: string;       // e.g. "Популярно"
  savingsBadge?: string;
  buttonText: string;
  buttonHref?: string;
  isPopular?: boolean;
  buttonVariant?: 'primary' | 'secondary';
}

export const PricingCard = ({
  planName, description, price, period, features, disabledFeatures = [],
  badge, savingsBadge, buttonText, buttonHref, isPopular = false, buttonVariant = 'primary',
}: PricingCardProps) => {
  // Brand-aligned tonal card — matches page.tsx's .card / .card-elevated
  // system (warm cream text, single orange accent) instead of the previous
  // cyan/blue glassmorphic treatment, which was a mismatched, off-brand
  // template component sitting inside an otherwise flat, orange-accented site.
  const cardStyle: React.CSSProperties = {
    background: isPopular ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.03)',
    border: isPopular ? '1px solid rgba(90,169,255,.28)' : '1px solid rgba(255,255,255,.07)',
    borderRadius: 16,
    padding: '28px',
    flex: 1,
    maxWidth: 320,
    minWidth: 240,
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    boxShadow: isPopular ? '0 30px 70px rgba(0,0,0,.4)' : 'none',
    transition: 'background .25s, border-color .25s',
  };

  const buttonStyle: React.CSSProperties = buttonVariant === 'primary'
    ? { display: 'block', width: '100%', padding: '11px', borderRadius: 10, fontWeight: 600, fontSize: 14.5, cursor: 'pointer', textDecoration: 'none', textAlign: 'center', background: '#2F6FED', color: '#fff', border: 'none', marginTop: 'auto', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.16)', transition: 'background .15s', fontFamily: 'inherit' }
    : { display: 'block', width: '100%', padding: '11px', borderRadius: 10, fontWeight: 500, fontSize: 14.5, cursor: 'pointer', textDecoration: 'none', textAlign: 'center', background: 'transparent', color: 'rgba(245,241,232,.65)', border: '1px solid rgba(255,255,255,.1)', marginTop: 'auto', transition: 'all .2s', fontFamily: 'inherit' };

  return (
    <div style={cardStyle}>
      {badge && (
        <div style={{ position: 'absolute', top: -14, right: 16, padding: '4px 14px', fontSize: 11, fontWeight: 700, borderRadius: 50, background: 'rgba(47,111,237,.3)', border: '1px solid rgba(47,111,237,.4)', color: '#C9E4FF', letterSpacing: '.08em' }}>
          {badge}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', color: '#F5F1E8', lineHeight: 1.1 }}>{planName}</h3>
        <p style={{ fontSize: 13.5, color: 'rgba(245,241,232,.4)', marginTop: 6 }}>{description}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '20px 0' }}>
        <span style={{ fontSize: 40, fontWeight: 700, color: '#F5F1E8', letterSpacing: '-0.03em', lineHeight: 1 }}>{price}</span>
        {period && <span style={{ fontSize: 14, color: 'rgba(245,241,232,.35)' }}>{period}</span>}
      </div>

      {savingsBadge && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 50, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: '#4ade80', marginBottom: 12 }}>
          {savingsBadge}
        </div>
      )}

      <div style={{ height: 1, background: 'rgba(255,255,255,.06)', marginBottom: 18 }} />

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13.5, color: 'rgba(245,241,232,.75)', marginBottom: 22, listStyle: 'none', padding: 0, flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7DD3C0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            {f}
          </li>
        ))}
        {disabledFeatures.map((f, i) => (
          <li key={`no-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: .35 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(245,241,232,.5)" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            {f}
          </li>
        ))}
      </ul>

      {buttonHref ? (
        <a href={buttonHref} style={buttonStyle}>{buttonText}</a>
      ) : (
        <button style={buttonStyle}>{buttonText}</button>
      )}
    </div>
  );
};

interface GlassPricingSectionProps {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  plans: PricingCardProps[];
  showAnimatedBackground?: boolean;
  note?: React.ReactNode;
}

export const GlassPricingSection = ({
  title, subtitle, plans, showAnimatedBackground = true, note,
}: GlassPricingSectionProps) => {
  return (
    <div style={{ position: 'relative', borderRadius: 24 }}>
      {showAnimatedBackground && <ShaderCanvas />}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {(title || subtitle) && (
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            {title && <div style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 200, letterSpacing: '-0.03em', color: '#f0f0ff', lineHeight: 1.1 }}>{title}</div>}
            {subtitle && <p style={{ marginTop: 12, fontSize: 16, color: 'rgba(240,240,255,.55)', maxWidth: 480, margin: '12px auto 0' }}>{subtitle}</p>}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', alignItems: 'center' }}>
          {plans.map(plan => <PricingCard key={plan.planName} {...plan} />)}
        </div>
        {note && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>{note}</div>
        )}
      </div>
    </div>
  );
};
