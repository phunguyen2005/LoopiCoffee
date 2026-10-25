"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type InteractiveLoopy3DProps = {
  size?: number;
  className?: string;
  focusMode?: "idle" | "email" | "password";
  emailProgress?: number;
  isPasswordVisible?: boolean;
  statusMood?: "idle" | "loading" | "error" | "success";
};

type ReactionKind = "none" | "blink" | "happy" | "wink" | "surprised" | "sleepy" | "dizzy";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Real-time 3D Procedural SDF Raymarching Shader for Loopy with Subsurface/Toon/Velvet Shading
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_resolution;
uniform vec2 u_headRot;      // x = pitch (up/down), y = yaw (left/right)
uniform float u_headRoll;    // z tilt
uniform vec2 u_eyeLook;      // additional eye ball offset
uniform float u_time;
uniform float u_blink;       // 0.0 = open, 1.0 = closed/happy arc
uniform int u_reaction;      // 0=none, 1=blink, 2=happy, 3=wink, 4=surprised, 5=sleepy, 6=dizzy
uniform float u_blush;       // 0.0..1.0 cheek blush intensity
uniform vec2 u_squash;       // x = scaleX, y = scaleY for boop bounce

// Smooth minimum (polynomial smin) for organic ZBrush/Blender-like metaball blending
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Smooth maximum for organic carving/boolean subtraction
float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

// 3D rotation helpers
mat3 rotateX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotateY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotateZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

// Ellipsoid SDF
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 0.0001);
}

// Capsule / Round Cone SDF for hair strands & limbs
float sdCapsule(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r1, r2, h);
}

