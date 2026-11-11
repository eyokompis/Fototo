const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
in vec2 a_tex;
out vec2 v_tex;
void main() {
  v_tex = a_tex;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_tex;
out vec4 out_color;
uniform sampler2D u_image;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
void main() {
  vec3 color = texture(u_image, v_tex).rgb;

  color *= pow(2.0, u_exposure);

  color = (color - 0.5) * u_contrast + 0.5;

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, u_saturation);

  color.r *= 1.0 + u_temperature;
  color.b *= 1.0 - u_temperature;

  out_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

export interface Adjustments {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
};

export class ImageProcessor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private width = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.program = this.createProgram();
    this.texture = this.createTexture();
    this.setupGeometry();
    for (const name of ['u_image', 'u_exposure', 'u_contrast', 'u_saturation', 'u_temperature']) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }

  setImage(bitmap: ImageBitmap): void {
    const gl = this.gl;
    this.width = bitmap.width;
    this.canvas.width = bitmap.width;
    this.canvas.height = bitmap.height;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    this.render(DEFAULT_ADJUSTMENTS);
  }

  render(adjustments: Adjustments): void {
    if (this.width === 0) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.u_image!, 0);
    gl.uniform1f(this.uniforms.u_exposure!, adjustments.exposure);
    gl.uniform1f(this.uniforms.u_contrast!, adjustments.contrast);
    gl.uniform1f(this.uniforms.u_saturation!, adjustments.saturation);
    gl.uniform1f(this.uniforms.u_temperature!, adjustments.temperature);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  exportBlob(type = 'image/png'): Promise<Blob | null> {
    return new Promise((resolve) => {
      this.canvas.toBlob(resolve, type);
    });
  }

  private createProgram(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
      }
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed');
    }
    return program;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  private setupGeometry(): void {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
      ]),
      gl.STATIC_DRAW,
    );

    const aPos = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);

    const aTex = gl.getAttribLocation(this.program, 'a_tex');
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);
  }
}
