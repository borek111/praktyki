const canvas = document.getElementById('canvas');
const result = document.getElementById('result');
const log = document.getElementById('log');

const SAMPLE_SIZE = 15;
const MAX_LENGTH = 100;
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
const V_GREEN_OFF = 0.4; 

const H_YELLOW_LOW = 40;      
const H_YELLOW_HIGH = 65;  
const S_YELLOW_MIN = 0.5;     
const V_YELLOW_MAX = 1.0;     
const V_YELLOW_OFF = 0.4;

let lastState = "off";
let lastSwitchTime = 0;
let currentStream = null;
let useFrontCamera = true;
let video = null;
let frameTimer = null;

const TOLERANCE = 0.5;    
let templates = [];
let stateDurations = [];  // zbiera { state, duration } przy każdym przełączeniu

const END_SEQUENCE_TIMEOUT = 2000; 
let sequenceEnded = false; 

const prefix = "Wynik: ";
let ResultSequence = '';

// dodaj szablon
fetch('templates.json')
  .then(res => res.json())
  .then(data => { templates = data; })
  .catch(err => console.error('templates.json load error:', err));


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
        video.setAttribute('playsinline', ''); // for iOS
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

  if (cams.length < 2) {
    document.querySelector('button').style.display = 'none';
  }

  StartCamera();
});



function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let d = max - min;

  let h = 0;
  let s = 0;
  //ustal v
  let v = max;

  // Oblicz S
  if (max === 0) {
    s = 0;
  } else {
    s = d / max;
  }

  // Oblicz H
  if (d === 0) {
    h = 0; 
  } 
  else {
    if (max === r) {
      h = (g - b) / d;
      if (g < b) 
      {
        h += 6;
      }
    } 
    else if (max === g) 
    {
      h = (b - r) / d + 2;
    } 
    else if (max === b) 
    {
      h = (r - g) / d + 4;
    }

    h *= 60;
  }

  return [ h, s, v ];
}


function isRed(h, s, v) {
  if ((h < H_RED_LOW || h > H_RED_HIGH) &&s >= S_RED_MIN &&v <= V_RED_MAX)
  {
    return true;
  }
  else{
    return false;
  }
}
function isGreen(h, s, v) {
  if ((h > H_GREEN_LOW && h < H_GREEN_HIGH) &&s >= S_GREEN_MIN &&v <= V_GREEN_MAX)
  {
    return true;
  }
  else{
    return false;
  }
}

function isYellow(h, s, v) {
  if ((h > H_YELLOW_LOW && h < H_YELLOW_HIGH) &&s >= S_YELLOW_MIN &&v <= V_YELLOW_MAX)
  {
    return true;
  }
  else{
    return false;
  }
}

function checkTemplates() {
  console.log("TEST");
  const seq = stateDurations.map(r => r.duration);

  // dla każdego szablonu sprawdź długość i tolerancję
  for (const tpl of templates) 
  {
    console.log("PETLA");
    if (tpl.durations.length !== seq.length) continue;

    let match = true;
    for (let i = 0; i < seq.length; i++) 
    {
      if (Math.abs(seq[i] - tpl.durations[i]) > TOLERANCE) {
        match = false;
        break;
      }
    }
    if (match) {
      document.getElementById('log').innerHTML += `<br><strong>Szablon:</strong> ${tpl.description}`;
      document.getElementById('templateDesc').textContent = tpl.description;
      console.log('Dopasowanie szablonu:', tpl.description);
      return;
    }
    else{
      console.log("NIE");
    }
  }
  tmp()
}


function detectLed(video) {
  const now = performance.now();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  //TODO jakies madre ustawienie tego cza zrobic 
  //najpierw dwa gorne, potem te boczne(na poczatek lewe)
  const positions = [
    { x:300, y: 300 },
    { x:500, y: 300 },
    { x:100, y: 450 },
    { x:100, y: 500 },
    { x:700, y: 450 },
    { x:700, y: 500 }
  ];

  const hsvResults = [];
  const redDetected = [];
  const greenDetected = [];
  const yellowDetected = [];

  positions.forEach((pos, i) => {
    const data = ctx.getImageData(pos.x, pos.y, SAMPLE_SIZE, SAMPLE_SIZE).data;
    let sumH = 0, sumS = 0, sumV = 0;
    const pxCount = SAMPLE_SIZE * SAMPLE_SIZE;

    for (let p = 0; p < data.length; p += 4) {
      const [h, s, v] = rgbToHsv(data[p], data[p+1], data[p+2]);
      sumH += h; sumS += s; sumV += v;
    }

    const avgH = sumH / pxCount;
    const avgS = sumS / pxCount;
    const avgV = sumV / pxCount;
    hsvResults[i] = { avgH, avgS, avgV };
    redDetected[i] = isRed(avgH, avgS, avgV);
    greenDetected[i] = isGreen(avgH, avgS, avgV);
    yellowDetected[i] = isYellow(avgH, avgS, avgV);

    highlightArea(
      ctx,
      pos.x, pos.y,
      SAMPLE_SIZE,
      redDetected[i] ? 'green' : 'blue'
    );
  });

  // Wyświetl logi
  log.innerHTML = hsvResults.map((r, i) =>
    `Pole ${i+1}: H=${r.avgH.toFixed(1)}, S=${r.avgS.toFixed(2)}, V=${r.avgV.toFixed(2)}, czerwony: ${redDetected[i]}, zielony: ${greenDetected[i]}, żółty: ${yellowDetected[i]}`
  ).join('<br>');

  // narazie sekwecnja dla srodka prawwgo jest. TODO zrobic lepiej 
  const main = hsvResults[1];
  let currentState = lastState;

  //detect for red
  if (lastState === 'off' && isRed(main.avgH, main.avgS, main.avgV)) {
    currentState = 'on';
  } else if (lastState === 'on' && (main.avgV < V_RED_OFF || !isRed(main.avgH, main.avgS, main.avgV))) {
    currentState = 'off';
  }

  if (currentState !== lastState && (now - lastSwitchTime) > CHANGE_TIME) {
    const durationSec = ((now - lastSwitchTime) / 1000).toFixed(2);
    document.getElementById('czas').textContent =
      `${lastState === 'on' ? 'Włączona' : 'Wyłączona'} przez ${durationSec}s`;

    stateDurations.push({ state: lastState, duration: parseFloat(durationSec) });
    if (stateDurations.length === 1 && stateDurations[0].state === 'off') {
      stateDurations.shift();
    }

  
    const symbol = currentState === 'on' ? '-' : '/'
    ResultSequence = ResultSequence+ symbol;
    if (ResultSequence.length > MAX_LENGTH) {
      ResultSequence = ResultSequence.slice(-MAX_LENGTH);
    }
    result.textContent = prefix + ResultSequence;

    lastState = currentState;
    lastSwitchTime = now;
    sequenceEnded = false;
  }

  if (!sequenceEnded && (now - lastSwitchTime) > END_SEQUENCE_TIMEOUT) {
    stateDurations.push({ state: lastState, duration: 2.0 });
    stateDurations.pop(); 
    checkTemplates();
    sequenceEnded = true;
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
  sequenceEnded = false;
  document.getElementById('czas').textContent = '';
  document.getElementById('templateDesc').textContent = '';
}

function tmp(){
  stateDurations = [];
  lastState = 'off';
  lastSwitchTime = performance.now();
  sequenceEnded = false;
}