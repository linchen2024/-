const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

// 静态文件服务
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    fs.readFile(path.join(__dirname, filePath), (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('服务器错误: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// WebSocket服务器
const wss = new WebSocket.Server({ server });

console.log(`WebSocket服务器和静态文件服务已启动，监听端口: ${PORT}`);

wss.on('connection', function connection(ws) {
    console.log('有客户端连接');
    ws.on('message', function incoming(message, isBinary) {
        // 原封不动转发数据
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message, { binary: isBinary });
            }
        });
    });
    ws.on('close', function () {
        console.log('有客户端断开连接');
    });
    ws.on('error', function (err) {
        console.log('WebSocket错误:', err.message);
    });
});

server.listen(PORT, () => {
    console.log(`请访问 http://127.0.0.1:${PORT} 打开前端页面`);
}); 