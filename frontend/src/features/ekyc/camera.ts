export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function isStreamLive(stream: MediaStream | null | undefined) {
  return Boolean(stream?.getTracks().some((track) => track.readyState === 'live'));
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  name: string,
  maxWidth = 960,
  crop?: { sx: number; sy: number; sw: number; sh: number }
) {
  const canvas = document.createElement('canvas');
  const sourceWidth = crop?.sw || video.videoWidth || 1280;
  const sourceHeight = crop?.sh || video.videoHeight || 720;
  const scale = Math.min(1, maxWidth / sourceWidth);
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('camera'));
  if (crop) ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  else ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

export async function openCamera(video: HTMLVideoElement, facing: 'user' | 'environment' = 'user') {
  const previous = video.srcObject;
  if (previous instanceof MediaStream) stopStream(previous);

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}
