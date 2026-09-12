import { paletteTexture } from "./palettes";
import type { PaletteId } from "../types";

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uData;
uniform sampler2D uPalette;
uniform float uOpacity;
uniform float uTime;
in vec2 vUv;
out vec4 frag;

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 d = texture(uData, uv);
  if (d.a < 0.5) {
    frag = vec4(0.0);
    return;
  }
  vec3 col = texture(uPalette, vec2(d.r, 0.5)).rgb;
  float amp = d.g;
  float trend = d.b;
  float pulse = 1.0;
  if (d.r < 0.22) {
    pulse = 0.62 + 0.38 * abs(sin(uTime * 3.4));
  } else if (trend < 0.42) {
    pulse = 0.78 + 0.22 * abs(sin(uTime * 2.1));
  }
  float alpha = uOpacity * clamp(0.18 + amp * 0.75, 0.16, 0.82) * pulse;
  // Premultiplied so the full-window canvas composites as glass, not a grey sheet.
  frag = vec4(col * alpha, alpha);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || "compile");
  }
  return sh;
}

export class OverlayShader {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private dataTex: WebGLTexture;
  private palTex: WebGLTexture;
  private uOpacity: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private cols = 1;
  private rows = 1;

  constructor(canvas: HTMLCanvasElement) {
    canvas.style.background = "transparent";
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 is required");
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog) throw new Error("program");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || "link");
    }
    this.program = prog;
    const buf = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!buf || !vao) throw new Error("vao");
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.dataTex = gl.createTexture()!;
    this.palTex = gl.createTexture()!;
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, "uData"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "uPalette"), 1);
    this.uOpacity = gl.getUniformLocation(prog, "uOpacity")!;
    this.uTime = gl.getUniformLocation(prog, "uTime")!;
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  clear() {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  setPalette(id: PaletteId) {
    const gl = this.gl;
    const pixels = paletteTexture(id);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
  }

  resize(w: number, h: number) {
    const c = this.gl.canvas as HTMLCanvasElement;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  draw(
    overlay: Uint8ClampedArray,
    cols: number,
    rows: number,
    opacity: number,
    timeSec: number,
  ) {
    const gl = this.gl;
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      cols,
      rows,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      overlay,
    );

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1f(this.uOpacity, opacity);
    gl.uniform1f(this.uTime, timeSec);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
