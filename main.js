const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");
const zoomPanInfo = document.getElementById("zoom-pan-info");

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = "#000000";
let currentLineWidth = 2;
let scale = 1;
let panX = 0;
let panY = 0;
let undoStack = [];
let redoStack = [];
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let currentPath = [];
let smoothingFactor = 0.6;

let isTextMode = false;
let textInput = null;

function toggleTextMode() {
  isTextMode = !isTextMode;
  document.body.style.cursor = isTextMode ? "text" : "default";
}

function handleTextInput(e) {
  if (isTextMode) {
    const [x, y] = getMousePos(canvas, e);
    textInput = document.createElement("input");
    textInput.type = "text";
    textInput.style.position = "absolute";
    textInput.style.left = `${e.clientX}px`;
    textInput.style.top = `${e.clientY}px`;
    textInput.style.font = `${currentLineWidth * 5}px Arial`;
    textInput.style.color = currentColor;
    textInput.style.background = "transparent";
    textInput.style.border = "none";
    textInput.style.outline = "none";
    textInput.style.zIndex = "1000";
    document.body.appendChild(textInput);
    textInput.focus();

    textInput.addEventListener("blur", () => {
      if (textInput.value) {
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, panX * scale, panY * scale);
        ctx.font = `${currentLineWidth * 5}px Arial`;
        ctx.fillStyle = currentColor;
        ctx.fillText(textInput.value, x, y);
        ctx.restore();
        saveCanvasState();
      }
      document.body.removeChild(textInput);
      textInput = null;
    });

    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        textInput.blur();
      }
    });
  }
}

canvas.addEventListener("click", handleTextInput);

const textModeButton = document.createElement("button");
textModeButton.textContent = "T";
textModeButton.classList.add("tool");
textModeButton.addEventListener("click", toggleTextMode);
toolbar.appendChild(textModeButton);

function setCanvasSize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  redrawCanvas();
}

function getMousePos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  return [
    ((evt.clientX - rect.left) * devicePixelRatio) / scale - panX,
    ((evt.clientY - rect.top) * devicePixelRatio) / scale - panY,
  ];
}

function saveCanvasState() {
  undoStack.push(canvas.toDataURL());
  redoStack = [];
}

function redrawCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (undoStack.length > 0) {
    const img = new Image();
    img.onload = function () {
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, panX * scale, panY * scale);
      ctx.drawImage(
        img,
        0,
        0,
        canvas.width / devicePixelRatio,
        canvas.height / devicePixelRatio
      );
      ctx.restore();
    };
    img.src = undoStack[undoStack.length - 1];
  }
}

function startDrawing(e) {
  isDrawing = true;
  [lastX, lastY] = getMousePos(canvas, e);
  currentPath = [[lastX, lastY]];
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
}

function draw(e) {
  if (!isDrawing) return;
  const [x, y] = getMousePos(canvas, e);

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, panX * scale, panY * scale);
  ctx.beginPath();
  const smoothX = lastX + (x - lastX) * smoothingFactor;
  const smoothY = lastY + (y - lastY) * smoothingFactor;

  ctx.moveTo(lastX, lastY);
  ctx.quadraticCurveTo(lastX, lastY, smoothX, smoothY);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentLineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();

  currentPath.push([smoothX, smoothY]);
  [lastX, lastY] = [smoothX, smoothY];
}

function detectArrow(path) {
  if (path.length < 10) return false;

  const [startX, startY] = path[0];
  const [endX, endY] = path[path.length - 1];
  const distance = Math.hypot(endX - startX, endY - startY);

  if (distance < 50) return false;

  const angle = Math.atan2(endY - startY, endX - startX);
  const tolerance = Math.PI / 6;

  let isStraight = true;
  for (let i = 1; i < path.length - 1; i++) {
    const [x, y] = path[i];
    const pointAngle = Math.atan2(y - startY, x - startX);
    if (Math.abs(pointAngle - angle) > tolerance) {
      isStraight = false;
      break;
    }
  }

  if (!isStraight) return false;

  const headLength = Math.min(20, distance * 0.3);
  const headAngle = Math.PI / 6;

  let startHead = false;
  let endHead = false;

  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i];
    const distFromStart = Math.hypot(x - startX, y - startY);
    const distFromEnd = Math.hypot(x - endX, y - endY);

    if (distFromStart < headLength) {
      const pointAngle = Math.atan2(y - startY, x - startX);
      if (Math.abs(pointAngle - angle) > headAngle) {
        startHead = true;
      }
    }

    if (distFromEnd < headLength) {
      const pointAngle = Math.atan2(y - endY, x - endX);
      if (Math.abs(pointAngle - (angle + Math.PI)) > headAngle) {
        endHead = true;
      }
    }

    if (startHead || endHead) break;
  }

  return startHead || endHead;
}

