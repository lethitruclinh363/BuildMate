export function captureVideoFrame(video: HTMLVideoElement, name: string, maxWidth = 960) {
  const canvas = document.createElement('canvas');
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const scale = Math.min(1, maxWidth / sourceWidth);
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('camera'));
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('camera'));
          return;
        }
        resolve(new File([blob], `ekyc-${name}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9
    );
  });
}

export async function openCamera(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