// Rounded Box SDF for cute buck teeth
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Subtle 3D procedural micro-fur noise locked to 3D object space
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3D(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

// Transform world point into Loopy's head local 3D space
vec3 toHeadSpace(vec3 p) {
  // Apply boop squash & stretch around neck pivot
  vec3 q = p - vec3(0.0, -0.55, 0.0);
  q.x /= u_squash.x;
  q.y /= u_squash.y;
  q.z /= sqrt(u_squash.x);
  q += vec3(0.0, -0.55, 0.0);

  // Subtle idle breathing bob
  q.y -= sin(u_time * 2.2) * 0.018;

  // Pivot around neck/head center
  vec3 pivot = vec3(0.0, -0.10, 0.0);
  q -= pivot;
  mat3 rot = rotateZ(u_headRoll) * rotateX(u_headRot.x) * rotateY(u_headRot.y);
  q = rot * q;
  q += pivot;
  return q;
}

// Scene evaluation returning (distance, materialID)
// matID:
// 1.0 = pink skin/fur
// 2.0 = inner ear cream
// 3.0 = glossy dark-berry nose
// 4.0 = glossy dark-espresso eyes
// 5.0 = orange-coral hair tuft
// 6.0 = white buck teeth
// 7.0 = dark rose mouth cavity
vec2 mapScene(vec3 worldP) {
  vec3 p = toHeadSpace(worldP);

  // Symmetric X coordinate for paired features
  vec3 symP = vec3(abs(p.x), p.y, p.z);

  // 1. Cranium + Plump Beaver Cheeks + Snout + Chin
  float cranium = sdEllipsoid(p - vec3(0.0, 0.14, -0.02), vec3(0.56, 0.52, 0.50));
  float cheeks = sdEllipsoid(symP - vec3(0.30, -0.11, 0.11), vec3(0.39, 0.31, 0.36));
  float snout = sdEllipsoid(p - vec3(0.0, -0.08, 0.34), vec3(0.34, 0.24, 0.28));
  float chin = sdEllipsoid(p - vec3(0.0, -0.25, 0.10), vec3(0.42, 0.22, 0.34));

  float head = smin(cranium, cheeks, 0.22);
  head = smin(head, snout, 0.18);
  head = smin(head, chin, 0.18);

  // Shoulders / Neck base (softly blended below head)
  vec3 bodyP = worldP - vec3(0.0, -0.78, -0.04);
  bodyP.x /= u_squash.x;
  bodyP.y /= u_squash.y;
  float torso = sdEllipsoid(bodyP, vec3(0.42, 0.32, 0.32));
  head = smin(head, torso, 0.12);

  // 2. Round Ears on top-sides
  vec3 earCenter = vec3(0.46, 0.44, -0.04);
  float outerEar = sdEllipsoid(symP - earCenter, vec3(0.165, 0.165, 0.11));
  head = smin(head, outerEar, 0.045);

  // Carve subtle mouth smile indentation into the lower snout
  vec3 mouthCarveP = p - vec3(0.0, -0.235, 0.55);
  mouthCarveP.y -= p.x * p.x * 0.65; // upward smile curve
  float mouthCavitySphere = sdEllipsoid(mouthCarveP, vec3(0.135, 0.068, 0.12));
  float dSkin = smax(head, -mouthCavitySphere, 0.035);

  vec2 res = vec2(dSkin, 1.0);

  // Inner ear cup (cream-pink)
  float innerEar = sdEllipsoid(symP - (earCenter + vec3(0.01, -0.005, 0.065)), vec3(0.095, 0.095, 0.055));
  if (innerEar < res.x) {
    res = vec2(innerEar, 2.0);
  }

  // Mouth interior background
  float mouthInside = sdEllipsoid(mouthCarveP - vec3(0.0, 0.0, -0.025), vec3(0.125, 0.058, 0.08));
  if (mouthInside < res.x) {
    res = vec2(mouthInside, 7.0);
  }

  // 3. Loopy's broad, low front tooth with softly rounded corners.
  // Keep this as one continuous plate at login size so it reads like the
  // original rectangular incisor instead of two pointed fangs.
  vec3 toothP = p - vec3(0.0, -0.215, 0.568);
  float teeth = sdRoundBox(toothP, vec3(0.068, 0.027, 0.021), 0.009);
  if (teeth < res.x) {
    res = vec2(teeth, 6.0);
  }

  // 4. Iconic Plump Glossy Dark-Berry Nose
  vec3 noseP = p - vec3(0.0, -0.045, 0.60);
  // Slightly wider at top, plump oval
  noseP.x *= 1.0 - noseP.y * 0.6;
  float nose = sdEllipsoid(noseP, vec3(0.155, 0.108, 0.105));
  if (nose < res.x) {
    res = vec2(nose, 3.0);
  }

  // 5. Eyes (3D spheres or expressive curved arcs depending on blink/reaction)
  vec2 eyeLookOffset = u_eyeLook * vec2(0.045, 0.035);
  for (int side = -1; side <= 1; side += 2) {
    float s = float(side);
    vec3 eyeAnchor = vec3(s * 0.205 + eyeLookOffset.x, 0.105 + eyeLookOffset.y, 0.525);
    vec3 ep = p - eyeAnchor;

    bool isClosedArc = (u_blink > 0.5)
      || (u_reaction == 1)
      || (u_reaction == 2)
      || (u_reaction == 5)
      || (u_reaction == 3 && side == -1);

    if (isClosedArc) {
      // Cute 3D curved happy/sleepy eyelash arc on the surface
      float flip = (u_reaction == 5) ? -1.0 : 1.0; // sleepy curves down, happy curves up
      vec3 arcP = ep;
      arcP.y += flip * (arcP.x * arcP.x * 4.8 - 0.015);
      float arc = sdCapsule(arcP, vec3(-0.055, 0.0, 0.02), vec3(0.055, 0.0, 0.02), 0.018, 0.018);
      if (arc < res.x) {
        res = vec2(arc, 4.0);
      }
    } else {
      float eyeRadius = (u_reaction == 4) ? 0.068 : 0.056;
      float eyeSphere = sdEllipsoid(ep, vec3(eyeRadius, eyeRadius * 1.08, eyeRadius * 0.85));
      if (eyeSphere < res.x) {
        res = vec2(eyeSphere, 4.0);
      }
    }
  }

  // 6. Signature Orange-Coral Hair Tuft (2 organic curved sprouts on top of cranium)
  vec3 hairRoot = p - vec3(0.01, 0.61, 0.02);
  // Subtle secondary spring sway on the hair tuft!
  float sway = sin(u_time * 3.4) * 0.015 - u_headRot.y * 0.08;
  vec3 h1 = hairRoot;
  h1.x -= clamp(h1.y, 0.0, 0.25) * (0.28 + sway);
  float strand1 = sdCapsule(h1, vec3(0.0, -0.02, 0.0), vec3(0.02, 0.19, 0.01), 0.018, 0.036);

  vec3 h2 = hairRoot;
  h2.x -= clamp(h2.y, 0.0, 0.16) * (0.85 + sway);
  float strand2 = sdCapsule(h2, vec3(0.01, -0.01, 0.0), vec3(0.07, 0.11, 0.01), 0.015, 0.030);

  float hair = smin(strand1, strand2, 0.02);
  if (hair < res.x) {
    res = vec2(hair, 5.0);
  }

  return res;
}

vec3 calcNormal(vec3 p) {
  const float eps = 0.0018;
  vec2 e = vec2(1.0, -1.0) * 0.5773 * eps;
  return normalize(
    e.xyy * mapScene(p + e.xyy).x +
    e.yyx * mapScene(p + e.yyx).x +
    e.yxy * mapScene(p + e.yxy).x +
    e.xxx * mapScene(p + e.xxx).x
  );
}

// Soft ambient occlusion in 3D
float calcAO(vec3 pos, vec3 nor) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.02 + 0.05 * float(i);
    float d = mapScene(pos + h * nor).x;
    occ += (h - d) * sca;
    sca *= 0.75;
  }
  return clamp(1.0 - 2.2 * occ, 0.35, 1.0);
}

