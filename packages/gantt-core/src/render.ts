import type { CameraState, FrameScene } from './core';
import type { FontAtlas } from './font';

const SOLID_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aRect;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aParams;

uniform vec2 uScroll;
uniform vec2 uZoom;
uniform vec2 uViewport;

out vec4 vColor;
out vec2 vLocal;
out vec2 vParams;

void main() {
  vec2 world = aRect.xy + aCorner * aRect.zw;
  vec2 screen = (world - uScroll) * uZoom;
  vec2 ndc = vec2(
    screen.x / uViewport.x * 2.0 - 1.0,
    1.0 - screen.y / uViewport.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  vColor = aColor;
  vLocal = aCorner;
  vParams = aParams;
}
`;

const SOLID_FRAGMENT = `#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vLocal;
in vec2 vParams;

out vec4 outColor;

void main() {
  float kind = vParams.x;
  float emphasis = vParams.y;

  if (kind > 0.5) {
    vec2 p = vLocal * 2.0 - 1.0;
    if (abs(p.x) + abs(p.y) > 1.0) {
      discard;
    }
  }

  float edge = min(min(vLocal.x, vLocal.y), min(1.0 - vLocal.x, 1.0 - vLocal.y));
  float stroke = smoothstep(0.0, 0.06, edge);
  vec3 fill = mix(vColor.rgb * 0.88, vColor.rgb, stroke);

  if (emphasis > 0.0) {
    fill = mix(fill, vec3(1.0), 0.12 * emphasis);
  }

  outColor = vec4(fill, vColor.a);
}
`;

const LINE_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aLine;
layout(location = 2) in vec4 aColor;
layout(location = 3) in float aThickness;

uniform vec2 uScroll;
uniform vec2 uZoom;
uniform vec2 uViewport;

out vec4 vColor;
out float vDistanceFromCenter;
out float vHalfThickness;

void main() {
  vec2 p1 = (aLine.xy - uScroll) * uZoom;
  vec2 p2 = (aLine.zw - uScroll) * uZoom;
  vec2 delta = p2 - p1;
  float len = max(length(delta), 0.0001);
  vec2 dir = delta / len;
  vec2 perp = vec2(-dir.y, dir.x);
  float halfThickness = aThickness * 0.5;
  float expandedHalfThickness = halfThickness + 1.0;

  float side = aCorner.x * 2.0 - 1.0;
  float t = aCorner.y;
  vec2 screen = mix(p1, p2, t) + perp * side * expandedHalfThickness;
  vec2 ndc = vec2(
    screen.x / uViewport.x * 2.0 - 1.0,
    1.0 - screen.y / uViewport.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  vColor = aColor;
  vDistanceFromCenter = side * expandedHalfThickness;
  vHalfThickness = halfThickness;
}
`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;

in vec4 vColor;
in float vDistanceFromCenter;
in float vHalfThickness;
out vec4 outColor;

void main() {
  float edgeDistance = abs(vDistanceFromCenter) - vHalfThickness;
  float alpha = 1.0 - smoothstep(0.0, 1.0, edgeDistance);
  if (alpha <= 0.0) {
    discard;
  }
  outColor = vec4(vColor.rgb, vColor.a * alpha);
}
`;

const TEXT_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aRect;
layout(location = 2) in vec4 aUv;
layout(location = 3) in vec4 aColor;

uniform vec2 uViewport;

out vec2 vUv;
out vec4 vColor;

void main() {
  vec2 screen = aRect.xy + aCorner * aRect.zw;
  vec2 ndc = vec2(
    screen.x / uViewport.x * 2.0 - 1.0,
    1.0 - screen.y / uViewport.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  vUv = mix(aUv.xy, aUv.zw, aCorner);
  vColor = aColor;
}
`;

const TEXT_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform int uMode;
uniform float uPxRange;
uniform vec2 uAtlasSize;

in vec2 vUv;
in vec4 vColor;

out vec4 outColor;

float median(vec3 v) {
  return max(min(v.r, v.g), min(max(v.r, v.g), v.b));
}

float screenPxRange() {
  vec2 unitRange = vec2(uPxRange) / uAtlasSize;
  vec2 screenTexSize = vec2(1.0) / fwidth(vUv);
  return max(0.5 * dot(unitRange, screenTexSize), 1.0);
}

void main() {
  vec4 tex = texture(uAtlas, vUv);
  float alpha = tex.a;

  if (uMode == 1) {
    float sd = median(tex.rgb);
    float screenPxDistance = screenPxRange() * (sd - 0.5);
    alpha = clamp(screenPxDistance + 0.5, 0.0, 1.0);
  }

  outColor = vec4(vColor.rgb, vColor.a * alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Unable to create WebGL shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }

  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Unable to create WebGL program.');
  }

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }

  return program;
}

