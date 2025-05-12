const canvas = document.getElementById('canvas');
const result = document.getElementById('result');

const SAMPLE_SIZE = 20;
const LED_ON_LEVEl = 160;  // Gdy jasność > 160 to stan „on”
const LED_OFF_LEVEL = 120; // Gdy jasność < 120 to stan „off”
const MAX_LENGTH = 100; // ile znaków w inpucie
const CHANGE_TIME = 200; // ms minimalnej przerwy między zmianami

let lastState = "off";
let lastSwitchTime = 0;
let currentStream = null;
let useFrontCamera = true;

function changeCamera(){
  useFrontCamera = !useFrontCamera;
  StartCamera();
}

function StartCamera()
{
  if(currentStream)
  {
    currentStream.getTracks().foreach(track => track.stop());
  }
}

const constraints = {
    video:{
      facingMode: useFrontCamera ? 'user' : 'environment'
    }
  };

navigator.mediaDevices.getUserMedia(constraints)
  .then(stream => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      setInterval(() => {
        detectLed(video);
      }, 1000 / 33.333); //30fps
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

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    //[r0, g0, b0, a0, r1, g1, b1, a1, ...]
    sumR += r;
    sumG += g;
    sumB += b;
  }

  const totalPixels = SAMPLE_SIZE * SAMPLE_SIZE;
  const avgR = (sumR /totalPixels);
  const avgG = (sumG / totalPixels);
  const avgB = (sumB / totalPixels);
  const avgBrightness = (avgR + avgG + avgB) / 3;

  console.log('Brightness:', avgBrightness.toFixed(2), 'AvgR:', avgR, 'AvgG:', avgG, 'AvgB:', avgB);
  let log = document.getElementById('log');
  log.innerHTML = 'Brightness: ' + avgBrightness.toFixed(2) + '<br>AvgR: ' + avgR + '<br>AvgG: ' + avgG + '<br>AvgB: ' + avgB + '<br>Red Dominant: ' + (avgR > avgG && avgR > avgB);

  
  // Filtracja zmian
  let currentState = lastState;
  if (lastState !== 'on' && avgBrightness > LED_ON_LEVEl && avgR > avgG && avgR > avgB) {
    currentState = 'on';
  } else if (lastState !== 'off' && avgBrightness < LED_OFF_LEVEL) {
    currentState = 'off';
  }

  if (currentState !== lastState && (now - lastSwitchTime) > CHANGE_TIME) {
    result.textContent += (currentState === 'on' ? '-' : '/');
    // zeby miec maksymalanie znakow ile w MAX_LENGTH
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
  ctx.rect(x, y, size, size); //Rysuje prostokąt zaczynający się w lewym górnym rogu (x, y).
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'blue'; 
  ctx.stroke(); 
}

navigator.mediaDevices.enumerateDevices().then(devices => {
  const videoDevices = devices.filter(d => d.kind === 'videoinput')
  if(videoDevices.length < 2)
  {
    document.querySelector('button').style.display = 'none';
  }
  StartCamera();
})