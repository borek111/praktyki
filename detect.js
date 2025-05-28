const canvas = document.getElementById('canvas');
const result = document.getElementById('result');
const log = document.getElementById('log');

let sampleSize = 15;

const H_RED_LOW = 15;      
const H_RED_HIGH = 345;  
const S_RED_MIN = 0.5;     
const V_RED_MAX = 1.0;
const V_RED_MIN = 0.25;     

const H_GREEN_LOW = 80;      
const H_GREEN_HIGH = 130;  
const S_GREEN_MIN = 0.5;     
const V_GREEN_MAX = 1.0;
const V_GREEN_MIN = 0.25;     

const H_YELLOW_LOW = 45;      
const H_YELLOW_HIGH = 60;  
const S_YELLOW_MIN = 0.5;     
const V_YELLOW_MAX = 1.0; 
const V_YELLOW_MIN = 0.25;

let lastState = "off";
let lastSwitchTime = 0;
let currentStream = null;
let useFrontCamera = true;
let video = null;
let frameTimer = null;

let lastColorLogTime = 0;

const TOLERANCE = 0.5;
let templates = [];
let stateDurations = []; // zbiera { state, duration }

let positions = [];       
let dragIndex = -1; // indeks przeciąganego pkt
const HANDLE_SIZE = 10; // dodatkowy margines zlapania pkt

let pointTrackingState = [];

//zmiana wartosci badanego obszaru
let sampleSizeRange = document.getElementById("sampleSizeRange");
let sampleSizeText = document.getElementById("sampleSizeText");
sampleSizeRange.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  sampleSize = val
  sampleSizeText.innerHTML = "Obecna wartość to: "+ val;

})

// załaduj szablony
fetch('templates.json')
  .then(res => res.json())
  .then(data => { templates = data; })
  .catch(err => console.error('templates.json load error:', err));

function changeCamera() {
  useFrontCamera = !useFrontCamera;
  StartCamera();
}

const changeCameraButton = document.getElementById("changeCameraButton");
changeCameraButton.addEventListener('click',changeCamera);

function StartCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    clearInterval(frameTimer);
  }

  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: useFrontCamera ? 'user' : 'environment',
      width:  { ideal: 800, max: 800 },
      height: { ideal: 600, max: 600 }
    }
  })
  .then(stream => {
    currentStream = stream;
    if (!video) {
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
    }
    video.srcObject = stream;
    video.play();

    video.addEventListener('loadedmetadata', () => {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;

      positions = [
        { x: canvas.width * 0.375, y: canvas.height * 0.5   },
        { x: canvas.width * 0.625, y: canvas.height * 0.5   },
        { x: canvas.width * 0.125, y: canvas.height * 0.75  },
        { x: canvas.width * 0.125, y: canvas.height * (5/6)},
        { x: canvas.width * 0.875, y: canvas.height * 0.75  },
        { x: canvas.width * 0.875, y: canvas.height * (5/6)}
      ];

      // eventy do przeciągania punktów
      canvas.addEventListener('mousedown', startDrag);
      canvas.addEventListener('mousemove', doDrag);
      canvas.addEventListener('mouseup',   endDrag);

      canvas.addEventListener('touchstart', e => startDrag(e.touches[0]));
      canvas.addEventListener('touchmove',  e => { doDrag(e.touches[0]); e.preventDefault(); });
      canvas.addEventListener('touchend',   endDrag);

      frameTimer = setInterval(() => detectLed(video), 1000 / 33.33);
    });
  })
  .catch(err => {
    log.innerText = 'Błąd kamery: ' + err.message;
  });
}