void main() {
  // Normalized screen coordinates [-1, 1]
  vec2 uv = (v_uv - 0.5) * 2.0;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  // Camera setup
  vec3 ro = vec3(0.0, -0.04, 2.35);
  vec3 rd = normalize(vec3(uv * 0.82, -1.55));

  // Raymarch loop
  float t = 1.1;
  float matId = -1.0;
  bool hit = false;

  for (int i = 0; i < 64; i++) {
    vec3 pos = ro + rd * t;
    vec2 h = mapScene(pos);
    if (h.x < 0.0016) {
      hit = true;
      matId = h.y;
      break;
    }
    t += h.x;
    if (t > 3.6) break;
  }

  if (!hit) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 pos = ro + rd * t;
  vec3 headPos = toHeadSpace(pos);
  vec3 nor = calcNormal(pos);
  vec3 viewDir = -rd;

  // Studio 3-point lighting + Subsurface Scattering
  vec3 keyLight = normalize(vec3(-0.48, 0.62, 0.85));
  vec3 fillLight = normalize(vec3(0.65, -0.25, 0.55));
  vec3 backLight = normalize(vec3(0.0, 0.55, -0.85));

  float ndotl = dot(nor, keyLight);
  // Soft wrapped diffuse for plush/subsurface feel
  float wrapDiff = clamp((ndotl + 0.45) / 1.45, 0.0, 1.0);
  float fillDiff = clamp(dot(nor, fillLight) * 0.5 + 0.5, 0.0, 1.0);
  float rim = pow(clamp(1.0 - max(dot(nor, viewDir), 0.0), 0.0, 1.0), 2.6);
  float ao = calcAO(pos, nor);

  vec3 col = vec3(1.0);

  if (matId < 1.5) {
    // 1.0: Loopy Pink Velvet Skin + Subsurface Scattering + Cheek Blush
    float furNoise = noise3D(headPos * 28.0) * 0.5 + noise3D(headPos * 58.0) * 0.5;
    vec3 basePink = vec3(0.988, 0.675, 0.706) + (furNoise - 0.5) * 0.028;
    vec3 sssCoral = vec3(0.945, 0.455, 0.525);
    vec3 shadowMauve = vec3(0.845, 0.465, 0.525);

    // Subsurface wrap blend
    col = mix(shadowMauve, basePink, smoothstep(0.0, 0.68, wrapDiff));
    // Subsurface terminator glow
    float sssBand = smoothstep(0.1, 0.45, wrapDiff) * (1.0 - smoothstep(0.45, 0.82, wrapDiff));
    col = mix(col, sssCoral, sssBand * 0.28);

    // Rosy cheek blush in 3D head space
    vec3 blushPoint = vec3(abs(headPos.x), headPos.y, headPos.z);
    float cheekDist = length((blushPoint - vec3(0.32, -0.10, 0.42)) * vec3(1.2, 1.5, 1.0));
    float cheekFactor = smoothstep(0.28, 0.02, cheekDist) * (0.52 + u_blush * 0.45);
    col = mix(col, vec3(0.965, 0.405, 0.485), cheekFactor);

    // Snout/muzzle subtle lighter cream-pink highlight around mouth/nose
    float muzzleDist = length((headPos - vec3(0.0, -0.11, 0.52)) * vec3(1.1, 1.3, 1.0));
    float muzzleGlow = smoothstep(0.30, 0.04, muzzleDist) * 0.18;
    col = mix(col, vec3(1.0, 0.84, 0.86), muzzleGlow);

    // Velvet Peach-Fuzz Fresnel Rim Light & Top Highlight
    vec3 halfVec = normalize(keyLight + viewDir);
    float softSpec = pow(max(dot(nor, halfVec), 0.0), 18.0) * 0.14;
    col += vec3(1.0, 0.90, 0.92) * softSpec;
    col = mix(col, vec3(1.0, 0.87, 0.89), rim * 0.42);
    col *= mix(0.76, 1.04, ao);
  } else if (matId < 2.5) {
    // 2.0: Inner Ear Cream-Pink
    vec3 creamBase = vec3(0.992, 0.890, 0.895);
    vec3 creamShadow = vec3(0.910, 0.720, 0.745);
    col = mix(creamShadow, creamBase, wrapDiff) * mix(0.8, 1.0, ao);
  } else if (matId < 3.5) {
    // 3.0: Glossy Dark-Berry Plum Nose
    vec3 noseCore = vec3(0.165, 0.030, 0.095);
    vec3 noseRim = vec3(0.420, 0.105, 0.245);
    col = mix(noseCore, noseRim, clamp(wrapDiff * 0.65 + rim * 0.55, 0.0, 1.0));

    // Crisp studio softbox specular reflection on top of nose
    vec3 noseHalf = normalize(vec3(-0.32, 0.68, 0.95) + viewDir);
    float noseSpec1 = smoothstep(0.93, 0.985, max(dot(nor, noseHalf), 0.0));
    float noseSpec2 = pow(max(dot(nor, noseHalf), 0.0), 28.0) * 0.38;
    col += vec3(1.0, 0.94, 0.97) * (noseSpec1 * 0.75 + noseSpec2);
  } else if (matId < 4.5) {
    // 4.0: Glossy Dark-Espresso Eyes with Living Catchlights
    vec3 eyeBase = vec3(0.075, 0.035, 0.050);
    vec3 eyeWarm = vec3(0.210, 0.090, 0.130);
    col = mix(eyeBase, eyeWarm, fillDiff * 0.45);

    if (u_blink < 0.5 && u_reaction != 1 && u_reaction != 2 && u_reaction != 5) {
      // Primary top-left catchlight & secondary bottom-right catchlight
      vec3 catchDir1 = normalize(vec3(-0.35, 0.52, 0.92));
      vec3 catchDir2 = normalize(vec3(0.38, -0.42, 0.88));
      float catch1 = smoothstep(0.945, 0.975, max(dot(nor, catchDir1), 0.0));
      float catch2 = smoothstep(0.972, 0.990, max(dot(nor, catchDir2), 0.0));
      col += vec3(1.0) * (catch1 * 0.95 + catch2 * 0.65);
    }
  } else if (matId < 5.5) {
    // 5.0: Orange-Coral Hair Tuft
    float hGrad = clamp((headPos.y - 0.60) / 0.20, 0.0, 1.0);
    vec3 hairBase = mix(vec3(0.86, 0.27, 0.14), vec3(0.98, 0.48, 0.22), hGrad);
    col = hairBase * mix(0.78, 1.12, wrapDiff);
    col += vec3(1.0, 0.75, 0.55) * rim * 0.30;
  } else if (matId < 6.5) {
    // 6.0: White Buck Teeth
    col = mix(vec3(0.90, 0.86, 0.88), vec3(1.0, 0.995, 0.995), wrapDiff);
  } else {
    // 7.0: Mouth Cavity
    col = mix(vec3(0.38, 0.09, 0.16), vec3(0.58, 0.18, 0.26), wrapDiff);
  }

  // Soft bottom neck fade-out so Loopy floats seamlessly like the original 3D bust
  float bottomAlpha = smoothstep(-0.92, -0.60, headPos.y);
  // Anti-aliased silhouette edge
  float edgeAlpha = smoothstep(0.0, 0.15, abs(dot(nor, viewDir)) + 0.08);
  float alpha = clamp(bottomAlpha * edgeAlpha, 0.0, 1.0);

  // Premultiplied-friendly output
  gl_FragColor = vec4(col, alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function InteractiveLoopy3DMascot({
  size = 120,
  className = "",
  focusMode = "idle",
  emailProgress = 0,
  isPasswordVisible = false,
  statusMood = "idle",
}: InteractiveLoopy3DProps) {
  const prefersReducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const boopsRef = useRef<{ count: number; at: number }>({ count: 0, at: 0 });

  const [webglFailed, setWebglFailed] = useState(false);
  const [boopBadge, setBoopBadge] = useState<string | null>(null);

  // Mutable animation state read by requestAnimationFrame at 60-120fps without React re-render overhead
  const animStateRef = useRef({
    targetYaw: 0,
    targetPitch: 0,
    targetRoll: 0,
    currentYaw: 0,
    currentPitch: 0,
    currentRoll: 0,
    velYaw: 0,
    velPitch: 0,
    velRoll: 0,
    eyeX: 0,
    eyeY: 0,
    blink: 0,
    reaction: 0, // 0=none, 1=blink, 2=happy, 3=wink, 4=surprised, 5=sleepy, 6=dizzy
    blush: 0,
    squashX: 1,
    squashY: 1,
    velSquash: 0,
  });

  // Sync login form context into 3D target state
  useEffect(() => {
    const st = animStateRef.current;
    if (statusMood === "error") {
      st.reaction = 4; // surprised
      st.blush = 0.2;
      return;
    }
    if (statusMood === "success") {
      st.reaction = 2; // happy
      st.blush = 0.85;
      return;
    }
    if (statusMood === "loading") {
      st.reaction = 2;
      st.blush = 0.6;
      return;
    }

    if (focusMode === "email") {
      const clamped = Math.max(0, Math.min(1, emailProgress));
      // Look down at the email input and scan smoothly left-to-right across characters
      st.targetYaw = -0.52 + clamped * 1.04;
      st.targetPitch = 0.36;
      st.targetRoll = (clamped - 0.5) * -0.10;
      st.reaction = 0;
      st.blush = 0.25;
    } else if (focusMode === "password") {
      if (isPasswordVisible) {
        // Peek curiously when password visibility is toggled on
        st.targetYaw = 0.28;
        st.targetPitch = 0.22;
        st.targetRoll = -0.08;
        st.reaction = 3; // wink peek
        st.blush = 0.7;
      } else {
        // Shyly close eyes and turn head slightly when typing secret password
        st.targetYaw = -0.22;
        st.targetPitch = -0.18;
        st.targetRoll = 0.10;
        st.reaction = 5; // sleepy/shy closed eyes
        st.blush = 0.95;
      }
    } else {
      st.reaction = 0;
      st.blush = 0.15;
    }
  }, [focusMode, emailProgress, isPasswordVisible, statusMood]);

  // Pointer 360-degree continuous tracking across window
  useEffect(() => {
    if (prefersReducedMotion) return;

    const onPointerMove = (event: PointerEvent) => {
      if (focusMode !== "idle") return;
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;

      const maxRadius = Math.max(260, Math.min(window.innerWidth, window.innerHeight) * 0.48);
      // Smooth tanh-like curve so small movements near Loopy are super responsive and wide movements reach full 3D profile
      const nx = Math.tanh((dx / maxRadius) * 1.45);
      const ny = Math.tanh((dy / maxRadius) * 1.45);

      const st = animStateRef.current;
      st.targetYaw = nx * 0.72;     // Up to ~41 deg left/right in 3D
      st.targetPitch = ny * 0.52;   // Up to ~30 deg up/down in 3D
      st.targetRoll = -nx * 0.14;   // Natural head tilt when turning
    };

    const onPointerLeave = () => {
      if (focusMode !== "idle") return;
      const st = animStateRef.current;
      st.targetYaw = 0;
      st.targetPitch = 0;
      st.targetRoll = 0;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [focusMode, prefersReducedMotion]);

  // Natural autonomous eye blinking in 3D
  useEffect(() => {
    if (prefersReducedMotion) return;
    let blinkTimer: number;
    let openTimer: number;

    const scheduleBlink = () => {
      const waitMs = 2800 + Math.random() * 2800;
      blinkTimer = window.setTimeout(() => {
        animStateRef.current.blink = 1;
        openTimer = window.setTimeout(() => {
          animStateRef.current.blink = 0;
          scheduleBlink();
        }, 145);
      }, waitMs);
    };

    scheduleBlink();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(openTimer);
    };
  }, [prefersReducedMotion]);

  // WebGL 3D Engine initialization & 60-120fps render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false }) ||
      canvas.getContext("experimental-webgl", { alpha: true, antialias: true })) as WebGLRenderingContext | null;

    if (!gl) {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, "a_position");
    const uResLoc = gl.getUniformLocation(program, "u_resolution");
    const uHeadRotLoc = gl.getUniformLocation(program, "u_headRot");
    const uHeadRollLoc = gl.getUniformLocation(program, "u_headRoll");
    const uEyeLookLoc = gl.getUniformLocation(program, "u_eyeLook");
    const uTimeLoc = gl.getUniformLocation(program, "u_time");
    const uBlinkLoc = gl.getUniformLocation(program, "u_blink");
    const uReactionLoc = gl.getUniformLocation(program, "u_reaction");
    const uBlushLoc = gl.getUniformLocation(program, "u_blush");
    const uSquashLoc = gl.getUniformLocation(program, "u_squash");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelSize = Math.round(size * dpr);
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    gl.viewport(0, 0, pixelSize, pixelSize);

    let rafId = 0;
    let lastTime = performance.now();
    const startTime = lastTime;

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsed = prefersReducedMotion ? 0 : (now - startTime) / 1000;

      const st = animStateRef.current;

      // Damped harmonic spring physics for smooth 3D head orientation
      const stiffness = 175;
      const damping = 18;

      const ayYaw = (st.targetYaw - st.currentYaw) * stiffness - st.velYaw * damping;
      st.velYaw += ayYaw * dt;
      st.currentYaw += st.velYaw * dt;

      const ayPitch = (st.targetPitch - st.currentPitch) * stiffness - st.velPitch * damping;
      st.velPitch += ayPitch * dt;
      st.currentPitch += st.velPitch * dt;

      const ayRoll = (st.targetRoll - st.currentRoll) * stiffness - st.velRoll * damping;
      st.velRoll += ayRoll * dt;
      st.currentRoll += st.velRoll * dt;

      // Spring for boop squash & stretch
      const aSquash = (1.0 - st.squashX) * 280 - st.velSquash * 14;
      st.velSquash += aSquash * dt;
      st.squashX += st.velSquash * dt;
      st.squashY = 1.0 / Math.max(0.75, Math.min(1.28, st.squashX));

      // Eyes lead head rotation slightly for lifelike gaze
      st.eyeX = st.currentYaw * 1.15;
      st.eyeY = -st.currentPitch * 1.05;

      // Dizzy spin override
      const effectiveYaw =
        st.reaction === 6 ? st.currentYaw + Math.sin(elapsed * 14.0) * 0.35 : st.currentYaw;
      const effectiveRoll =
        st.reaction === 6 ? st.currentRoll + Math.cos(elapsed * 14.0) * 0.18 : st.currentRoll;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uResLoc, pixelSize, pixelSize);
      gl.uniform2f(uHeadRotLoc, st.currentPitch, effectiveYaw);
      gl.uniform1f(uHeadRollLoc, effectiveRoll);
      gl.uniform2f(uEyeLookLoc, st.eyeX, st.eyeY);
      gl.uniform1f(uTimeLoc, elapsed);
      gl.uniform1f(uBlinkLoc, st.blink);
      gl.uniform1i(uReactionLoc, st.reaction);
      gl.uniform1f(uBlushLoc, st.blush);
      gl.uniform2f(uSquashLoc, st.squashX, st.squashY);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [size, prefersReducedMotion]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const handleBoop = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    const st = animStateRef.current;
    // Trigger 3D squash & stretch impulse
    st.squashX = 1.18;
    st.velSquash = 2.4;
    st.blush = 0.95;

    const now = Date.now();
    const boops = boopsRef.current;
    boops.count = now - boops.at < 1600 ? boops.count + 1 : 1;
    boops.at = now;

    if (boops.count >= 4) {
      boops.count = 0;
      st.reaction = 6; // dizzy
      setBoopBadge("💫");
      timersRef.current.push(
        window.setTimeout(() => {
          st.reaction = 0;
          st.blush = 0.15;
          setBoopBadge(null);
        }, 1150),
      );
    } else {
      const reactions: Array<{ code: ReactionKind; id: number; icon: string }> = [
        { code: "happy", id: 2, icon: "💖" },
        { code: "wink", id: 3, icon: "✨" },
        { code: "surprised", id: 4, icon: "🌟" },
      ];
      const pick = reactions[(boops.count - 1) % reactions.length];
      st.reaction = pick.id;
      setBoopBadge(pick.icon);
      timersRef.current.push(
        window.setTimeout(() => {
          st.reaction = 0;
          st.blush = 0.15;
          setBoopBadge(null);
        }, 720),
      );
    }
  }, []);

  const activeBadge =
    boopBadge ??
    (statusMood === "error"
      ? "⚠️"
      : statusMood === "success"
        ? "🎉"
        : statusMood === "loading"
          ? "✨"
          : focusMode === "password"
            ? isPasswordVisible
              ? "👀"
              : "🙈"
            : null);

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Ambient Soft 3D Aura Halo */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-full bg-gradient-to-tr from-[#ffe1e7]/75 via-[#fff2f4]/45 to-[#fde68a]/35 blur-md"
      />

      {/* Soft 3D Ground Shadow */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 w-[58%] h-3 rounded-full bg-[#6f2939]/15 blur-[4px]"
      />

      <button
        ref={buttonRef}
        type="button"
        onClick={handleBoop}
        aria-label="Boop the Loopy"
        className="loopy-interactive-mascot relative flex items-center justify-center p-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d96d83] rounded-full"
        style={{ width: size, height: size }}
      >
        {!webglFailed ? (
          <canvas
            ref={canvasRef}
            style={{
              width: size,
              height: size,
              display: "block",
              filter: "drop-shadow(0 10px 18px rgba(111, 41, 57, 0.15))",
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              width: size,
              height: size,
              display: "block",
              backgroundImage: "url(/mascots/loopy-hello.webp)",
              backgroundSize: "contain",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        )}

        <AnimatePresence>
          {activeBadge && (
            <motion.span
              key={activeBadge}
              initial={{ opacity: 0, scale: 0.4, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.4, y: 4 }}
              transition={{ type: "spring", stiffness: 380, damping: 18 }}
              className="pointer-events-none absolute top-0 right-0 text-base drop-shadow-sm select-none"
            >
              {activeBadge}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