function createFloatBuffer(gl: WebGL2RenderingContext, data: Float32Array, usage = gl.DYNAMIC_DRAW): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Unable to create WebGL buffer.');
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return buffer;
}

function createIndexBuffer(gl: WebGL2RenderingContext, data: Uint16Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Unable to create WebGL index buffer.');
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function setupCommonQuad(gl: WebGL2RenderingContext): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ebo: WebGLBuffer } {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error('Unable to create WebGL VAO.');
  }

  const vbo = createFloatBuffer(
    gl,
    new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]),
    gl.STATIC_DRAW,
  );
  const ebo = createIndexBuffer(gl, new Uint16Array([0, 1, 2, 0, 2, 3]));

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bindVertexArray(null);

  return { vao, vbo, ebo };
}

function setInstancedAttribute(
  gl: WebGL2RenderingContext,
  location: number,
  size: number,
  strideBytes: number,
  offsetBytes: number,
): void {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, strideBytes, offsetBytes);
  gl.vertexAttribDivisor(location, 1);
}

export class GanttRenderer {
  private readonly solidProgram: WebGLProgram;
  private readonly lineProgram: WebGLProgram;
  private readonly textProgram: WebGLProgram;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly solidVao: WebGLVertexArrayObject;
  private readonly lineVao: WebGLVertexArrayObject;
  private readonly textVao: WebGLVertexArrayObject;
  private readonly solidBuffer: WebGLBuffer;
  private readonly lineBuffer: WebGLBuffer;
  private readonly textBuffer: WebGLBuffer;
  private readonly atlasTexture: WebGLTexture;
  private atlasSource: FontAtlas | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.solidProgram = createProgram(gl, SOLID_VERTEX, SOLID_FRAGMENT);
    this.lineProgram = createProgram(gl, LINE_VERTEX, LINE_FRAGMENT);
    this.textProgram = createProgram(gl, TEXT_VERTEX, TEXT_FRAGMENT);

    const quad = setupCommonQuad(gl);
    this.quadVao = quad.vao;

    const solidVao = gl.createVertexArray();
    const lineVao = gl.createVertexArray();
    const textVao = gl.createVertexArray();
    if (!solidVao || !lineVao || !textVao) {
      throw new Error('Unable to create WebGL VAO.');
    }

    this.solidVao = solidVao;
    this.lineVao = lineVao;
    this.textVao = textVao;

    this.solidBuffer = gl.createBuffer() as WebGLBuffer;
    this.lineBuffer = gl.createBuffer() as WebGLBuffer;
    this.textBuffer = gl.createBuffer() as WebGLBuffer;

    if (!this.solidBuffer || !this.lineBuffer || !this.textBuffer) {
      throw new Error('Unable to create WebGL instance buffers.');
    }

    gl.bindVertexArray(this.solidVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad.ebo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.solidBuffer);
    setInstancedAttribute(gl, 1, 4, 40, 0);
    setInstancedAttribute(gl, 2, 4, 40, 16);
    setInstancedAttribute(gl, 3, 2, 40, 32);
    gl.bindVertexArray(null);

    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad.ebo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    setInstancedAttribute(gl, 1, 4, 36, 0);
    setInstancedAttribute(gl, 2, 4, 36, 16);
    setInstancedAttribute(gl, 3, 1, 36, 32);
    gl.bindVertexArray(null);

