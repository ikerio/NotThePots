import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Webcam + MediaPipe hand landmarks. Coordinates are normalized video space,
// already mirrored so moving your right hand moves the right hand on screen.
export class HandTracker {
  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.landmarker = null;
    this.stream = null;
    this.lastTs = -1;
    this.hands = [];
  }

  async init() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch (e) {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU'));
    }
  }

  detect() {
    if (!this.landmarker || this.video.readyState < 2) return this.hands;
    const ts = performance.now();
    if (ts <= this.lastTs) return this.hands;
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(this.video, ts);
    this.hands = (res.landmarks || []).map((lms) => {
      const pts = lms.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
      const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
      const size = d(0, 9) || 0.1;
      return { pts, pinch: d(4, 8) / size < 0.38, size };
    });
    return this.hands;
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.landmarker) this.landmarker.close();
    this.landmarker = null;
  }
}

export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
