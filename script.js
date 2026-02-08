const settings = [
    { id: 'volume', label: 'Volume', min: 0, max: 1, step: 0.01, val: 0.5 },
    { id: 'mode', label: 'Mode', min: 0, max: 3, step: 1, val: 0 },
    { id: 'pitch', label: 'Pitch', min: 0, max: 1, step: 0.01, val: 0.22 },
    { id: 'decay', label: 'Decay', min: 0, max: 1, step: 0.01, val: 0.5 },
    { id: 'voices', label: 'Voices', min: 1, max: 8, step: 1, val: 1 },
    { id: 'detune', label: 'Detune', min: 0, max: 1, step: 0.01, val: 0 },
    { id: 'pitchEnv', label: 'Pitch Env', min: 0, max: 1, step: 0.01, val: 0.5 },
    { id: 'pitchAttack', label: 'Pitch Attack', min: 0, max: 1, step: 0.01, val: 0 },
    { id: 'pitchDecay', label: 'Pitch Decay', min: 0, max: 1, step: 0.01, val: 0.1 },
    { id: 'pitchMod', label: 'Pitch Mod', min: 0, max: 1, step: 0.01, val: 0 },
    { id: 'modShape', label: 'Mod Shape', min: 0, max: 3, step: 1, val: 0 },
    { id: 'modRate', label: 'Mod Rate', min: 0, max: 1, step: 0.01, val: 0.1 },
    { id: 'modAttack', label: 'Mod Attack', min: 0, max: 1, step: 0.01, val: 0 },
    { id: 'modDecay', label: 'Mod Decay', min: 0, max: 1, step: 0.01, val: 0.5 }
];

const controlsDiv = document.getElementById('controls');
const dataInput = document.getElementById('data-input');
let state = {};
const modes = ['sine', 'square', 'sawtooth', 'triangle'];
let activeSfxElement = null;

const savedState = localStorage.getItem('sfxia_current_state');
const initialValues = savedState ? JSON.parse(savedState) : null;

settings.forEach(s => {
    const startVal = initialValues && initialValues[s.id] !== undefined ? initialValues[s.id] : s.val;
    state[s.id] = startVal;
    const row = document.createElement('div');
    row.className = 'control-row';
    row.innerHTML = `<div class="label">${s.label}</div>
        <div class="slider-container"><input type="range" id="input-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${startVal}" oninput="updateState('${s.id}', this.value)"></div>
        <div class="value-display" id="val-${s.id}">${startVal}</div>`;
    controlsDiv.appendChild(row);
});

function updateState(id, val, skipDataUpdate = false) {
    state[id] = parseFloat(val);
    document.getElementById(`val-${id}`).innerText = val;
    localStorage.setItem('sfxia_current_state', JSON.stringify(state));
    if (!skipDataUpdate) updateDataDisplay();
}

function updateDataDisplay() { dataInput.value = btoa(JSON.stringify(state)); }

function importData(val) {
    try {
        const decoded = JSON.parse(atob(val));
        Object.keys(decoded).forEach(key => {
            const input = document.getElementById(`input-${key}`);
            if(input) {
                input.value = decoded[key];
                updateState(key, decoded[key], true);
            }
        });
        playCurrent();
    } catch(e) {}
}

function showTab(tab) {
    document.getElementById('about-overlay').style.display = (tab === 'about') ? 'block' : 'none';
}

function generateRandom() {
    settings.forEach(s => {
        const rand = (Math.random() * (s.max - s.min) + s.min).toFixed(2);
        const finalVal = s.step === 1 ? Math.round(rand) : rand;
        const input = document.getElementById(`input-${s.id}`);
        if(input) { input.value = finalVal; updateState(s.id, finalVal); }
    });
    playCurrent();
}

function saveCurrent(name = null, savedData = null) {
    const list = document.getElementById('saved-list');
    const item = document.createElement('div');
    item.className = 'save-item';
    item.innerText = name || `SFX #${list.children.length + 1}`;
    item.dataset.state = savedData || JSON.stringify(state);
    item.onclick = () => {
        const data = JSON.parse(item.dataset.state);
        Object.keys(data).forEach(key => {
            const input = document.getElementById(`input-${key}`);
            if(input) { input.value = data[key]; updateState(key, data[key]); }
        });
    };
    item.ondblclick = (e) => {
        e.preventDefault();
        activeSfxElement = item;
        document.getElementById('rename-input').value = item.innerText;
        document.getElementById('mgmt-panel').style.display = 'flex';
    };
    list.appendChild(item);
    persistList();
}