function drawDesignerArrow(startX, startY, endX, endY) {
  const arrowLength = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX);

  // arrow direction
  const [firstX, firstY] = currentPath[0];
  const [lastX, lastY] = currentPath[currentPath.length - 1];
  const isReversed =
    Math.hypot(lastX - startX, lastY - startY) <
    Math.hypot(firstX - startX, firstY - startY);

  if (isReversed) {
    [startX, startY, endX, endY] = [endX, endY, startX, startY];
  }

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, panX * scale, panY * scale);

  // shaft
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  const shaftEndX = endX - 15 * Math.cos(angle);
  const shaftEndY = endY - 15 * Math.sin(angle);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.lineWidth = currentLineWidth * 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = currentColor;
  ctx.stroke();

  // arrowhead
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    shaftEndX - 10 * Math.cos(angle - Math.PI / 6),
    shaftEndY - 10 * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    shaftEndX - 10 * Math.cos(angle + Math.PI / 6),
    shaftEndY - 10 * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = currentColor;
  ctx.fill();

  ctx.restore();
}

function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  ctx.closePath();

  if (detectSquare(currentPath)) {
    eraseOriginalDrawing();
    drawPerfectSquare();
  } else if (detectArrow(currentPath)) {
    eraseArrowPath();
    const [startX, startY] = currentPath[0];
    const [endX, endY] = currentPath[currentPath.length - 1];
    drawDesignerArrow(startX, startY, endX, endY);
  }

  saveCanvasState();
  currentPath = [];
}

function eraseArrowPath() {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, panX * scale, panY * scale);
  ctx.globalCompositeOperation = "destination-out";
  ctx.strokeStyle = "rgba(255, 255, 255, 1)";
  ctx.lineWidth = currentLineWidth + 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(currentPath[0][0], currentPath[0][1]);
  for (let i = 1; i < currentPath.length; i++) {
    ctx.lineTo(currentPath[i][0], currentPath[i][1]);
  }
  ctx.stroke();

  ctx.restore();
}

function detectSquare(path) {
  if (path.length < 4) return false;

  const [startX, startY] = path[0];
  const [endX, endY] = path[path.length - 1];
  const distance = Math.hypot(endX - startX, endY - startY);

  if (distance > 20) return false;

  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = maxX - minX;
  const height = maxY - minY;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);

  return aspectRatio < 1.2;
}

function eraseOriginalDrawing() {
  const xs = currentPath.map((p) => p[0]);
  const ys = currentPath.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = maxX - minX;
  const height = maxY - minY;

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, panX * scale, panY * scale);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(currentPath[0][0], currentPath[0][1]);
  for (let i = 1; i < currentPath.length; i++) {
    ctx.lineTo(currentPath[i][0], currentPath[i][1]);
  }
  ctx.closePath();
  ctx.lineWidth = currentLineWidth + 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawPerfectSquare() {
  const xs = currentPath.map((p) => p[0]);
  const ys = currentPath.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const size = Math.max(maxX - minX, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const borderRadius = Math.min(10, size * 0.1);

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, panX * scale, panY * scale);
  ctx.beginPath();
  ctx.moveTo(centerX - size / 2 + borderRadius, centerY - size / 2);
  ctx.lineTo(centerX + size / 2 - borderRadius, centerY - size / 2);
  ctx.arcTo(
    centerX + size / 2,
    centerY - size / 2,
    centerX + size / 2,
    centerY - size / 2 + borderRadius,
    borderRadius
  );
  ctx.lineTo(centerX + size / 2, centerY + size / 2 - borderRadius);
  ctx.arcTo(
    centerX + size / 2,
    centerY + size / 2,
    centerX + size / 2 - borderRadius,
    centerY + size / 2,
    borderRadius
  );
  ctx.lineTo(centerX - size / 2 + borderRadius, centerY + size / 2);
  ctx.arcTo(
    centerX - size / 2,
    centerY + size / 2,
    centerX - size / 2,
    centerY + size / 2 - borderRadius,
    borderRadius
  );
  ctx.lineTo(centerX - size / 2, centerY - size / 2 + borderRadius);
  ctx.arcTo(
    centerX - size / 2,
    centerY - size / 2,
    centerX - size / 2 + borderRadius,
    centerY - size / 2,
    borderRadius
  );
  ctx.closePath();
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentLineWidth;
  ctx.stroke();
  ctx.restore();
}

