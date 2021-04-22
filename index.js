
const joinRoomBtn = document.getElementById("join-room-btn");
const test = document.getElementById("test");

async function getLocalStream() {
  return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  // return navigator.mediaDevices.getUserMedia({ video: true });
}

function createVideoContainer(userId, stream) {
  const div = document.createElement("div");
  div.className = "video-container";
  const p = document.createElement("p");
  p.innerHTML = userId;
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  div.appendChild(p);
  div.appendChild(video);
  const media = document.getElementById("media");
  media.appendChild(div);
  return div;
}

class Signaling {
  handler = {};

  constructor(url) {
    this.url = url;
  }

  init() {
    return new Promise((resolve, reject) => {
      // this.ws = new WebSocket("wss://yaox023.com/myrtcwebsocket");
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("socket onopen");

        this.ws.onmessage = e => {
          let data;
          try {
            data = JSON.parse(e.data);
          } catch (error) {
            console.log("json parse error: ", error, e.data);
            return;
          }
          console.log("client got message: ", data);
          const { type, content } = data;
          if (this.handler[type]) {
            this.handler[type](content);
          }
        };

        resolve();
      };

      this.ws.onclose = () => {
        console.log("socket onclose");
      };
      this.ws.onerror = () => {
        console.log("socket error");
        reject();
      };

    });

  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  bindHandler(type, cb) {
    this.handler[type] = cb;
  }

}

class RTC {
  constructor(signaling, localStream, remoteUserId) {
    this.signaling = signaling;
    this.localStream = localStream;
    this.remoteUserId = remoteUserId;

    this.pc = new RTCPeerConnection({
      "iceServers": [
        { "urls": ["stun:stun.l.google.com:19302"] },
        {
          'urls': 'turn:yaox023.com:3478',
          'credential': "bbbbb",
          'username': "aaaaa"
        }
      ]
    });

    this.pc.onicecandidate = async e => {
      if (e.candidate) {
        console.log("send candidate", e.candidate);
        this.signaling.send({
          type: "candidate",
          content: {
            candidate: e.candidate,
            remoteUserId: this.remoteUserId
          }
        });
      }
    };

    this.pc.ontrack = (e) => {
      if (this.container) return;
      this.container = createVideoContainer(this.remoteUserId, e.streams[0]);
    };


    const tracks = this.localStream.getTracks();
    for (let i = 0; i < tracks.length; i++) {
      this.pc.addTrack(tracks[i], this.localStream);
    }
  }

  release() {
    this.pc.close();
    if (this.container) {
      const media = document.getElementById("media");
      media.removeChild(this.container);
    }
  }

  sendOffer() {
    this.pc.createOffer()
      .then(offer => {
        this.pc.setLocalDescription(offer)
          .then(() => {
            console.log("set local success");
          })
          .catch(() => {
            console.log("set local fail");
          });
        this.signaling.send({
          type: "offer",
          content: {
            offer,
            remoteUserId: this.remoteUserId
          }
        });
      });
  }

  handleOffer(offer) {
    this.pc.setRemoteDescription(offer)
      .then(() => this.pc.createAnswer())
      .then(answer => {
        this.pc.setLocalDescription(answer);
        this.signaling.send({
          type: "answer",
          content: {
            answer,
            remoteUserId: this.remoteUserId
          }
        });
      });
  }

  handleAnswer(answer) {
    this.pc.setRemoteDescription(answer)
      .then(() => console.log("set remote success"))
      .catch(error => console.log("set remote fail", error));
  }

  handleCandidate(candidate) {
    this.pc.addIceCandidate(candidate);
  }
}

let userId;
let remoteUserIds = [];
let RTCMap = {};

let localStream;

joinRoomBtn.onclick = async () => {


  const signaling = new Signaling("ws://localhost:8888");
  await signaling.init();

  signaling.bindHandler("JoinRoomRes", async ({ id, ids }) => {

    if (!localStream) {
      localStream = await getLocalStream();
    }

    userId = id;
    remoteUserIds = ids;
    console.log("my id: ", userId, ids);
    createVideoContainer(userId, localStream);

    for (let i = 0; i < ids.length; i++) {
      const remoteUserId = ids[i];
      const rtc = new RTC(signaling, localStream, remoteUserId);
      RTCMap[remoteUserId] = rtc;
      rtc.sendOffer();
    }
  });

  signaling.bindHandler("offer", ({ offer, remoteUserId }) => {
    RTCMap[remoteUserId].handleOffer(offer);
  });

  signaling.bindHandler("answer", ({ answer, remoteUserId }) => {
    RTCMap[remoteUserId].handleAnswer(answer);
  });

  signaling.bindHandler("candidate", ({ candidate, remoteUserId }) => {
    RTCMap[remoteUserId].handleCandidate(candidate);
  });

  signaling.bindHandler("userJoin", ({ remoteUserId }) => {
    remoteUserIds.push(remoteUserId);
    const rtc = new RTC(signaling, localStream, remoteUserId);
    RTCMap[remoteUserId] = rtc;
  });

  signaling.bindHandler("userLeave", ({ remoteUserId }) => {
    const index = remoteUserIds.findIndex(id => id === remoteUserId);
    if (index !== -1) {
      remoteUserIds.splice(index, 1);
    }
    const rtc = RTCMap[remoteUserId];
    if (rtc) {
      rtc.release();
    }
  });

  signaling.send({ type: "JoinRoom" });

  document.body.removeChild(joinRoomBtn);

};
