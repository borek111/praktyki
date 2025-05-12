const canvas = document.getElementById('canvas');
const result = document.getElementById('result');
const log = document.getElementById('log');

const SAMPLE_SIZE = 20;
const MAX_LENGTH = 100;
const CHANGE_TIME = 200;

// progi w przestrzeni HSV
const H_RED_LOW = 15;      // stopnie
const H_RED_HIGH = 345;    // stopnie
const S_RED_MIN = 0.5;     // [0..1]
const V_RED_MAX = 1.0;     // [0..1]
const V_OFF = 0.4;         // poniżej tego V uznajemy "off"

let lastState = "off";
let lastSwitchTime = 0;
let currentStream = null;
let useFrontCamera = true;
let video = null;
let frameTimer = null;

function changeCamera() {
  useFrontCamera = !useFrontCamera;
  StartCamera();
}

function StartCamera() {
  // zatrzymaj poprzedni stream
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  if (frameTimer) {
    clearInterval(frameTimer);
    frameTimer = null;
  }

  const constraints = {
    video: { facingMode: useFrontCamera ? 'user' : 'environment' }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      currentStream = stream;

      if (!video) {
        video = document.createElement('video');
        video.setAttribute('playsinline', ''); // for iOS
      }
      video.srcObject = stream;
      video.play();

      video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        frameTimer = setInterval(() => detectLed(video), 1000 / 30);
      });
    })
    .catch(err => {
      log.innerHTML = 'Błąd kamery: ' + err.message;
    });
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = (max === 0 ? 0 : d / max), v = max;

  if (d !== 0) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, v];
}

function isRed(h, s, v) {
  return (
    (h < H_RED_LOW || h > H_RED_HIGH) &&
    s >= S_RED_MIN &&
    v <= V_RED_MAX
  );
}

function detectLed(video) {
  const now = performance.now();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const x = (canvas.width - SAMPLE_SIZE) / 2;
  const y = (canvas.height - SAMPLE_SIZE) / 2;
  const data = ctx.getImageData(x, y, SAMPLE_SIZE, SAMPLE_SIZE).data;

  let sumH = 0, sumS = 0, sumV = 0;
  const pxCount = SAMPLE_SIZE * SAMPLE_SIZE;

  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    sumH += h;
    sumS += s;
    sumV += v;
  }

  const avgH = sumH / pxCount;
  const avgS = sumS / pxCount;
  const avgV = sumV / pxCount;

  log.innerHTML =
    `Avg H: ${avgH.toFixed(1)}<br>` +
    `Avg S: ${avgS.toFixed(2)}<br>` +
    `Avg V: ${avgV.toFixed(2)}<br>` +
    `Red Detected: ${isRed(avgH, avgS, avgV)}`;

  let currentState = lastState;
  if (lastState === 'off' && isRed(avgH, avgS, avgV)) {
    currentState = 'on';
  } else if (lastState === 'on' && avgV < V_OFF) {
    currentState = 'off';
  }

  if (currentState !== lastState && (now - lastSwitchTime) > CHANGE_TIME) {
    result.textContent += currentState === 'on' ? '-' : '/';
    if (result.textContent.length > MAX_LENGTH) {
      result.textContent = result.textContent.slice(-MAX_LENGTH);
    }
    lastState = currentState;
    lastSwitchTime = now;
  }

  highlightArea(ctx, x, y, SAMPLE_SIZE);
}

function highlightArea(ctx, x, y, size) {
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'blue';
  ctx.stroke();
}

navigator.mediaDevices.enumerateDevices().then(devices => {
  const cams = devices.filter(d => d.kind === 'videoinput');
  if (cams.length < 2) {
    document.querySelector('button').style.display = 'none';
  }
  StartCamera();
});
