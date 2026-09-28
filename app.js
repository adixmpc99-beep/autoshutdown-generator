function fromBase64(s){return Uint8Array.from(atob(s), c=>c.charCodeAt(0));}
function toBase32(bytes){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0, value=0, out='';for(let i=0;i<bytes.length;i++){value=(value<<8)|bytes[i];bits+=8;while(bits>=5){out+=alphabet[(value>>(bits-5))&31];bits-=5;}}if(bits>0) out+=alphabet[(value<<(5-bits))&31];return out;}

function groupCode(s){return s.match(/.{1,4}/g).join('-');}

function hmacSha256(key, msg){return crypto.subtle.importKey('raw', key, {name:'HMAC',hash:'SHA-256'}, false, ['sign']).then(k=>crypto.subtle.sign('HMAC', k, msg)).then(buf=>new Uint8Array(buf));}
async function hashPin(pin){return crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin)).then(buf=>toBase64(new Uint8Array(buf)));}
function toBase64(bytes){return btoa(String.fromCharCode(...bytes));}

function generateCode(secret){
  const nonce = crypto.getRandomValues(new Uint8Array(8));
  return hmacSha256(secret, nonce).then(mac=>{
    const macTrunc = mac.slice(0,5);
    const combined = new Uint8Array(nonce.length+macTrunc.length);
    combined.set(nonce,0);combined.set(macTrunc,nonce.length);
    const b32 = toBase32(combined);
    return groupCode(b32);
  });
}

document.getElementById('pairBtn').addEventListener('click', ()=>{
  const txt = document.getElementById('pairing').value.trim();
  try{
    const obj = JSON.parse(txt);
    if(!obj.secret){document.getElementById('status').innerText='Pairing JSON tidak mengandung secret';return}
    const secret = fromBase64(obj.secret);
    const pin = document.getElementById('pin').value||'';
    if(pin.length<4){document.getElementById('status').innerText='PIN minimal 4 digit';return}
    localStorage.setItem('paired_secret', toBase64(secret));
    localStorage.setItem('paired_device', obj.deviceId||'');
    hashPin(pin).then(hash=>{
      localStorage.setItem('pin_hash', hash);
      document.getElementById('status').innerText='Ter-pair. Generator siap.';
    });

    document.getElementById('scanBtn').addEventListener('click', async ()=>{
      const status = document.getElementById('status');
      if(!('BarcodeDetector' in window) || !navigator.mediaDevices){
        status.innerText='Pemindaian kamera tidak didukung browser ini. Salin JSON pairing secara manual.';
        return;
      }
      const video = document.getElementById('camera');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      } catch (error) {
        status.innerText='Kamera tidak dapat dibuka. Periksa izin kamera atau tempel JSON pairing.';
        return;
      }
      video.hidden = false;
      video.srcObject = stream;
      await video.play();
      const detector = new BarcodeDetector({formats:['qr_code']});
      status.innerText='Arahkan kamera ke QR pairing.';
      const scan = async ()=>{
        const codes = await detector.detect(video);
        if(codes.length){
          document.getElementById('pairing').value = codes[0].rawValue;
          stream.getTracks().forEach(track=>track.stop());
          video.hidden = true;
          status.innerText='QR terbaca. Masukkan PIN lalu tekan Pair.';
          return;
        }
        requestAnimationFrame(scan);
      };
      scan();
    });
  }catch(e){document.getElementById('status').innerText='JSON pairing tidak valid: '+e}
});

document.getElementById('genBtn').addEventListener('click', async ()=>{
  const p = localStorage.getItem('paired_secret');
  if(!p){document.getElementById('status').innerText='Belum pairing';return}
  const pin = window.prompt('Masukkan PIN generator');
  if(!pin || !(await hashPin(pin) === localStorage.getItem('pin_hash'))){
    document.getElementById('status').innerText='PIN salah.';
    return;
  }
  const secretStr = atob(p);
  const secret = new Uint8Array([...secretStr].map(ch=>ch.charCodeAt(0)));
  const codes = [];
  for(let i=0;i<7;i++){
    const c = await generateCode(secret);
    codes.push(c);
  }
  document.getElementById('codes').innerText = codes.join('\n');
});

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
