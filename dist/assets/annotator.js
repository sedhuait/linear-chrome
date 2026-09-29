import { r as reactExports, j as jsxRuntimeExports, S as Square, M as MoveRight, P as PenTool, E as EyeOff, T as Type, U as Undo2, a as Trash, X, C as Check, b as StorageService, R as ReactDOM, c as React } from "./storage.js";
const COLORS = [
  { hex: "#EB5757", label: "Bug Red" },
  { hex: "#F2994A", label: "Orange" },
  { hex: "#5E6AD2", label: "Linear Indigo" },
  { hex: "#27AE60", label: "Green" },
  { hex: "#FFFFFF", label: "White" }
];
const AnnotatorApp = () => {
  const canvasRef = reactExports.useRef(null);
  const [currentTool, setCurrentTool] = reactExports.useState("box");
  const [currentColor, setCurrentColor] = reactExports.useState("#EB5757");
  const [canUndo, setCanUndo] = reactExports.useState(false);
  const [toast, setToast] = reactExports.useState(null);
  const baseImageRef = reactExports.useRef(null);
  const historyRef = reactExports.useRef([]);
  const isDrawingRef = reactExports.useRef(false);
  const startPointRef = reactExports.useRef({ x: 0, y: 0 });
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3e3);
  };
  const saveHistoryState = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(state);
    if (historyRef.current.length > 25) {
      historyRef.current.shift();
    }
    setCanUndo(historyRef.current.length > 1);
  }, []);
  const restoreLastState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || historyRef.current.length === 0) return;
    const last = historyRef.current[historyRef.current.length - 1];
    ctx.putImageData(last, 0, 0);
  };
  reactExports.useEffect(() => {
    async function load() {
      const data = await chrome.storage.local.get(["temp_annotator_image"]);
      const src = data.temp_annotator_image;
      if (!src) {
        showToast("No screenshot found to annotate.");
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        baseImageRef.current = img;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          saveHistoryState();
        }
      };
      img.src = src;
    }
    load();
  }, [saveHistoryState]);
  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };
  const handleMouseDown = (e) => {
    if (!baseImageRef.current) return;
    isDrawingRef.current = true;
    const pt = getCanvasPoint(e);
    startPointRef.current = pt;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    if (currentTool === "text") {
      const text = prompt("Enter annotation note:");
      if (text && text.trim()) {
        ctx.save();
        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const metrics = ctx.measureText(text);
        const padding = 8;
        const boxWidth = metrics.width + padding * 2;
        const boxHeight = 28;
        ctx.fillStyle = currentColor;
        ctx.beginPath();
        ctx.roundRect(pt.x, pt.y - boxHeight + 4, boxWidth, boxHeight, 4);
        ctx.fill();
        ctx.fillStyle = currentColor === "#FFFFFF" ? "#000000" : "#FFFFFF";
        ctx.fillText(text, pt.x + padding, pt.y - 6);
        ctx.restore();
        saveHistoryState();
      }
      isDrawingRef.current = false;
      return;
    }
    if (currentTool === "pen") {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  };
  const handleMouseMove = (e) => {
    if (!isDrawingRef.current) return;
    const current = getCanvasPoint(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    if (currentTool === "pen") {
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
      return;
    }
    restoreLastState();
    if (currentTool === "box") {
      const x = Math.min(startPointRef.current.x, current.x);
      const y = Math.min(startPointRef.current.y, current.y);
      const w = Math.abs(current.x - startPointRef.current.x);
      const h = Math.abs(current.y - startPointRef.current.y);
      ctx.save();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    } else if (currentTool === "arrow") {
      const headLength = 16;
      const dx = current.x - startPointRef.current.x;
      const dy = current.y - startPointRef.current.y;
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.strokeStyle = currentColor;
      ctx.fillStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startPointRef.current.x, startPointRef.current.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(current.x, current.y);
      ctx.lineTo(
        current.x - headLength * Math.cos(angle - Math.PI / 6),
        current.y - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        current.x - headLength * Math.cos(angle + Math.PI / 6),
        current.y - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (currentTool === "blur") {
      const x = Math.min(startPointRef.current.x, current.x);
      const y = Math.min(startPointRef.current.y, current.y);
      const w = Math.abs(current.x - startPointRef.current.x);
      const h = Math.abs(current.y - startPointRef.current.y);
      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  };
  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    saveHistoryState();
  };
  const handleUndo = () => {
    if (historyRef.current.length > 1) {
      historyRef.current.pop();
      const prev = historyRef.current[historyRef.current.length - 1];
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      if (ctx && prev) {
        ctx.putImageData(prev, 0, 0);
      }
      setCanUndo(historyRef.current.length > 1);
    }
  };
  const handleClear = () => {
    if (!baseImageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(baseImageRef.current, 0, 0);
      historyRef.current = [];
      saveHistoryState();
    }
  };
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    await chrome.storage.local.set({
      pending_screenshot: dataUrl,
      pending_screenshot_annotated: true
    });
    const draft = await StorageService.getDraft();
    if (draft) {
      await StorageService.saveDraft({
        ...draft,
        screenshot: dataUrl,
        isAnnotated: true,
        updatedAt: Date.now()
      });
    }
    showToast("Saved annotated screenshot! Click the Linear extension to continue.");
    setTimeout(() => window.close(), 700);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "annotator-app", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "annotator-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "brand", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 128 128", width: "22", height: "22", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "8", y: "8", width: "112", height: "112", rx: "28", fill: "#5E6AD2" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "64", cy: "64", r: "32", stroke: "#FFFFFF", strokeWidth: "6", fill: "none" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "64", cy: "64", r: "14", fill: "#FFFFFF" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "94", cy: "34", r: "7", fill: "#38EF7D" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "brand-title", children: "Linear Annotator" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "toolbar", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: `tool-btn ${currentTool === "box" ? "active" : ""}`,
            onClick: () => setCurrentTool("box"),
            title: "Box (B)",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { size: 16 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Box" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: `tool-btn ${currentTool === "arrow" ? "active" : ""}`,
            onClick: () => setCurrentTool("arrow"),
            title: "Arrow (A)",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(MoveRight, { size: 16 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Arrow" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: `tool-btn ${currentTool === "pen" ? "active" : ""}`,
            onClick: () => setCurrentTool("pen"),
            title: "Pen (P)",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(PenTool, { size: 16 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Pen" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: `tool-btn ${currentTool === "blur" ? "active" : ""}`,
            onClick: () => setCurrentTool("blur"),
            title: "Redact / Blackout PII (R)",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(EyeOff, { size: 16 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Redact" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: `tool-btn ${currentTool === "text" ? "active" : ""}`,
            onClick: () => setCurrentTool("text"),
            title: "Text (T)",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Type, { size: 16 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Text" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "divider" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "color-picker-group", children: COLORS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: `color-dot ${currentColor === c.hex ? "active" : ""}`,
            style: { backgroundColor: c.hex },
            onClick: () => setCurrentColor(c.hex),
            title: c.label
          },
          c.hex
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "divider" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "action-btn",
            onClick: handleUndo,
            disabled: !canUndo,
            title: "Undo",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { size: 16 })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "action-btn",
            onClick: handleClear,
            title: "Clear all annotations",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash, { size: 16 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "header-right", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: "btn btn-secondary",
            onClick: () => window.close(),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 14 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Discard" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: "btn btn-primary",
            onClick: handleSave,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { size: 14 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Save & Use" })
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "canvas-workspace", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "canvas-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "canvas",
      {
        ref: canvasRef,
        id: "paint-canvas",
        onMouseDown: handleMouseDown,
        onMouseMove: handleMouseMove,
        onMouseUp: handleMouseUp
      }
    ) }) }),
    toast && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "toast", children: toast })
  ] });
};
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(AnnotatorApp, {}) })
  );
}
