// The WebGL renderer uses WebGL to draw tiles in batches via Vertex Buffer Objects.
// This is the least CPU-intensive drawing method.

import BaseRenderer from './base';
import { TILE_SIZE_PIXELS, PIXEL_SIZE_WORLD } from '../../constants';
import TEAM_COLORS from '../../team_colors';

const { round, floor, ceil } = Math;

const VERTEX_SHADER = `
attribute vec2 aVertexCoord;
attribute vec2 aTextureCoord;
uniform mat4 uTransform;
varying vec2 vTextureCoord;
void main(void) {
  gl_Position = uTransform * vec4(aVertexCoord, 0.0, 1.0);
  vTextureCoord = aTextureCoord;
}`;

const FRAGMENT_SHADER = `
#ifdef GL_ES
precision highp float;
#endif
varying vec2 vTextureCoord;
uniform sampler2D uBase;
uniform sampler2D uStyled;
uniform sampler2D uOverlay;
uniform bool uUseStyled;
uniform bool uIsStyled;
uniform vec3 uStyleColor;
void main(void) {
  if (uUseStyled) {
    vec4 base = texture2D(uStyled, vTextureCoord);
    if (uIsStyled) {
      float alpha = texture2D(uOverlay, vTextureCoord).r;
      gl_FragColor = vec4(mix(base.rgb, uStyleColor, alpha), clamp(base.a + alpha, 0.0, 1.0));
    } else {
      gl_FragColor = base;
    }
  } else {
    gl_FragColor = texture2D(uBase, vTextureCoord);
  }
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw `Could not compile shader: ${gl.getShaderInfoLog(shader)}`;
  }
  return shader;
}

export default class WebglRenderer extends BaseRenderer {
  ctx!: WebGLRenderingContext;
  program!: WebGLProgram;
  aVertexCoord!: number;
  aTextureCoord!: number;
  uTransform!: WebGLUniformLocation;
  uBase!: WebGLUniformLocation;
  uStyled!: WebGLUniformLocation;
  uOverlay!: WebGLUniformLocation;
  uUseStyled!: WebGLUniformLocation;
  uIsStyled!: WebGLUniformLocation;
  uStyleColor!: WebGLUniformLocation;
  transformArray!: Float32Array;
  vertexArray!: Float32Array;
  vertexBuffer!: WebGLBuffer;
  hTileSizeTexture!: number;
  vTileSizeTexture!: number;
  hStyledTileSizeTexture!: number;
  vStyledTileSizeTexture!: number;

  setup(): void {
    try {
      this.ctx = this.canvas.getContext('experimental-webgl') as WebGLRenderingContext;
      void this.ctx.bindBuffer;
    } catch (e: any) {
      throw `Could not initialize WebGL canvas: ${e.message}`;
    }

    const gl = this.ctx;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const imgs = [this.images.base, this.images.styled, this.images.overlay] as HTMLImageElement[];
    for (let i = 0; i < imgs.length; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgs[i]);
    }

    this.hTileSizeTexture         = TILE_SIZE_PIXELS / (this.images.base as HTMLImageElement).width;
    this.vTileSizeTexture         = TILE_SIZE_PIXELS / (this.images.base as HTMLImageElement).height;
    this.hStyledTileSizeTexture   = TILE_SIZE_PIXELS / (this.images.styled as HTMLImageElement).width;
    this.vStyledTileSizeTexture   = TILE_SIZE_PIXELS / (this.images.styled as HTMLImageElement).height;

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, compileShader(gl, gl.VERTEX_SHADER,   VERTEX_SHADER));
    gl.attachShader(this.program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw `Could not link shaders: ${gl.getProgramInfoLog(this.program)}`;
    }
    gl.useProgram(this.program);

    this.aVertexCoord  =  gl.getAttribLocation(this.program,  'aVertexCoord');
    this.aTextureCoord =  gl.getAttribLocation(this.program,  'aTextureCoord');
    this.uTransform    = gl.getUniformLocation(this.program, 'uTransform')!;
    this.uBase         = gl.getUniformLocation(this.program, 'uBase')!;
    this.uStyled       = gl.getUniformLocation(this.program, 'uStyled')!;
    this.uOverlay      = gl.getUniformLocation(this.program, 'uOverlay')!;
    this.uUseStyled    = gl.getUniformLocation(this.program, 'uUseStyled')!;
    this.uIsStyled     = gl.getUniformLocation(this.program, 'uIsStyled')!;
    this.uStyleColor   = gl.getUniformLocation(this.program, 'uStyleColor')!;

    gl.enableVertexAttribArray(this.aVertexCoord);
    gl.enableVertexAttribArray(this.aTextureCoord);

    gl.uniform1i(this.uBase,    0);
    gl.uniform1i(this.uStyled,  1);
    gl.uniform1i(this.uOverlay, 2);

    this.transformArray = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    this.vertexArray = new Float32Array(256 * 6 * 4);

    this.vertexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.vertexAttribPointer(this.aVertexCoord,  2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(this.aTextureCoord, 2, gl.FLOAT, false, 16, 8);
  }

  handleResize(): void {
    super.handleResize();
    this.ctx.viewport(0, 0, window.innerWidth, window.innerHeight);
    this.setTranslation(0, 0);
    this.checkError();
  }

  checkError(): void {
    const gl = this.ctx;
    const err = gl.getError();
    if (err !== gl.NO_ERROR) { throw `WebGL error: ${err}`; }
  }

  setTranslation(px: number, py: number): void {
    const xt = 2 / window.innerWidth;
    const yt = 2 / window.innerHeight;
    const arr = this.transformArray;
    arr[0]  =  xt;
    arr[5]  = -yt;
    arr[12] = px *  xt - 1;
    arr[13] = py * -yt + 1;
    this.ctx.uniformMatrix4fv(this.uTransform, false, arr);
  }

  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {
    const [left, top, width, height] = this.getViewAreaAtWorld(x, y);
    this.setTranslation(-left, -top);
    cb(left, top, width, height);
    this.setTranslation(0, 0);
  }

  bufferTile(buffer: Float32Array, offset: number, tx: number, ty: number, styled: boolean, sdx: number, sdy: number): void {
    let stx: number, sty: number, etx: number, ety: number;
    if (styled) {
      stx = tx * this.hStyledTileSizeTexture;
      sty = ty * this.vStyledTileSizeTexture;
      etx = stx + this.hStyledTileSizeTexture;
      ety = sty + this.vStyledTileSizeTexture;
    } else {
      stx = tx * this.hTileSizeTexture;
      sty = ty * this.vTileSizeTexture;
      etx = stx + this.hTileSizeTexture;
      ety = sty + this.vTileSizeTexture;
    }
    const edx = sdx + TILE_SIZE_PIXELS;
    const edy = sdy + TILE_SIZE_PIXELS;
    buffer.set([
      sdx, sdy, stx, sty,
      sdx, edy, stx, ety,
      edx, sdy, etx, sty,
      sdx, edy, stx, ety,
      edx, sdy, etx, sty,
      edx, edy, etx, ety,
    ], offset * 6 * 4);
  }

  drawTile(tx: number, ty: number, sdx: number, sdy: number): void {
    const gl = this.ctx;
    gl.uniform1i(this.uUseStyled, 0);
    this.bufferTile(this.vertexArray, 0, tx, ty, false, sdx, sdy);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  drawStyledTile(tx: number, ty: number, style: number | undefined, sdx: number, sdy: number): void {
    const gl = this.ctx;
    gl.uniform1i(this.uUseStyled, 1);
    const color = style !== undefined ? TEAM_COLORS[style] : undefined;
    if (color) {
      gl.uniform1i(this.uIsStyled, 1);
      gl.uniform3f(this.uStyleColor, color.r / 255, color.g / 255, color.b / 255);
    } else {
      gl.uniform1i(this.uIsStyled, 0);
    }
    this.bufferTile(this.vertexArray, 0, tx, ty, true, sdx, sdy);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  onRetile(cell: any, tx: number, ty: number): void {
    if (!this.isMineVisibleToPlayer(cell) && cell.mine && !cell.pill && !cell.base) {
      ty -= 10;
    }
    cell.tile = [tx, ty];
  }

  drawMap(sx: number, sy: number, w: number, h: number): void {
    const gl = this.ctx;
    const ex = sx + w - 1;
    const ey = sy + h - 1;

    const stx = floor(sx / TILE_SIZE_PIXELS);
    const sty = floor(sy / TILE_SIZE_PIXELS);
    const etx = ceil(ex  / TILE_SIZE_PIXELS);
    const ety = ceil(ey  / TILE_SIZE_PIXELS);

    const styledCells: Record<number, any[]> = {};
    let arrayTileIndex = 0;
    const maxTiles = this.vertexArray.length / (6 * 4);

    const flushArray = () => {
      if (arrayTileIndex === 0) { return; }
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, arrayTileIndex * 6);
      arrayTileIndex = 0;
    };

    gl.uniform1i(this.uUseStyled, 0);
    this.world.map.each((cell: any) => {
      const obj = cell.pill || cell.base;
      if (obj) {
        let style: number = obj.owner != null ? obj.owner.$.team : 255;
        if (!TEAM_COLORS[style]) { style = 255; }
        if (!styledCells[style]) { styledCells[style] = []; }
        styledCells[style].push(cell);
      } else {
        this.bufferTile(this.vertexArray, arrayTileIndex, cell.tile[0], cell.tile[1], false,
          cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
        if (++arrayTileIndex === maxTiles) { flushArray(); }
      }
    }, stx, sty, etx, ety);
    flushArray();

    gl.uniform1i(this.uUseStyled, 1);
    for (const styleKey in styledCells) {
      const style = Number(styleKey);
      const cells = styledCells[style];
      const color = TEAM_COLORS[style];
      if (color) {
        gl.uniform1i(this.uIsStyled, 1);
        gl.uniform3f(this.uStyleColor, color.r / 255, color.g / 255, color.b / 255);
      } else {
        gl.uniform1i(this.uIsStyled, 0);
      }
      for (const cell of cells) {
        this.bufferTile(this.vertexArray, arrayTileIndex, cell.tile[0], cell.tile[1], true,
          cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
        if (++arrayTileIndex === maxTiles) { flushArray(); }
      }
      flushArray();
    }
  }

  // FIXME
  drawBuilderIndicator(_b: any): void {}
  drawNames(): void {}
}