function updateZoomPanInfo() {
  zoomPanInfo.textContent = `Zoom: ${Math.round(
    scale * 100
  )}%, Pan: (${Math.round(panX)}, ${Math.round(panY)})`;
}

function toggleDarkMode() {
  document.body.classList.toggle("dark-theme");
  updateCanvasBackground();
}

function updateCanvasBackground() {
  const bgColor = getComputedStyle(document.body).getPropertyValue(
    "--bg-color"
  );
  canvas.style.backgroundColor = bgColor;
}

function undo() {
  if (undoStack.length > 1) {
    redoStack.push(undoStack.pop());
    redrawCanvas();
  }
}
function handleWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const [mouseX, mouseY] = getMousePos(canvas, e);

  const newScale = scale * delta;
  if (newScale > 0.1 && newScale < 10) {
    const scaleChange = newScale - scale;
    panX -= (mouseX * scaleChange) / newScale;
    panY -= (mouseY * scaleChange) / newScale;
    scale = newScale;
    redrawCanvas();
    updateZoomPanInfo();
  }
}

function handleMouseMove(e) {
  if (isDragging) {
    const dx = e.movementX / scale;
    const dy = e.movementY / scale;
    panX += dx;
    panY += dy;
    redrawCanvas();
    updateZoomPanInfo();
  } else {
    draw(e);
  }
}

function handleMouseDown(e) {
  if (e.buttons === 4) {
    // middle mouse button
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  } else {
    startDrawing(e);
  }
}

function handleMouseMove(e) {
  if (isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    panX += dx;
    panY += dy;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    redrawCanvas();
    updateZoomPanInfo();
  } else {
    draw(e);
  }
}

function handleMouseUp() {
  stopDrawing();
  isDragging = false;
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  startDrawing(touch);
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  draw(touch);
});

canvas.addEventListener("touchend", handleMouseUp);

canvas.addEventListener("pointerdown", (e) => {
  startDrawing(e);
  updateLineWidth(e);
});

canvas.addEventListener("pointermove", (e) => {
  draw(e);
  updateLineWidth(e);
});

window.addEventListener("resize", setCanvasSize);
canvas.addEventListener("wheel", handleWheel);
canvas.addEventListener("mousedown", handleMouseDown);
canvas.addEventListener("mousemove", handleMouseMove);
canvas.addEventListener("mouseup", handleMouseUp);
canvas.addEventListener("mouseout", handleMouseUp);

toolbar.addEventListener("click", (e) => {
  if (e.target.id === "pen" || e.target.id === "eraser") {
    document.querySelector(".tool.active").classList.remove("active");
    e.target.classList.add("active");
    currentColor = e.target.id === "pen" ? "#000000" : "#f0f0f0";
  } else if (e.target.id === "dark-mode-toggle") {
    toggleDarkMode();
  }
});

document.getElementById("color-picker").addEventListener("input", (e) => {
  currentColor = e.target.value;
});

document.getElementById("line-width").addEventListener("input", (e) => {
  currentLineWidth = parseInt(e.target.value);
});

document.getElementById("clear").addEventListener("click", () => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  saveCanvasState();
});

document.getElementById("undo").addEventListener("click", undo);

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    undo();
  }
});

document.getElementById("redo").addEventListener("click", () => {
  if (redoStack.length > 0) {
    undoStack.push(redoStack.pop());
    redrawCanvas();
  }
});

document.getElementById("save").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "whiteboard.png";
  link.href = canvas.toDataURL();
  link.click();
});

document.getElementById("load").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = function (event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      const img = new Image();
      img.onload = function () {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          0,
          0,
          canvas.width / devicePixelRatio,
          canvas.height / devicePixelRatio
        );
        ctx.restore();
        saveCanvasState();
      };
      img.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
});

setCanvasSize();
saveCanvasState();
updateZoomPanInfo();
updateCanvasBackground();
