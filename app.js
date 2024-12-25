import { db, rtdb } from "./firebase-config.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js";
import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js";

// DOM Elements
const hostCodeDisplay = document.getElementById("host-code-display");
const startShareBtn = document.getElementById("start-share");
const stopShareBtn = document.getElementById("stop-share");
const clientCodeInput = document.getElementById("client-code");
const connectBtn = document.getElementById("connect");
const remoteScreen = document.getElementById("remote-screen");
const permissionDialog = new bootstrap.Modal(document.getElementById("permission-modal"));
const rejectedDialog = new bootstrap.Modal(document.getElementById("rejected-modal"));
const stoppedDialog = new bootstrap.Modal(document.getElementById("stopped-modal"));

// Permission Checkboxes
const allowScreenShare = document.getElementById("allow-screen-share");
const allowMouseControl = document.getElementById("allow-mouse-control");
const allowKeyboardControl = document.getElementById("allow-keyboard-control");
const allowFileTransfer = document.getElementById("allow-file-transfer");
const allowAllAccess = document.getElementById("allow-all-access");

let hostCode;
let mediaStream;
let sharingRequestRef;
let clientCodeForControl;
let sharingStartTime;

// Utility functions
function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.split("=")[1];
    }
  }
  return null;
}

// Generate a unique 6-digit code
async function generateUniqueCode() {
  let code;
  let isUnique = false;

  while (!isUnique) {
    code = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit code
    const docRef = doc(db, "sessions", code);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      isUnique = true;
    }
  }

  setCookie("hostCode", code, 3650); // Save code in a cookie
  return code;
}

// Initialize the host
async function initializeHost() {
  hostCode = await generateUniqueCode();
  hostCodeDisplay.textContent = `Host Code: ${hostCode}`;

  const hostDoc = doc(db, "sessions", hostCode);
  await setDoc(hostDoc, { status: "available", hostCode });

  sharingRequestRef = ref(rtdb, `sessions/${hostCode}/request`);
  onValue(sharingRequestRef, (snapshot) => {
    if (snapshot.exists()) {
      const clientCode = snapshot.val();
      showPermissionDialog(clientCode);
    }
  });

  console.log("Host initialized with code:", hostCode);
}

// Show permission dialog
function showPermissionDialog(clientCode) {
  permissionDialog.show();

  document.getElementById("accept-request").onclick = () => {
    const permissions = {
      screenShare: allowScreenShare.checked,
      mouseControl: allowMouseControl.checked,
      keyboardControl: allowKeyboardControl.checked,
      fileTransfer: allowFileTransfer.checked,
      allAccess: allowAllAccess.checked
    };

    if (permissions.allAccess) {
      permissions.screenShare = true;
      permissions.mouseControl = true;
      permissions.keyboardControl = true;
      permissions.fileTransfer = true;
    }

    permissionDialog.hide();
    set(ref(rtdb, `sessions/${hostCode}/status`), { status: "accepted", permissions });

    // Send permission updates to client
    set(ref(rtdb, `sessions/${clientCode}/permissions`), permissions);
    startScreenSharing();
  };

  document.getElementById("reject-request").onclick = () => {
    permissionDialog.hide();
    set(ref(rtdb, `sessions/${hostCode}/status`), { status: "rejected" });
    rejectedDialog.show();
  };
}

// Start screen sharing
async function startScreenSharing() {
  try {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const streamRef = ref(rtdb, `sessions/${hostCode}/stream`);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const video = document.createElement("video");
    video.srcObject = mediaStream;
    video.play();

    const sendFrame = () => {
      if (!mediaStream.active) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameData = canvas.toDataURL("image/webp");
      set(streamRef, frameData);
    };

    setInterval(sendFrame, 100);
    sharingStartTime = Date.now();
    startShareBtn.style.display = "none";
    stopShareBtn.style.display = "block";
  } catch (error) {
    console.error("Error starting screen sharing:", error);
  }
}

// Stop screen sharing
function stopScreenSharing() {
  mediaStream.getTracks().forEach((track) => track.stop());
  remove(ref(rtdb, `sessions/${hostCode}/stream`));

  const sharingDuration = ((Date.now() - sharingStartTime) / 1000).toFixed(2);
  alert(`Screen sharing stopped. Duration: ${sharingDuration} seconds.`);
  startShareBtn.style.display = "block";
  stopShareBtn.style.display = "none";
}

// Start receiving stream on client side
function startReceivingStream(clientCode) {
  const streamRef = ref(rtdb, `sessions/${clientCode}/stream`);
  onValue(streamRef, (snapshot) => {
    if (snapshot.exists()) {
      const frameData = snapshot.val();
      const img = new Image();
      img.src = frameData;
      remoteScreen.innerHTML = "";
      remoteScreen.appendChild(img);
    }
  });
}

// Client connects using the entered device code
connectBtn.addEventListener("click", async () => {
  const clientCode = clientCodeInput.value.trim();
  if (!clientCode) {
    alert("Please enter a valid device code.");
    return;
  }

  console.log("Requesting to connect to host with code:", clientCode);

  const requestRef = ref(rtdb, `sessions/${clientCode}/request`);
  await set(requestRef, hostCode); // Send request to host

  const statusRef = ref(rtdb, `sessions/${clientCode}/status`);
  onValue(statusRef, (snapshot) => {
    if (snapshot.exists()) {
      const statusData = snapshot.val();
      if (statusData.status === "accepted") {
        console.log("Sharing request accepted.");
        clientCodeForControl = clientCode;
        startReceivingStream(clientCode);
        captureClientEvents(statusData.permissions);
      } else if (statusData.status === "rejected") {
        console.log("Sharing request rejected.");
        rejectedDialog.show();
      }
    }
  });
});

// Capture client-side events and send them to Firebase
function captureClientEvents(permissions) {
  if (permissions.mouseControl) {
    document.addEventListener("mousemove", (event) => {
      sendControlEvent({
        type: "mousemove",
        x: event.clientX,
        y: event.clientY,
      });
    });

    document.addEventListener("click", (event) => {
      sendControlEvent({
        type: "click",
        x: event.clientX,
        y: event.clientY,
      });
    });
  }

  if (permissions.keyboardControl) {
    document.addEventListener("keypress", (event) => {
      sendControlEvent({
        type: "keypress",
        key: event.key,
      });
    });
  }
}

// Send captured events to Firebase
function sendControlEvent(event) {
  const controlRef = ref(rtdb, `sessions/${clientCodeForControl}/controlEvents`);
  set(controlRef, event);
}

// Initialize the app
initializeHost();

// Event Listeners
startShareBtn.addEventListener("click", startScreenSharing);
stopShareBtn.addEventListener("click", stopScreenSharing);