navigator.mediaDevices.enumerateDevices().then(devices => {
  const cams = devices.filter(d => d.kind === 'videoinput');
  const cameraListDiv = document.getElementById('cameraList');
  cameraListDiv.innerHTML = '<strong>Dostępne kamery:</strong><br>';
  cams.forEach((cam, index) => {
    cameraListDiv.innerHTML += `#${index + 1}: ${cam.label || 'Nieznana kamera'}<br>`;
  });
  if (cams.length < 2) 
  {
    document.querySelector('button').style.display = 'none';
  }
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
  return (h < H_RED_LOW || h > H_RED_HIGH) && s >= S_RED_MIN && (v >= V_RED_MIN && v <= V_RED_MAX); 
}

function isGreen(h, s, v) {
  return (h > H_GREEN_LOW && h < H_GREEN_HIGH) && s >= S_GREEN_MIN && (v >= V_GREEN_MIN && v <= V_GREEN_MAX);
}

function isYellow(h, s, v) {
  return (h > H_YELLOW_LOW && h < H_YELLOW_HIGH) && s >= S_YELLOW_MIN && (v >= V_YELLOW_MIN && v <= V_YELLOW_MAX); 
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

//pobierz pozycje myszy z canvy
function getPointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width  / rect.width),
    y: (evt.clientY - rect.top)  * (canvas.height / rect.height)
  };
}

//zacznij przeciaganie
function startDrag(evt) {
  const p = getPointerPos(evt);
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (
      p.x >= pos.x - sampleSize/2 - HANDLE_SIZE &&
      p.x <= pos.x + sampleSize/2 + HANDLE_SIZE &&
      p.y >= pos.y - sampleSize/2 - HANDLE_SIZE &&
      p.y <= pos.y + sampleSize/2 + HANDLE_SIZE
    ) {
      dragIndex = i;
      break;
    }
  }
}

//obsluga przeciagania
function doDrag(evt) {
  if (dragIndex < 0) return; // oznacza koniec przeciagania
  const p = getPointerPos(evt);
  // ograniczenie w obrębie canvasa
  positions[dragIndex].x = Math.max(0, Math.min(canvas.width,  p.x));
  positions[dragIndex].y = Math.max(0, Math.min(canvas.height, p.y));
}

//zakoncz przeciaganie
function endDrag() {
  dragIndex = -1;
}


