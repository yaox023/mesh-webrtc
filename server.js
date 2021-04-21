var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8888 });

let idIndex = 1;

// key id, value connection object
let userMap = {};
// let connectionMap = {};

function getUserIdByConnection(connection) {
  return Object.entries(userMap).filter(([_, value]) => value === connection)[0][0];
}

wss.on("connection", function (connection) {

  const currentUserId = "a-" + (idIndex).toString();
  userMap[currentUserId] = connection;
  idIndex++;

  connection.on("message", function (message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error("json parse error: ", error, message);
      return;
    }
    const { type, content } = data;


    switch (type) {

      case "JoinRoom": {
        const currentUserId = getUserIdByConnection(connection);

        const otherUserIds = Object.keys(userMap).filter(userId => userId !== currentUserId);
        connection.send(JSON.stringify({ type: "JoinRoomRes", content: { id: currentUserId, ids: otherUserIds } }));
        for (let i = 0; i < otherUserIds.length; i++) {
          const userId = otherUserIds[i];
          const otherConnection = userMap[userId];
          otherConnection.send(JSON.stringify({ type: "userJoin", content: { remoteUserId: currentUserId } }));
        }
        break;
      }


      case "offer": {
        const currentUserId = getUserIdByConnection(connection);
        const { offer, remoteUserId } = content;
        const remoteConnection = userMap[remoteUserId];
        remoteConnection.send(JSON.stringify({ type: "offer", content: { offer, remoteUserId: currentUserId } }));
        break;
      }


      case "answer": {
        const currentUserId = getUserIdByConnection(connection);
        const { answer, remoteUserId } = content;
        const remoteConnection = userMap[remoteUserId];
        remoteConnection.send(JSON.stringify({ type: "answer", content: { answer, remoteUserId: currentUserId } }));
        break;
      }

      case "candidate": {
        const currentUserId = getUserIdByConnection(connection);
        const { candidate, remoteUserId } = content;
        const remoteConnection = userMap[remoteUserId];
        remoteConnection.send(JSON.stringify({ type: "candidate", content: { candidate, remoteUserId: currentUserId } }));
        break;
      }

    }
  });

  connection.on("close", function () {
    // delete
    const currentUserId = getUserIdByConnection(connection);
    const otherUserIds = Object.keys(userMap).filter(userId => userId !== currentUserId);

    for (let i = 0; i < otherUserIds.length; i++) {
      const userId = otherUserIds[i];
      const otherConnection = userMap[userId];
      otherConnection.send(JSON.stringify({ type: "userLeave", content: { remoteUserId: currentUserId } }));
    }

    delete userMap[currentUserId];

  });
});