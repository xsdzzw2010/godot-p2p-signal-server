const WebSocket = require('ws');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {}; // 内存存储房间：{房间码: {peers: Map, maxPlayers:4}}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let peerId = null;

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    switch (msg.type) {
      case 'create_room':
        const roomCode = Math.random().toString(36).substring(2, 8);
        rooms[roomCode] = { peers: new Map(), maxPlayers: 4 };
        currentRoom = roomCode;
        peerId = 'p' + Math.random().toString(36).substring(2, 6);
        rooms[roomCode].peers.set(peerId, ws);
        ws.send(JSON.stringify({ type: 'room_created', roomCode, peerId }));
        break;
      case 'join_room':
        const targetRoom = msg.roomCode;
        if (!rooms[targetRoom] || rooms[targetRoom].peers.size >= 4) {
          ws.send(JSON.stringify({ type: 'join_failed', reason: '房间满或不存在' }));
          return;
        }
        currentRoom = targetRoom;
        peerId = 'p' + Math.random().toString(36).substring(2, 6);
        rooms[targetRoom].peers.set(peerId, ws);
        // 通知其他玩家
        rooms[targetRoom].peers.forEach((pWs, id) => {
          if (id !== peerId) pWs.send(JSON.stringify({ type: 'peer_joined', peerId }));
        });
        // 通知当前玩家
        ws.send(JSON.stringify({ 
          type: 'join_success', 
          peerId, 
          existingPeers: Array.from(rooms[targetRoom].peers.keys()).filter(id => id !== peerId) 
        }));
        break;
      case 'signal':
        const targetPeer = msg.targetPeer;
        if (currentRoom && rooms[currentRoom].peers.has(targetPeer)) {
          rooms[currentRoom].peers.get(targetPeer).send(JSON.stringify({
            type: 'signal', fromPeer: peerId, data: msg.data
          }));
        }
        break;
      case 'leave_room':
        if (currentRoom && rooms[currentRoom]) {
          rooms[currentRoom].peers.delete(peerId);
          rooms[currentRoom].peers.forEach(pWs => {
            pWs.send(JSON.stringify({ type: 'peer_left', peerId }));
          });
          if (rooms[currentRoom].peers.size === 0) delete rooms[currentRoom];
        }
        break;
    }
  });

  ws.on('close', () => {
    if (currentRoom && peerId && rooms[currentRoom]) {
      rooms[currentRoom].peers.delete(peerId);
      rooms[currentRoom].peers.forEach(pWs => {
        pWs.send(JSON.stringify({ type: 'peer_left', peerId }));
      });
      if (rooms[currentRoom].peers.size === 0) delete rooms[currentRoom];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`信令服务器运行在端口 ${PORT}`);
});