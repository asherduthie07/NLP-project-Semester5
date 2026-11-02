import { toTable } from './model';
import { resolveToken } from './palette';
import type { VizMode, VizModel } from './types';

/** VisualizationExport. Files carry their provenance, so a demo export cannot pass as a measured result. */
function download(name: string, url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
}
function downloadBlob(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  download(name, url);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (value: string | number) => {
  const text = String(value);
  /** Leading formula characters are neutralized so repository-derived labels cannot execute in a spreadsheet. */
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(model: VizModel): string {
  const table = toTable(model);
  return [`# ${model.title} | ${model.provenance.kind}: ${model.provenance.source}`, table.columns.map(csvCell).join(','), ...table.rows.map(row => row.map(csvCell).join(','))].join('\n');
}

export function exportCsv(model: VizModel) { downloadBlob(`${model.id}.csv`, toCsv(model), 'text/csv'); }
export function exportJson(model: VizModel) { downloadBlob(`${model.id}.json`, JSON.stringify(model, null, 2), 'application/json'); }

/** SVG exports cannot reference page CSS, so design tokens are inlined first. */
function inlineTokens(markup: string): string {
  return markup.replace(/var\((--[\w-]+)\)/g, (_, token: `--${string}`) => resolveToken(token));
}

/** A PNG cannot carry metadata a reader will see, so the title and provenance are drawn into the image. */
const FOOTER_HEIGHT = 22;

function drawFooter(context: CanvasRenderingContext2D, model: VizModel, width: number, top: number, ratio: number) {
  context.fillStyle = resolveToken('--bg-0');
  context.fillRect(0, top, width, FOOTER_HEIGHT * ratio);
  context.fillStyle = resolveToken('--text-mid');
  context.font = `${10 * ratio}px monospace`;
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillText(`${model.title} | ${model.provenance.kind}: ${model.provenance.source}`, 8 * ratio, top + FOOTER_HEIGHT * ratio / 2, width - 16 * ratio);
}

/** 3D labels are DOM elements over the canvas, so they are painted in at their current on-screen positions. */
function drawLabels(context: CanvasRenderingContext2D, stage: HTMLElement, canvas: HTMLCanvasElement, ratio: number) {
  const origin = canvas.getBoundingClientRect();
  stage.querySelectorAll<HTMLElement>('.viz-label').forEach(label => {
    const style = getComputedStyle(label);
    if (style.visibility === 'hidden' || !label.textContent) return;
    const box = label.getBoundingClientRect();
    const x = (box.left - origin.left) * ratio, y = (box.top - origin.top) * ratio;
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      context.fillStyle = style.backgroundColor;
      context.fillRect(x, y, box.width * ratio, box.height * ratio);
    }
    context.fillStyle = style.color;
    context.font = `${style.fontWeight} ${parseFloat(style.fontSize) * ratio}px ${style.fontFamily}`;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillText(label.textContent, x + parseFloat(style.paddingLeft) * ratio, y + box.height * ratio / 2);
  });
}

function outputCanvas(width: number, height: number, ratio: number) {
  const output = document.createElement('canvas');
  output.width = width; output.height = height + Math.round(FOOTER_HEIGHT * ratio);
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas export is unavailable.');
  context.fillStyle = resolveToken('--bg-1');
  context.fillRect(0, 0, output.width, output.height);
  return { output, context };
}

/** The chart surface, never the toolbar or legend icons that share the card. */
function largestSvg(stage: Element): SVGSVGElement | null {
  let best: SVGSVGElement | null = null, area = 0;
  stage.querySelectorAll('svg').forEach(svg => {
    const rect = svg.getBoundingClientRect();
    if (rect.width * rect.height > area) { best = svg; area = rect.width * rect.height; }
  });
  return best;
}

export async function exportPng(root: HTMLElement, model: VizModel, mode: VizMode): Promise<void> {
  const name = `${model.id}-${mode}.png`;
  const stage = root.querySelector<HTMLElement>('.viz-stage-3d, .viz-stage-2d');
  if (!stage) throw new Error('No chart surface to export.');
  const canvas = stage.querySelector('canvas');
  if (canvas && canvas.width > 0) {
    const ratio = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
    const { output, context } = outputCanvas(canvas.width, canvas.height, ratio);
    context.drawImage(canvas, 0, 0);
    drawLabels(context, stage, canvas, ratio);
    drawFooter(context, model, output.width, canvas.height, ratio);
    download(name, output.toDataURL('image/png'));
    return;
  }
  const svg = largestSvg(stage);
  if (!svg) throw new Error('No chart surface to export.');
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(rect.width));
  clone.setAttribute('height', String(rect.height));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(inlineTokens(new XMLSerializer().serializeToString(clone)))}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The chart could not be rasterized.')); image.src = url; });
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
  const { output, context } = outputCanvas(width, height, ratio);
  context.drawImage(image, 0, 0, width, height);
  drawFooter(context, model, width, height, ratio);
  download(name, output.toDataURL('image/png'));
}
