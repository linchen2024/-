let ws = null;
const connectBtn = document.getElementById('connect-btn');
const sendBtn = document.getElementById('send-btn');
const wsUrlInput = document.getElementById('ws-url');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const messageInput = document.getElementById('message-input');
const clearBtn = document.getElementById('clear-btn');
const logList = document.getElementById('log-list');
const showMapBtn = document.getElementById('show-map-btn');
const mapModal = document.getElementById('map-modal');
const closeMap = document.getElementById('close-map');
const mapDiv = document.getElementById('map');
const showHistoryBtn = document.getElementById('show-history-btn');
const mapCurrentBtn = document.getElementById('map-current-btn');
const mapHistoryBtn = document.getElementById('map-history-btn');
const mapModalTitle = document.getElementById('map-modal-title');
const mapInfo = document.getElementById('map-info');

// 新增的UI元素
const showChatBtn = document.getElementById('show-chat-btn');
const hideChatBtn = document.getElementById('hide-chat-btn');
const chatArea = document.getElementById('chat-area');
const chatMessages = document.getElementById('chat-messages');
const logArea = document.getElementById('log-area');

// 语音功能相关元素
const voiceBtn = document.getElementById('voice-btn');
const voiceIndicator = document.getElementById('voice-indicator');

// 语音识别相关变量
let recognition = null;
let isRecording = false;

let deviceOnline = false;
let helloTimer = null;
let onlineTime = null;
let lastLocation = null;
let locationHistory = [];
let locationGroups = [];
let pendingOnlineLocation = null;

// 初始化语音识别
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';

        recognition.onstart = function () {
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceIndicator.style.display = 'flex';
            addBubble('🎤 开始语音识别，请说话...', false);
            console.log('语音识别已开始');
        };

        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript;
            messageInput.value = transcript;
            addBubble('✅ 语音识别完成: ' + transcript, false);
            console.log('语音识别结果:', transcript);
        };

        recognition.onerror = function (event) {
            console.error('语音识别错误:', event.error);
            stopVoiceRecognition();

            // 根据错误类型给出不同的提示
            let errorMessage = '语音识别失败，请重试';
            if (event.error === 'not-allowed') {
                errorMessage = '请允许浏览器访问麦克风权限';
            } else if (event.error === 'no-speech') {
                errorMessage = '未检测到语音，请重试';
            } else if (event.error === 'audio-capture') {
                errorMessage = '麦克风访问失败，请检查设备';
            }
            addBubble(errorMessage, false);
        };

        recognition.onend = function () {
            stopVoiceRecognition();
            console.log('语音识别已结束');
        };
    } else {
        console.warn('浏览器不支持语音识别');
        voiceBtn.style.display = 'none';
    }
}

// 停止语音识别
function stopVoiceRecognition() {
    if (recognition) {
        recognition.stop();
    }
    isRecording = false;
    voiceBtn.classList.remove('recording');
    voiceIndicator.style.display = 'none';
}

// 语音按钮点击事件
voiceBtn.addEventListener('click', function () {
    if (!isRecording) {
        if (recognition) {
            try {
                // 在移动端，先请求麦克风权限
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    navigator.mediaDevices.getUserMedia({ audio: true })
                        .then(function (stream) {
                            // 权限获取成功，开始语音识别
                            recognition.start();
                            // 停止音频流，因为我们只需要权限
                            stream.getTracks().forEach(track => track.stop());
                        })
                        .catch(function (err) {
                            console.error('麦克风权限获取失败:', err);
                            addBubble('请允许浏览器访问麦克风权限', false);
                        });
                } else {
                    // 直接尝试语音识别
                    recognition.start();
                }
            } catch (error) {
                console.error('语音识别启动失败:', error);
                addBubble('语音识别启动失败，请重试', false);
            }
        } else {
            addBubble('您的浏览器不支持语音识别功能', false);
        }
    } else {
        stopVoiceRecognition();
    }
});

function setStatus(state, text) {
    statusDot.classList.remove('connected', 'connecting', 'disconnected');
    statusDot.classList.add(state);
    statusText.textContent = text;
}

function formatTime(date) {
    return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    return (h ? h + '小时' : '') + (m ? m + '分' : '') + (s ? s + '秒' : '');
}

function addLog(msg) {
    const li = document.createElement('li');
    li.textContent = msg;
    logList.appendChild(li);
    logList.scrollTo({ top: logList.scrollHeight, behavior: 'smooth' });
}

