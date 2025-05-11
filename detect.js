const canvas = document.getElementById('canvas');
const result = document.getElementById('result');

const SAMPLE_SIZE = 10;
const LED_ON_LEVEl = 230;  // Gdy jasność > 160 to stan „on”
const LED_OFF_LEVEL = 200; // Gdy jasność < 140 to stan „off”
const MAX_LENGTH = 100; // ile znaków w inpucie
const CHANGE_TIME = 200; // ms minimalnej przerwy między zmianami

let lastState = "off";
let lastSwitchTime = 0;

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      setInterval(() => {
        detectLed(video);
      }, 1000 / 30);
    });
  })


function detectLed(video) {
  const now = performance.now();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height); // canvas clear
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // badamy obszar na środku ekranu
  const x = (canvas.width - SAMPLE_SIZE) / 2;
  const y = (canvas.height - SAMPLE_SIZE) / 2;
  const imgData = ctx.getImageData(x, y, SAMPLE_SIZE, SAMPLE_SIZE).data;

  let sum = 0;
  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i];
    const g = imgData[i+1];
    const b = imgData[i+2];
    //[r0, g0, b0, a0,  r1, g1, b1, a1,  r2, g2, b2, a2, …]
    sum += r + g + b;
  }
  const avg = sum / (3 * SAMPLE_SIZE * SAMPLE_SIZE);
  console.log('Brightness:', avg);
  let log = document.getElementById('log');
  log.innerHTML = 'Brightness: ' + avg.toFixed(2);

  // Filtracja zmian
  let currentState = lastState;
  if (lastState !== 'on' && avg > LED_ON_LEVEl) {
    currentState = 'on';
  } else if (lastState !== 'off' && avg < LED_OFF_LEVEL) {
    currentState = 'off';
  }


  if (currentState !== lastState && (now - lastSwitchTime) > CHANGE_TIME) {
    result.textContent += (currentState === 'on' ? '-' : '/');
    // zeby miec maksymalanie znakow ile w MAX_LENGTH
    if (result.textContent > MAX_LENGTH) {
      result.textContent = result.textContent.slice(-MAX_LENGTH);
    }
    lastState = currentState;
    lastSwitchTime = now;
  }

  highlightArea(ctx, x, y, SAMPLE_SIZE);
}

function highlightArea(ctx, x, y, size) {
  ctx.beginPath();
  ctx.rect(x, y, size, size); //Rysuje prostokąt zaczynający się w lewym górnym rogu (x, y).
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'red'; 
  ctx.stroke(); 
}