function persistList() {
    const items = Array.from(document.getElementById('saved-list').children).map(el => ({
        name: el.innerText, data: el.dataset.state
    }));
    localStorage.setItem('sfxia_saved_effects', JSON.stringify(items));
}

function loadPersistedList() {
    const saved = localStorage.getItem('sfxia_saved_effects');
    if (saved) JSON.parse(saved).forEach(item => saveCurrent(item.name, item.data));
    updateDataDisplay();
}
loadPersistedList();

function applyRename() { if(activeSfxElement) { activeSfxElement.innerText = document.getElementById('rename-input').value; persistList(); } }
function deleteSfx() { if(activeSfxElement) { activeSfxElement.remove(); persistList(); closeMgmt(); } }
function closeMgmt() { document.getElementById('mgmt-panel').style.display = 'none'; activeSfxElement = null; }

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;

function setupGraph(ctx, targetState, startTime) {
    const masterGain = ctx.createGain();
    const actualPitch = targetState.pitch * 2000 + 20;
    const actualDecay = targetState.decay * 3 + 0.01;
    const actualPitchEnv = (targetState.pitchEnv - 0.5) * 4000;
    const actualDetune = targetState.detune * 100;
    const actualModRate = targetState.modRate * 50;
    const actualPitchMod = targetState.pitchMod * 1000;

    masterGain.gain.setValueAtTime(targetState.volume, startTime);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + actualDecay);

    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    mod.type = modes[targetState.modShape];
    mod.frequency.value = actualModRate;
    modGain.gain.setValueAtTime(0, startTime);
    modGain.gain.linearRampToValueAtTime(actualPitchMod, startTime + targetState.modAttack);
    modGain.gain.exponentialRampToValueAtTime(0.001, startTime + targetState.modAttack + targetState.modDecay);
    mod.connect(modGain);
    mod.start(startTime);
    mod.stop(startTime + actualDecay + 1);

    for(let i=0; i < targetState.voices; i++) {
        const osc = ctx.createOscillator();
        osc.type = modes[targetState.mode];
        const offset = (i - (targetState.voices-1)/2) * actualDetune;
        const baseFreq = actualPitch + offset;
        osc.frequency.setValueAtTime(baseFreq, startTime);
        if (actualPitchEnv !== 0) {
            osc.frequency.linearRampToValueAtTime(baseFreq + actualPitchEnv, startTime + targetState.pitchAttack);
            osc.frequency.exponentialRampToValueAtTime(baseFreq, startTime + targetState.pitchAttack + targetState.pitchDecay);
        }
        modGain.connect(osc.detune);
        osc.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + actualDecay + 1);
    }
    return masterGain;
}

function playCurrent() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const graph = setupGraph(audioCtx, state, audioCtx.currentTime);
    graph.connect(analyser);
    analyser.connect(audioCtx.destination);
}

async function exportSound() {
    const actualDecay = state.decay * 3 + 0.01;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(44100 * (actualDecay + 0.1)), 44100);
    const graph = setupGraph(offlineCtx, state, 0);
    graph.connect(offlineCtx.destination);
    const renderedBuffer = await offlineCtx.startRendering();
    const wav = audioBufferToWav(renderedBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'sfx.wav'; anchor.click();
}

const canvas = document.getElementById('oscilloscope');
const canvasCtx = canvas.getContext('2d');
function draw() {
    requestAnimationFrame(draw);
    const width = canvas.width = canvas.parentElement.clientWidth;
    const height = canvas.height = canvas.parentElement.clientHeight;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(dataArray);
    canvasCtx.fillStyle = '#000';
    canvasCtx.fillRect(0, 0, width, height);
    canvasCtx.lineWidth = 1;
    canvasCtx.strokeStyle = '#fff';
    canvasCtx.beginPath();
    const sliceHeight = height / dataArray.length;
    let y = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const x = v * (width / 2);
        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
        y += sliceHeight;
    }
    canvasCtx.stroke();
}
draw();

function audioBufferToWav(buffer) {
    let numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44,
        bufferArray = new ArrayBuffer(length), view = new DataView(bufferArray),
        channels = [], i, sample, offset = 0, pos = 0;
    const setUint16 = (data) => { view.setUint16(offset, data, true); offset += 2; };
    const setUint32 = (data) => { view.setUint32(offset, data, true); offset += 4; };
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16);
    setUint32(0x61746164); setUint32(length - pos - 4);
    for(i=0; i<buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
    while(pos < buffer.length) {
        for(i=0; i<numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
        pos++;
    }
    return bufferArray;
}