export interface ComparableCertificate { expiresAt?: Date; }
export function compareCertificates(edge:ComparableCertificate|undefined,originEnabled:boolean,origin:ComparableCertificate|undefined){
  const edgeChecked=Boolean(edge?.expiresAt);const originChecked=Boolean(origin?.expiresAt);
  const mismatch=Boolean(edge?.expiresAt&&origin?.expiresAt&&edge.expiresAt.valueOf()!==origin.expiresAt.valueOf());
  const earliestType=edge?.expiresAt&&origin?.expiresAt?(origin.expiresAt<edge.expiresAt?"ORIGIN":"PUBLIC"):origin?.expiresAt?"ORIGIN":edge?.expiresAt?"PUBLIC":undefined;
  return {edgeChecked,originChecked,originStatus:originEnabled?(originChecked?"CHECKED":"UNKNOWN"):"NOT_CONFIGURED",mismatch,earliestType};
}
