let client = null;
const $ = id => document.getElementById(id);

const led = $('led'), statusText = $('statusText');
const connectBtn = $('connectBtn'), disconnectBtn = $('disconnectBtn');
const alarmBanner = $('alarmBanner');
const logPanel = $('logPanel');

// Draw gauge ticks (0 to 50 C range, semicircle)
function drawTicks(){
  const ticks = $('ticks');
  const cx = 150, cy = 150, rOuter = 120, rInner = 108;
  let svg = '';
  for(let i=0; i<=10; i++){
    const angle = Math.PI - (i/10)*Math.PI; // 180deg to 0deg
    const x1 = cx + rOuter*Math.cos(angle);
    const y1 = cy - rOuter*Math.sin(angle);
    const x2 = cx + rInner*Math.cos(angle);
    const y2 = cy - rInner*Math.sin(angle);
    svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  ticks.innerHTML = svg;
}
drawTicks();

function log(msg, cls){
  const line = document.createElement('div');
  line.className = 'log-line' + (cls ? ' '+cls : '');
  const time = new Date().toLocaleTimeString('id-ID', {hour12:false});
  line.innerHTML = `<span class="t">[${time}]</span> ${msg}`;
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
  while(logPanel.children.length > 100) logPanel.removeChild(logPanel.firstChild);
}

function setConnected(isConnected){
  led.classList.toggle('on', isConnected);
  statusText.textContent = isConnected ? 'TERHUBUNG' : 'TERPUTUS';
  connectBtn.disabled = isConnected;
  disconnectBtn.disabled = !isConnected;
}

function updateGauge(temp){
  const minT = 0, maxT = 50;
  const clamped = Math.max(minT, Math.min(maxT, temp));
  const pct = (clamped - minT) / (maxT - minT);

  // needle: -90deg (min) to +90deg (max) relative to base rotate(-90)
  const angle = -90 + pct*180;
  $('needle').setAttribute('transform', `rotate(${angle} 150 150)`);

  // arc fill (dasharray total length ~377)
  const total = 377;
  $('arcFill').setAttribute('stroke-dashoffset', (total - pct*total).toFixed(1));
}

function handlePayload(raw){
  let data;
  try{ data = JSON.parse(raw); }
  catch(e){ log('Payload tidak valid: ' + raw, 'warn'); return; }

  const threshold = parseFloat($('thresholdInput').value) || 36.0;
  const suhu = data.suhu, hum = data.kelembaban;
  const isAlarm = data.alarm !== undefined ? data.alarm : (suhu > threshold);

  $('tempReading').textContent = suhu.toFixed(1) + ' °C';
  $('tempReading').classList.toggle('alarm', isAlarm);
  $('tempTimestamp').textContent = 'Update terakhir: ' + new Date().toLocaleTimeString('id-ID');

  $('humVal').innerHTML = hum.toFixed(1) + ' <small>%RH</small>';
  $('humLbl').textContent = hum.toFixed(1) + '%';
  $('humBar').style.width = Math.min(100, hum) + '%';

  $('fVal').innerHTML = (data.suhu_f !== undefined ? data.suhu_f : suhu*9/5+32).toFixed(1) + ' <small>°F</small>';
  $('kVal').innerHTML = (data.suhu_k !== undefined ? data.suhu_k : suhu+273.15).toFixed(1) + ' <small>K</small>';

  updateGauge(suhu);

  alarmBanner.classList.toggle('show', isAlarm);

  log(`Suhu ${suhu.toFixed(1)}°C · Lembab ${hum.toFixed(1)}%` + (isAlarm ? ' — ALARM AKTIF' : ''), isAlarm ? 'warn' : '');
}

connectBtn.addEventListener('click', () => {
  const url = $('brokerUrl').value.trim();
  const topicData = $('topicData').value.trim();
  const topicStatus = $('topicStatus').value.trim();

  log('Menghubungkan ke ' + url + ' ...');
  try{
    client = mqtt.connect(url, {
      clientId: 'webdash-' + Math.random().toString(16).slice(2,10),
      reconnectPeriod: 3000,
      connectTimeout: 8000,
    });
  }catch(e){
    log('Gagal membuat koneksi: ' + e.message, 'warn');
    return;
  }

  client.on('connect', () => {
    setConnected(true);
    log('Terhubung ke broker MQTT.');
    client.subscribe(topicData, err => { if(!err) log('Subscribe ke topic: ' + topicData); });
    client.subscribe(topicStatus, err => { if(!err) log('Subscribe ke topic: ' + topicStatus); });
  });

  client.on('message', (topic, message) => {
    const payload = message.toString();
    if(topic === topicData){
      handlePayload(payload);
    } else if(topic === topicStatus){
      log('Status perangkat: ' + payload);
    }
  });

  client.on('reconnect', () => { log('Mencoba menghubungkan kembali...', 'warn'); });
  client.on('error', (err) => { log('Error MQTT: ' + err.message, 'warn'); });
  client.on('close', () => { setConnected(false); });
});

disconnectBtn.addEventListener('click', () => {
  if(client){
    client.end(true);
    log('Koneksi diputus oleh pengguna.');
    setConnected(false);
  }
});