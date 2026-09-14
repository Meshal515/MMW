export function technicalHints({bitrate=0,sampleRate=0,codec='',fileSize=0,duration=0}={}){
  return { bitrate:Number(bitrate||0), sampleRate:Number(sampleRate||0), codec:String(codec||''), density:duration&&fileSize?fileSize/duration:0 };
}

// Expensive waveform/fingerprint analysis belongs in a Worker/backend. The browser
// keeps the schema ready without pretending filename size alone proves quality.
export const ANALYSIS_FIELDS=['clipping','dropouts','noise','spectralBandwidth','fingerprint'];
