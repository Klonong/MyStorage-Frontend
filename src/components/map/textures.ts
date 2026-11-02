// Canvas-drawn textures for the map: corrugated metal and carrier decals.
// Drawn once per look and cached; the map only runs in the browser.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

const cache = new Map<string, CanvasTexture>();

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

/** Corrugated panel: soft ribs across the texture's width, tiled `repeatX` times. */
export function ribs(base: string, shade: string, repeatX: number, repeatY = 1) {
  const tex = make(`ribs:${base}:${shade}`, 64, 8, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, base);
    g.addColorStop(0.55, base);
    g.addColorStop(0.75, shade);
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 8);
  }).clone();
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

const font = () => getComputedStyle(document.body).fontFamily;

/** Side decal for a truck box: a colour mark and the carrier's name. */
export function carrierDecal(name: string, color: string) {
  return make(`decal:${name}`, 512, 192, (ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(24, 46, 100, 100, 18);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(52, 74, 44, 44, 8);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `700 64px ${font()}`;
    ctx.textBaseline = "middle";
    ctx.fillText(name.split(" ")[0], 148, 100);
  });
}

/** Facade sign with the MyStorage mark. */
export function brandSign() {
  return make("brand-sign", 512, 128, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 128, 24);
    ctx.fill();
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.roundRect(28, 24, 80, 80, 16);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(50, 46, 36, 36);
    ctx.fillStyle = "#1e3a8a";
    ctx.font = `700 56px ${font()}`;
    ctx.textBaseline = "middle";
    ctx.fillText("MyStorage", 130, 66);
  });
}
