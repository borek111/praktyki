const canvas = document.getElementById('canvas');
const result = document.getElementById('result');
const log = document.getElementById('log');

const SAMPLE_SIZE = 20;
const MAX_LENGTH = 100;
const CHANGE_TIME = 200;

const H_RED_LOW = 15;      
const H_RED_HIGH = 345;  
const S_RED_MIN = 0.5;     
const V_RED_MAX = 1.0;     
const V_OFF = 0.4;         

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
    video: {
      facingMode: useFrontCamera ? 'user' : 'environment',
      width:  { ideal: 800, max: 800 },
      height: { ideal: 600,  max: 600  }
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
  } else if (lastState === 'on' && (avgV < V_OFF || isRed(avgH, avgS, avgV) == false)) {
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


  let tmp = document.getElementById("tmp");
  tmp.innerHTML = currentState;
  highlightArea(ctx, x, y, SAMPLE_SIZE);
}

function highlightArea(ctx, x, y, size) {
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'blue';
  ctx.stroke();
}
