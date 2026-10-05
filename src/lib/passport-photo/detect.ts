import type { InferenceSession } from 'onnxruntime-web';
import { loadOrt } from '@/lib/onnx/runtime';
import { PassportPhotoError, type FaceDetection } from './types';

const SIZE = 640;
const STRIDES = [8, 16, 32] as const;
const SCORE_THRESHOLD = 0.6;
const IOU_THRESHOLD = 0.3;
const MAX_FACES = 10;

interface Letterbox {
  pixels: Uint8ClampedArray;
  scale: number;
  offsetX: number;
  offsetY: number;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new PassportPhotoError('This browser wouldn’t provide a 2D canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

function letterbox(source: ImageBitmap): Letterbox {
  const scale = Math.min(SIZE / source.width, SIZE / source.height);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const offsetX = Math.floor((SIZE - width) / 2);
  const offsetY = Math.floor((SIZE - height) / 2);

  const canvas = document.createElement('canvas');
  try {
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = context2d(canvas);
    // Mid grey, not black: a hard edge against the padding pulls false detections to the border
    context.fillStyle = '#808080';
    context.fillRect(0, 0, SIZE, SIZE);
    context.drawImage(source, offsetX, offsetY, width, height);
    return { pixels: context.getImageData(0, 0, SIZE, SIZE).data, scale, offsetX, offsetY };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// Raw 0-255 values in BGR, the channel order YuNet was trained on
function toInput(pixels: Uint8ClampedArray): Float32Array {
  const count = SIZE * SIZE;
  const data = new Float32Array(3 * count);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    data[i] = pixels[p + 2];
    data[count + i] = pixels[p + 1];
    data[2 * count + i] = pixels[p];
  }
  return data;
}

function readFloat32(value: unknown, expected: number, name: string): Float32Array {
  if (!(value instanceof Float32Array) || value.length !== expected) {
    throw new PassportPhotoError(`The face finder returned an unreadable ${name}.`);
  }
  return value;
}

function overlap(a: FaceDetection, b: FaceDetection): number {
  const across = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const down = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const shared = across * down;
  const total = a.width * a.height + b.width * b.height - shared;
  return total > 0 ? shared / total : 0;
}

// Best first, in source pixels; an empty list is a normal answer
export async function detectFaces(
  session: InferenceSession,
  source: ImageBitmap,
  signal?: AbortSignal,
): Promise<FaceDetection[]> {
  const box = letterbox(source);
  if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');

  const runtime = await loadOrt();
  const results = await session.run({
    [session.inputNames[0]]: new runtime.Tensor('float32', toInput(box.pixels), [1, 3, SIZE, SIZE]),
  });
  if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');

  const found: FaceDetection[] = [];
  for (const stride of STRIDES) {
    const cols = SIZE / stride;
    const cells = cols * cols;
    const cls = readFloat32(results[`cls_${stride}`]?.data, cells, 'score');
    const obj = readFloat32(results[`obj_${stride}`]?.data, cells, 'score');
    const boxes = readFloat32(results[`bbox_${stride}`]?.data, cells * 4, 'box');
    const points = readFloat32(results[`kps_${stride}`]?.data, cells * 10, 'landmark');

    for (let cell = 0; cell < cells; cell++) {
      const score = Math.sqrt(
        Math.min(1, Math.max(0, cls[cell])) * Math.min(1, Math.max(0, obj[cell])),
      );
      if (score < SCORE_THRESHOLD) continue;

      const col = cell % cols;
      const row = (cell - col) / cols;
      const b = cell * 4;
      const centreX = (col + boxes[b]) * stride;
      const centreY = (row + boxes[b + 1]) * stride;
      const width = Math.exp(boxes[b + 2]) * stride;
      const height = Math.exp(boxes[b + 3]) * stride;

      const toSourceX = (value: number) => (value - box.offsetX) / box.scale;
      const toSourceY = (value: number) => (value - box.offsetY) / box.scale;

      const marks: [number, number][] = [];
      for (let k = 0; k < 5; k++) {
        marks.push([
          toSourceX((col + points[cell * 10 + k * 2]) * stride),
          toSourceY((row + points[cell * 10 + k * 2 + 1]) * stride),
        ]);
      }

      found.push({
        score,
        x: toSourceX(centreX - width / 2),
        y: toSourceY(centreY - height / 2),
        width: width / box.scale,
        height: height / box.scale,
        points: marks,
      });
    }
  }

  found.sort((a, b) => b.score - a.score);
  const kept: FaceDetection[] = [];
  for (const face of found) {
    if (kept.some((other) => overlap(face, other) > IOU_THRESHOLD)) continue;
    kept.push(face);
    if (kept.length >= MAX_FACES) break;
  }
  return kept;
}

// Tilt is in degrees
export function eyeLine(face: FaceDetection): { x: number; y: number; tiltDegrees: number } {
  const [right, left] = face.points;
  const x = (right[0] + left[0]) / 2;
  const y = (right[1] + left[1]) / 2;
  const tilt = (Math.atan2(left[1] - right[1], left[0] - right[0]) * 180) / Math.PI;
  return { x, y, tiltDegrees: tilt };
}

// Sideways nose drift as a share of the gap between the eyes; 0 is straight on
export function turn(face: FaceDetection): number {
  const [right, left, nose] = face.points;
  const span = Math.hypot(left[0] - right[0], left[1] - right[1]);
  if (span <= 0) return 0;
  const middle = (right[0] + left[0]) / 2;
  return Math.abs(nose[0] - middle) / span;
}
