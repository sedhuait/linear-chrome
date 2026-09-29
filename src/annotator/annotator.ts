type Tool = 'box' | 'arrow' | 'pen' | 'blur' | 'text';

interface Point {
  x: number;
  y: number;
}

class ScreenshotAnnotator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentTool: Tool = 'box';
  private currentColor = '#EB5757';
  private lineWidth = 3;

  private isDrawing = false;
  private startPoint: Point = { x: 0, y: 0 };
  private history: ImageData[] = [];
  private baseImage: HTMLImageElement | null = null;

  constructor() {
    this.canvas = document.getElementById('paint-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    this.initEvents();
    this.loadScreenshot();
  }

  private async loadScreenshot(): Promise<void> {
    const data = await chrome.storage.local.get(['temp_annotator_image']);
    const src = data.temp_annotator_image;

    if (!src) {
      this.showToast('No screenshot found to annotate.');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.baseImage = img;
      this.canvas.width = img.width;
      this.canvas.height = img.height;

      // Draw base image
      this.ctx.drawImage(img, 0, 0);
      this.saveHistoryState();
    };
    img.src = src;
  }

  private initEvents(): void {
    // Tool buttons
    const tools: Record<string, Tool> = {
      'tool-box': 'box',
      'tool-arrow': 'arrow',
      'tool-pen': 'pen',
      'tool-blur': 'blur',
      'tool-text': 'text',
    };

    for (const [id, tool] of Object.entries(tools)) {
      const btn = document.getElementById(id);
      btn?.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = tool;
      });
    }

    // Color pickers
    document.querySelectorAll('.color-dot').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
        target.classList.add('active');
        this.currentColor = target.dataset.color || '#EB5757';
      });
    });

    // Undo & Clear
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-clear')?.addEventListener('click', () => this.clearAll());

    // Save & Discard
    document.getElementById('btn-save')?.addEventListener('click', () => this.saveAndFinish());
    document.getElementById('btn-cancel')?.addEventListener('click', () => window.close());

    // Canvas drawing events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      }
    });
  }

  private getCanvasPoint(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private saveHistoryState(): void {
    if (this.ctx) {
      const state = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.history.push(state);
      if (this.history.length > 25) {
        this.history.shift(); // keep last 25 states
      }
    }
  }

  private restoreLastState(): void {
    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      this.ctx.putImageData(last, 0, 0);
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.baseImage) return;
    this.isDrawing = true;
    this.startPoint = this.getCanvasPoint(e);

    if (this.currentTool === 'text') {
      this.handleTextInput(this.startPoint);
      this.isDrawing = false;
      return;
    }

    if (this.currentTool === 'pen') {
      this.ctx.beginPath();
      this.ctx.moveTo(this.startPoint.x, this.startPoint.y);
      this.ctx.strokeStyle = this.currentColor;
      this.ctx.lineWidth = this.lineWidth;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDrawing) return;
    const current = this.getCanvasPoint(e);

    if (this.currentTool === 'pen') {
      this.ctx.lineTo(current.x, current.y);
      this.ctx.stroke();
      return;
    }

    // Live preview for shape tools: restore last state then draw temporary shape
    this.restoreLastState();

    if (this.currentTool === 'box') {
      this.drawBox(this.startPoint, current);
    } else if (this.currentTool === 'arrow') {
      this.drawArrow(this.startPoint, current);
    } else if (this.currentTool === 'blur') {
      this.drawRedactBox(this.startPoint, current, true);
    }
  }

  private onMouseUp(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.saveHistoryState();
  }

  private drawBox(p1: Point, p2: Point): void {
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);

    this.ctx.save();
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.restore();
  }

  private drawArrow(from: Point, to: Point): void {
    const headLength = 16;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    this.ctx.save();
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.fillStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = 'round';

    // Main line
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();

    // Arrowhead
    this.ctx.beginPath();
    this.ctx.moveTo(to.x, to.y);
    this.ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawRedactBox(p1: Point, p2: Point, isPreview: boolean): void {
    const x = Math.round(Math.min(p1.x, p2.x));
    const y = Math.round(Math.min(p1.y, p2.y));
    const w = Math.round(Math.abs(p2.x - p1.x));
    const h = Math.round(Math.abs(p2.y - p1.y));

    if (w <= 0 || h <= 0) return;

    this.ctx.save();
    if (isPreview) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(x, y, w, h);
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(x, y, w, h);
    } else {
      // Solid black redaction box
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(x, y, w, h);
    }
    this.ctx.restore();
  }

  private handleTextInput(pos: Point): void {
    const text = prompt('Enter annotation text:');
    if (!text || text.trim() === '') return;

    this.ctx.save();
    this.ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textMetrics = this.ctx.measureText(text);
    const padding = 8;
    const boxWidth = textMetrics.width + padding * 2;
    const boxHeight = 28;

    // Draw label background badge
    this.ctx.fillStyle = this.currentColor;
    this.ctx.beginPath();
    this.ctx.roundRect(pos.x, pos.y - boxHeight + 4, boxWidth, boxHeight, 4);
    this.ctx.fill();

    // Draw label text in contrasting color
    this.ctx.fillStyle = this.currentColor === '#FFFFFF' ? '#000000' : '#FFFFFF';
    this.ctx.fillText(text, pos.x + padding, pos.y - 6);

    this.ctx.restore();
    this.saveHistoryState();
  }

  private undo(): void {
    if (this.history.length > 1) {
      this.history.pop(); // Remove current state
      const prev = this.history[this.history.length - 1];
      this.ctx.putImageData(prev, 0, 0);
    }
  }

  private clearAll(): void {
    if (this.baseImage) {
      this.ctx.drawImage(this.baseImage, 0, 0);
      this.history = [];
      this.saveHistoryState();
    }
  }

  private async saveAndFinish(): Promise<void> {
    const dataUrl = this.canvas.toDataURL('image/png');
    await chrome.storage.local.set({
      pending_screenshot: dataUrl,
      pending_screenshot_annotated: true,
    });

    this.showToast('Saved annotated screenshot! You can now close this tab.');
    setTimeout(() => {
      window.close();
    }, 800);
  }

  private showToast(msg: string): void {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3000);
    }
  }
}

// Instantiate on page load
window.addEventListener('DOMContentLoaded', () => {
  new ScreenshotAnnotator();
});
