export interface ComparableCertificate { expiresAt?: Date; }
export function compareCertificates(edge:ComparableCertificate|undefined,originEnabled:boolean,origin:ComparableCertificate|undefined){
  const edgeChecked=Boolean(edge?.expiresAt);const originChecked=Boolean(origin?.expiresAt);
  const mismatch=Boolean(edge?.expiresAt&&origin?.expiresAt&&edge.expiresAt.valueOf()!==origin.expiresAt.valueOf());
  const earliestType=edge?.expiresAt&&origin?.expiresAt?(origin.expiresAt<edge.expiresAt?"ORIGIN":"PUBLIC"):origin?.expiresAt?"ORIGIN":edge?.expiresAt?"PUBLIC":undefined;
  return {edgeChecked,originChecked,originStatus:originEnabled?(originChecked?"CHECKED":"UNKNOWN"):"NOT_CONFIGURED",mismatch,earliestType};
}

export function certificateChangeType(previous:{fingerprint?:string|null;expiresAt?:Date|null}|undefined,current:{fingerprint?:string;expiresAt?:Date}|undefined){
  if(!previous?.fingerprint||!current?.fingerprint||previous.fingerprint===current.fingerprint)return undefined;
  return previous.expiresAt&&current.expiresAt&&current.expiresAt>previous.expiresAt?"CERTIFICATE_RENEWED" as const:"CERTIFICATE_CHANGED" as const;
}