function setDeviceStatus(online) {
    deviceOnline = online;
    if (online) {
        setStatus('connected', '设备已连接');
        if (!onlineTime) {
            onlineTime = new Date();
            addLog('上线：' + formatTime(onlineTime));
            pendingOnlineLocation = true; // 标记等待首次位置
        }
    } else {
        setStatus('disconnected', '设备未上线');
        if (onlineTime) {
            const offlineTime = new Date();
            const duration = offlineTime - onlineTime;
            addLog('离线：' + formatTime(offlineTime) + '，本次在线时长：' + formatDuration(duration));
            // 离线时记录最后位置
            if (locationGroups.length && locationGroups[0].online && lastLocation) {
                locationGroups[0].offline = { ...lastLocation, time: formatTime(offlineTime) };
            }
            onlineTime = null;
            pendingOnlineLocation = false;
            lastLocation = null; // 离线后无当前位置
        }
    }
}

function addBubble(msg, isMe = false) {
    if (isLocationMsg(msg)) {
        const [lon, lat] = msg.split('_').map(Number);
        const now = new Date();
        lastLocation = { lon, lat, time: formatTime(now) };
        // 只在上线/离线时记录日志
        if (pendingOnlineLocation) {
            locationGroups.unshift({ online: { ...lastLocation }, offline: null });
            if (locationGroups.length > 20) locationGroups.length = 20;
            pendingOnlineLocation = false;
            addLog('收到位置：' + lon + ',' + lat);
        }
        // 在消息栏显示
        const bubble = document.createElement('div');
        bubble.className = 'bubble other';
        bubble.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-map-marker-alt" style="color: #667eea;"></i>
                <span>位置信息：经度${lon}，纬度${lat}</span>
            </div>
        `;
        chatMessages.appendChild(bubble);
        chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
        return;
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (isMe ? 'me' : 'other');
    bubble.textContent = msg;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function resetHelloTimer() {
    if (helloTimer) clearTimeout(helloTimer);
    helloTimer = setTimeout(() => {
        setDeviceStatus(false);
    }, 30000); // 30秒
}

function autoConnect() {
    const url = wsUrlInput.value.trim();
    if (!url) return;
    if (ws) ws.close();
    setStatus('connecting', '连接中...');
    ws = new WebSocket(url);
    ws.onopen = function () {
        setStatus('connected', '已连接服务器');
        sendBtn.disabled = false;
        addBubble('已连接到服务器: ' + url, false);
        setDeviceStatus(false);
        if (helloTimer) clearTimeout(helloTimer);
    };
    ws.onmessage = function (event) {
        if (typeof event.data === 'string') {
            if (event.data === 'system init ok' || event.data === 'hello') {
                setDeviceStatus(true);
                resetHelloTimer();
                return; // 不显示
            } else {
                addBubble(event.data, false);
            }
        } else {
            addBubble('收到二进制数据（长度: ' + event.data.size + '）', false);
        }
    };
    ws.onclose = function () {
        setStatus('disconnected', '未连接');
        sendBtn.disabled = true;
        addBubble('连接已关闭', false);
        setDeviceStatus(false);
        if (helloTimer) clearTimeout(helloTimer);
    };
    ws.onerror = function () {
        setStatus('disconnected', '连接错误');
        addBubble('连接出错', false);
        setDeviceStatus(false);
        if (helloTimer) clearTimeout(helloTimer);
    };
}

connectBtn.onclick = autoConnect;

// 页面加载后自动连接
window.addEventListener('DOMContentLoaded', function () {
    autoConnect();
    initSpeechRecognition();

    // 添加切换功能
    showChatBtn.addEventListener('click', function () {
        chatArea.style.display = 'flex';
        logArea.style.display = 'none';
    });

    hideChatBtn.addEventListener('click', function () {
        chatArea.style.display = 'none';
        logArea.style.display = 'flex';
    });
});

function sendMsg() {
    const msg = messageInput.value;
    if (ws && ws.readyState === WebSocket.OPEN && msg) {
        ws.send(msg);
        addBubble(msg, true);
        messageInput.value = '';
    }
}

sendBtn.onclick = sendMsg;

messageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        sendMsg();
    }
});

clearBtn.onclick = function () {
    chatMessages.innerHTML = '';
};

function isLocationMsg(msg) {
    return /^-?\d+(\.\d+)?_-?\d+(\.\d+)?$/.test(msg);
}

function showMap(lon, lat, markerTitle, markerTime) {
    if (lon == null || lat == null) {
        mapDiv.innerHTML = '<div style="text-align:center;padding:40px 0;color:#888;display:flex;flex-direction:column;align-items:center;gap:12px;"><i class="fas fa-map" style="font-size:2rem;color:#cbd5e1;"></i><span>暂无位置信息</span></div>';
        mapInfo.innerHTML = '';
        mapModalTitle.innerHTML = '<i class="fas fa-map"></i> 位置信息';
        return;
    }
    let markerParam = `${lon},${lat}`;
    let name = markerTitle || '设备位置';
    let timeStr = markerTime ? `(${markerTime})` : '';
    mapDiv.innerHTML = `<iframe width="100%" height="100%" frameborder="0" style="border:0;border-radius:16px;" src="https://uri.amap.com/marker?position=${markerParam}&name=${encodeURIComponent(name + timeStr)}" allowfullscreen></iframe>`;
    mapModalTitle.innerHTML = '<i class="fas fa-map"></i> ' + (markerTitle || '位置信息');
    mapInfo.innerHTML = `<b>经度：</b>${lon} <b>纬度：</b>${lat}${markerTime ? ' <b>时间：</b>' + markerTime : ''}`;
}

function showHistoryMap() {
    if (!locationGroups.length) {
        mapDiv.innerHTML = '<div style="text-align:center;padding:40px 0;color:#888;display:flex;flex-direction:column;align-items:center;gap:12px;"><i class="fas fa-history" style="font-size:2rem;color:#cbd5e1;"></i><span>暂无历史位置信息</span></div>';
        mapInfo.innerHTML = '';
        mapModalTitle.innerHTML = '<i class="fas fa-history"></i> 历史位置';
        return;
    }
    let markers = [];
    let infoHtml = '';
    locationGroups.forEach((group, idx) => {
        const seq = locationGroups.length - idx;
        if (group.online) {
            markers.push(`${group.online.lon},${group.online.lat},green:${encodeURIComponent('[' + seq + ']上线 ' + group.online.time)}`);
            infoHtml += `<div style='margin-bottom:4px;'><b>[${seq}] 上线</b> 经度:${group.online.lon} 纬度:${group.online.lat} 时间:${group.online.time}</div>`;
        }
        if (group.offline) {
            markers.push(`${group.offline.lon},${group.offline.lat},red:${encodeURIComponent('[' + seq + ']离线 ' + group.offline.time)}`);
            infoHtml += `<div style='margin-bottom:8px;'><b>[${seq}] 离线</b> 经度:${group.offline.lon} 纬度:${group.offline.lat} 时间:${group.offline.time}</div>`;
        }
    });
    mapDiv.innerHTML = `<iframe width="100%" height="100%" frameborder="0" style="border:0;border-radius:16px;" src="https://uri.amap.com/marker?markers=${markers.join('|')}" allowfullscreen></iframe>`;
    mapModalTitle.innerHTML = '<i class="fas fa-history"></i> 历史位置';
    mapInfo.innerHTML = infoHtml;
}

showMapBtn.onclick = function () {
    if (!lastLocation) {
        mapDiv.innerHTML = '<div style="text-align:center;padding:40px 0;color:#888;display:flex;flex-direction:column;align-items:center;gap:12px;"><i class="fas fa-map" style="font-size:2rem;color:#cbd5e1;"></i><span>暂无位置信息</span></div>';
        mapInfo.innerHTML = '';
        mapModalTitle.innerHTML = '<i class="fas fa-map"></i> 位置信息';
    } else {
        showMap(lastLocation.lon, lastLocation.lat, '当前位置', lastLocation.time);
    }
    mapModal.style.display = 'flex';
    mapCurrentBtn.classList.add('active');
    mapHistoryBtn.classList.remove('active');
};

showHistoryBtn.onclick = function () {
    showHistoryMap();
    mapModal.style.display = 'flex';
    mapCurrentBtn.classList.remove('active');
    mapHistoryBtn.classList.add('active');
};

mapCurrentBtn.onclick = showMapBtn.onclick;
mapHistoryBtn.onclick = showHistoryBtn.onclick;

closeMap.onclick = function () {
    mapModal.style.display = 'none';
    mapDiv.innerHTML = '';
};

// 初始状态
setStatus('disconnected', '未连接'); 