import { variantScore } from './core.js';

export function rankVariants(recitation){
  return [...(recitation.variants||[])].sort((a,b)=>variantScore(b)-variantScore(a));
}

// The resolver ranks variants only after they are already attached to the same
// canonical recording. Recording identity always outranks technical quality.
export function bestVariant(recitation){
  if(recitation.preferredVariantId){const picked=(recitation.variants||[]).find(v=>v.id===recitation.preferredVariantId);if(picked)return picked}
  return rankVariants(recitation)[0]||null;
}