    gl.bindVertexArray(this.textVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad.ebo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
    setInstancedAttribute(gl, 1, 4, 48, 0);
    setInstancedAttribute(gl, 2, 4, 48, 16);
    setInstancedAttribute(gl, 3, 4, 48, 32);
    gl.bindVertexArray(null);

    const atlasTexture = gl.createTexture();
    if (!atlasTexture) {
      throw new Error('Unable to create font atlas texture.');
    }
    this.atlasTexture = atlasTexture;

    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
  }

  private uploadAtlas(atlas: FontAtlas): void {
    if (this.atlasSource === atlas) {
      return;
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.atlasSource = atlas;
  }

  private setCommonUniforms(program: WebGLProgram, camera: CameraState): void {
    const gl = this.gl;
    const scroll = gl.getUniformLocation(program, 'uScroll');
    const zoom = gl.getUniformLocation(program, 'uZoom');
    const viewport = gl.getUniformLocation(program, 'uViewport');

    if (scroll) {
      gl.uniform2f(scroll, camera.scrollX, camera.scrollY);
    }
    if (zoom) {
      gl.uniform2f(zoom, camera.zoomX, camera.zoomY);
    }
    if (viewport) {
      gl.uniform2f(viewport, camera.viewportWidth, camera.viewportHeight);
    }
  }

  render(frame: FrameScene, camera: CameraState, atlas: FontAtlas): void {
    const gl = this.gl;
    this.uploadAtlas(atlas);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.05, 0.07, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (frame.backgroundSolids.count > 0) {
      gl.useProgram(this.solidProgram);
      this.setCommonUniforms(this.solidProgram, camera);
      gl.bindVertexArray(this.solidVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.solidBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.backgroundSolids.view(), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, frame.backgroundSolids.count);
    }

    if (frame.backgroundLines.count > 0) {
      gl.useProgram(this.lineProgram);
      this.setCommonUniforms(this.lineProgram, camera);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.backgroundLines.view(), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, frame.backgroundLines.count);
    }

    if (frame.dependencyLines.count > 0) {
      gl.useProgram(this.lineProgram);
      this.setCommonUniforms(this.lineProgram, camera);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.dependencyLines.view(), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, frame.dependencyLines.count);
    }

    if (frame.foregroundSolids.count > 0) {
      gl.useProgram(this.solidProgram);
      this.setCommonUniforms(this.solidProgram, camera);
      gl.bindVertexArray(this.solidVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.solidBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.foregroundSolids.view(), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, frame.foregroundSolids.count);
    }

    if (frame.glyphs.count > 0) {
      gl.useProgram(this.textProgram);
      this.setCommonUniforms(this.textProgram, camera);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

      const atlasUniform = gl.getUniformLocation(this.textProgram, 'uAtlas');
      const modeUniform = gl.getUniformLocation(this.textProgram, 'uMode');
      const rangeUniform = gl.getUniformLocation(this.textProgram, 'uPxRange');
      const sizeUniform = gl.getUniformLocation(this.textProgram, 'uAtlasSize');

      if (atlasUniform) {
        gl.uniform1i(atlasUniform, 0);
      }
      if (modeUniform) {
        gl.uniform1i(modeUniform, atlas.mode === 'msdf' ? 1 : 0);
      }
      if (rangeUniform) {
        gl.uniform1f(rangeUniform, atlas.pxRange);
      }
      if (sizeUniform) {
        gl.uniform2f(sizeUniform, atlas.width, atlas.height);
      }

      gl.bindVertexArray(this.textVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.glyphs.view(), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, frame.glyphs.count);
    }

    gl.bindVertexArray(null);
    gl.useProgram(null);
  }
}
