const canvas = document.getElementById('canvas');
const result = document.getElementById('result');
const log = document.getElementById('log');

const SAMPLE_SIZE = 15;
const CHANGE_TIME = 200;

const H_RED_LOW = 15;      
const H_RED_HIGH = 345;  
const S_RED_MIN = 0.5;     
const V_RED_MAX = 1.0;     
const V_RED_OFF = 0.4;

const H_GREEN_LOW = 85;      
const H_GREEN_HIGH = 150;  
const S_GREEN_MIN = 0.5;     
const V_GREEN_MAX = 1.0;     

const H_YELLOW_LOW = 40;      
const H_YELLOW_HIGH = 65;  
const S_YELLOW_MIN = 0.5;     
const V_YELLOW_MAX = 1.0;

let lastState = "off";
let lastSwitchTime = 0;
let currentStream = null;
let useFrontCamera = true;
let video = null;
let frameTimer = null;

let lastColorLogTime = 0;

const TOLERANCE = 0.5;
let templates = [];
let stateDurations = [];  // zbiera { state, duration }


// załaduj szablony
fetch('templates.json')
  .then(res => res.json())
  .then(data => { templates = data; })
  .catch(err => console.error('templates.json load error:', err));

function changeCamera() {
  useFrontCamera = !useFrontCamera;
  StartCamera();
}

function StartCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  if (frameTimer) {
    clearInterval(frameTimer);
    frameTimer = null;
  }

  const constraints = {
    video: {
      facingMode: useFrontCamera ? 'user' : 'environment',
      width:  { ideal: 800, max: 800 },
      height: { ideal: 600, max: 600  }
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      currentStream = stream;
      if (!video) {
        video = document.createElement('video');
        video.setAttribute('playsinline', '');
      }
      video.srcObject = stream;
      video.play();

      video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        frameTimer = setInterval(() => detectLed(video), 1000 / 33.33);
      });
    })
    .catch(err => {
      log.innerHTML = 'Błąd kamery: ' + err.message;
    });
}

navigator.mediaDevices.enumerateDevices().then(devices => {
  const cams = devices.filter(d => d.kind === 'videoinput');
  const cameraListDiv = document.getElementById('cameraList');
  cameraListDiv.innerHTML = '<strong>Dostępne kamery:</strong><br>';
  cams.forEach((cam, index) => {
    cameraListDiv.innerHTML += `#${index + 1}: ${cam.label || 'Nieznana kamera'}<br>`;
  });
  if (cams.length < 2) document.querySelector('button').style.display = 'none';
  StartCamera();
});

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;

  if (d !== 0) {
    if (max === r) { h = (g - b) / d + (g < b ? 6 : 0); }
    else if (max === g) { h = (b - r) / d + 2; }
    else { h = (r - g) / d + 4; }
    h *= 60;
  }

  return [h, s, v];
}

function isRed(h, s, v) {
  return (h < H_RED_LOW || h > H_RED_HIGH) && s >= S_RED_MIN && v <= V_RED_MAX;
}
function isGreen(h, s, v) {
  return (h > H_GREEN_LOW && h < H_GREEN_HIGH) && s >= S_GREEN_MIN && v <= V_GREEN_MAX;
}
function isYellow(h, s, v) {
  return (h > H_YELLOW_LOW && h < H_YELLOW_HIGH) && s >= S_YELLOW_MIN && v <= V_YELLOW_MAX;
}

function checkTemplates() {
  const seq = stateDurations.map(r => r.duration);
  for (const tpl of templates) {
    if (tpl.durations.length !== seq.length) continue;
    let match = true;
    for (let i = 0; i < seq.length; i++) {
      if (Math.abs(seq[i] - tpl.durations[i]) > TOLERANCE) {
        match = false;
        break;
      }
    }
    if (match) {
      log.innerHTML += `<br><strong>Szablon:</strong> ${tpl.description}`;
      document.getElementById('templateDesc').textContent = tpl.description;
      return;
    }
  }
}

function detectLed(video) {
  const now = performance.now();
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const positions = [
    { x: canvas.width * 0.375, y: canvas.height * 0.5},
    { x: canvas.width * 0.625, y: canvas.height * 0.5},
    { x: canvas.width * 0.125, y: canvas.height * 0.75},
    { x: canvas.width * 0.125, y: canvas.height * (5/6)},
    { x: canvas.width * 0.875, y: canvas.height * 0.75},
    { x: canvas.width * 0.875, y: canvas.height * (5/6)}
  ];

  const hsvResults   = [];
  const redDetected    = [];
  const greenDetected  = [];
  const yellowDetected = [];

  positions.forEach((pos, i) => {
    const data = ctx.getImageData(pos.x, pos.y, SAMPLE_SIZE, SAMPLE_SIZE).data;
    let sumH = 0, sumS = 0, sumV = 0;
    const pxCount = SAMPLE_SIZE * SAMPLE_SIZE;
    for (let p = 0; p < data.length; p += 4) {
      const [h, s, v] = rgbToHsv(data[p], data[p+1], data[p+2]);
      sumH += h; sumS += s; sumV += v;
    }
    const avgH = sumH / pxCount, avgS = sumS / pxCount, avgV = sumV / pxCount;
    hsvResults[i] = { avgH, avgS, avgV };
    redDetected[i] = isRed(avgH, avgS, avgV);
    greenDetected[i] = isGreen(avgH, avgS, avgV);
    yellowDetected[i] = isYellow(avgH, avgS, avgV);

    let drawColor = 'blue';
    if (redDetected[i])    drawColor = 'red';
    else if (greenDetected[i])  drawColor = 'green';
    else if (yellowDetected[i]) drawColor = 'yellow';
    highlightArea(ctx, pos.x, pos.y, SAMPLE_SIZE, drawColor);

    //numer punktu
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      i + 1,
      pos.x + SAMPLE_SIZE / 2,
      pos.y + SAMPLE_SIZE / 2
    );
  });

  log.innerHTML = hsvResults.map((r, i) =>
    `Pole ${i + 1}: H=${r.avgH.toFixed(1)}, S=${r.avgS.toFixed(2)}, V=${r.avgV.toFixed(2)},`
  ).join('<br>');

  if (now - lastColorLogTime > 1000) {
    const symbols = hsvResults.map((_, i) => {
      if (redDetected[i])    return 'R';
      if (yellowDetected[i]) return 'Y';
      if (greenDetected[i])  return 'G';
      return 'O';
    });
    let html = `
      <table>
        <tr>
          <th>Punkt</th>
          <th>Kolor</th>
        </tr>`;
    symbols.forEach((sym, i) => {
      html += `
        <tr>
          <td>${i+1}</td>
          <td>${sym}</td>
        </tr>`;
    });
    html += `</table>`;
    result.innerHTML = html;
    lastColorLogTime = now;
  }
}


function highlightArea(ctx, x, y, size, color = 'blue') {
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function reset() {
  result.textContent = 'Wynik: ';
  stateDurations = [];
  lastState = 'off';
  lastSwitchTime = performance.now();
  document.getElementById('templateDesc').textContent = '';
}
