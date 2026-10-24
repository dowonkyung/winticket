export const BOOKING_PHRASES=Object.freeze(['썬웨이비취파라쏠','나부끼는선창가','위에앉아바라본시원한바다','오고가는사람들이','지나가는태양의길목','사랑하는사람들이','지나가는이곳에','인적이끊어질라','연락선오고갈라','뱃고동소리울리면','사람들이별의노래']);
export const normalizePhrase=value=>typeof value==='string'?value.normalize('NFC').trim():'';