function detectLed(video) {
  const now = performance.now();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Minimalna separacja między punktami (np. wielkość próbki)
  const MIN_SEPARATION = sampleSize;

  const hsvResults    = [];
  const redDetected   = [];
  const greenDetected = [];
  const yellowDetected= [];

  positions.forEach((pos, i) => {
    let x = pos.x, y = pos.y;

    // 1) Pobierz próbkę pikseli
    const imageData = ctx.getImageData(
      x - sampleSize/2,
      y - sampleSize/2,
      sampleSize,
      sampleSize
    );
    const data = imageData.data;

    // 2) Oblicz średnie HSV i zbierz wszystkie piksele
    let sumH = 0, sumS = 0, sumV = 0;
    const pxCount = sampleSize * sampleSize;
    const points = [];

    for (let p = 0; p < data.length; p += 4) {
      const px = p / 4;
      const dx = px % sampleSize;
      const dy = Math.floor(px / sampleSize);
      const [h, s, v] = rgbToHsv(data[p], data[p+1], data[p+2]);
      sumH += h; sumS += s; sumV += v;
      points.push({ dx, dy, h, s, v });
    }

    const avgH = sumH / pxCount;
    const avgS = sumS / pxCount;
    const avgV = sumV / pxCount;
    hsvResults[i] = { avgH, avgS, avgV };

    // 3) Detekcja kolorów
    const isR = isRed(avgH, avgS, avgV);
    const isG = isGreen(avgH, avgS, avgV);
    const isY = isYellow(avgH, avgS, avgV);
    redDetected[i]    = isR;
    greenDetected[i]  = isG;
    yellowDetected[i] = isY;

    let drawColor = 'blue';
    if (isR) drawColor = 'red';
    else if (isG) drawColor = 'green';
    else if (isY) drawColor = 'yellow';

    // 4) Jeżeli kolor wykryty, oblicz centroid i próbuj przesunąć
    if (isR || isG || isY) {
      let centerX = 0, centerY = 0, total = 0;
      for (const pt of points) {
        const match = (isR && isRed(pt.h, pt.s, pt.v))
                   || (isG && isGreen(pt.h, pt.s, pt.v))
                   || (isY && isYellow(pt.h, pt.s, pt.v));
        if (match) {
          // dx, dy względem środka próbki
          centerX += pt.dx - sampleSize/2;
          centerY += pt.dy - sampleSize/2;
          total++;
        }
      }

      if (total > 0) {
        const avgDX = centerX / total;
        const avgDY = centerY / total;
        const newX = pos.x + avgDX * 0.5;
        const newY = pos.y + avgDY * 0.5;

        // 5) Blokowanie ruchu, jeżeli zderzy się z innym śledzonym punktem
        let canMove = true;
        for (let j = 0; j < positions.length; j++) {
          if (j === i) continue;
          // Tylko punkty aktualnie śledzone blokują ruch
          if (!pointTrackingState[j].tracking) continue;
          const dxj = newX - positions[j].x;
          const dyj = newY - positions[j].y;
          if (Math.hypot(dxj, dyj) < MIN_SEPARATION) {
            console.log(`⚠️ Punkt ${i+1} zablokowany przez śledzony punkt ${j+1}`);
            canMove = false;
            break;
          }
        }

        // 6) Jeśli wolne, zaktualizuj pozycję
        if (canMove) {
          positions[i].x = Math.max(0, Math.min(canvas.width,  newX));
          positions[i].y = Math.max(0, Math.min(canvas.height, newY));
          console.log(`Punkt ${i+1} przesunięty o Δx=${avgDX.toFixed(1)} Δy=${avgDY.toFixed(1)}`);
        }
      }

      // Oznacz punkt jako śledzony, jeśli jeszcze nie
      if (!pointTrackingState[i].tracking) {
        pointTrackingState[i].tracking = true;
        console.log(`➡️ Punkt ${i+1} rozpoczął śledzenie`);
      }
    } else {
      // 7) Reset stanu śledzenia jeżeli kolor znikł
      if (pointTrackingState[i].tracking) {
        console.log(`🔴 Punkt ${i+1} utracił śledzenie`);
      }
      pointTrackingState[i].tracking = false;
      pointTrackingState[i].lockedPos = null;
    }

    // 8) Rysowanie
    highlightArea(ctx, positions[i].x, positions[i].y, sampleSize, drawColor);
    ctx.fillStyle    = 'white';
    ctx.font         = 'bold 14px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i+1, positions[i].x, positions[i].y);
  });

  // 9) Logowanie HSV
  log.innerHTML = hsvResults.map((r, i) =>
    `Pole ${i+1}: H=${r.avgH.toFixed(1)}, S=${r.avgS.toFixed(2)}, V=${r.avgV.toFixed(2)}`
  ).join('<br>');

  // 10) Aktualizacja tabelki co sekundę
  if (performance.now() - lastColorLogTime > 1000) {
    const symbols = hsvResults.map((_, i) => {
      if (redDetected[i])    return 'R';
      if (yellowDetected[i]) return 'Y';
      if (greenDetected[i])  return 'G';
      return 'O';
    });
    let html = `<table><tr><th>Punkt</th><th>Kolor</th></tr>`;
    symbols.forEach((sym, i) => {
      html += `<tr><td>${i+1}</td><td>${sym}</td></tr>`;
    });
    html += `</table>`;
    result.innerHTML = html;
    lastColorLogTime = now;
  }
}

function highlightArea(ctx, x, y, size, color = 'blue') {
  ctx.beginPath();
  ctx.rect(x - size /2, y - size /2, size, size);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function reset() {
  result.innerHTML = '';
  stateDurations = [];
  lastState = 'off';
  lastSwitchTime = performance.now();
}
let resetButton = document.getElementById("resetButton");
resetButton.addEventListener('click',reset);