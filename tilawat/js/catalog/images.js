export function resolveImage(recitation, reciter={}){
  return recitation.cover || reciter.heroImage || reciter.avatar || recitation.sourceThumbnail || (recitation.gallery||[])[0] || '';
}

export function imagePriority(){
  return ['manual','trusted-reciter','archive-recording','source-thumbnail','procedural'];
}
