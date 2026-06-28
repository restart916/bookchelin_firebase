'use strict';
// publisher 빈 + 활성(hidden !== true) + 기존 출판사 code 확정 가능한 책만 출력
// 북슐랭, 롤링다이스, 휴먼컬처아리랑은 제외 (기존 publisher 없음)
const path = require('path');
const admin = require('firebase-admin');
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

// bookId → 기존 출판사 code (북슐랭·롤링다이스·휴먼컬처아리랑 제외)
const MAPPING = {
  'xWk5c1oQPMD2ev3yg2qS': 'seokyo12',
  'NqdheCJhvx9PYWIiXbSd': 'freewill19',
  'vUSBUdinJl3m9WbdnhBn': 'insight17',
  'Qz8t3SxTymdVijwWxXib': 'seokyo12',
  '5aTWNdiG8Y4x7sg54hvF': 'b612books14',
  'G1lLx6iFomI3ee8diFmL': 'b612books14',
  'C6nsiMrjr1PM3IgVdQk5': 'freewill19',
  'loM7Rwzm9dYCB3xhy8c0': 'seokyo12',
  'yKX50Zv7HYZXWJReVss1': '1000gru15',
  'xJEKFglGgU2rX14VuAZq': 'freewill19',
  '5VvOAJxz9rjjPhVYTiFN': '1000gru15',
  '22BI9R2ozjpbokhDGELt': '1000gru15',
  'zz1k9iv85PXYfWvh1eF4': 'seokyo12',
  'gYrqlVN4xhpXKLc9I7c9': 'insight17',
  'LFiIORoIoDTpr2h0YGS2': 'b612books14',
  'Acnum01eWB7pSQNxtQG0': 'freewill19',
  'PxRBivBHDOGQEnmrPCTe': 'b612books14',
  'rxUHGhnr3rsdbDge1TzS': 'b612books14',
  '5zZEIciEGmkuOjvOH767': 'seokyo12',
  'mqUiTb9rgnHcSOSXlGZI': 'seokyo12',
  'OMVcrlfWzFhHBEQuOB8F': 'b612books14',
  'idktaAntvY4uPRWtyzBB': 'freewill19',
  'HKUhbNwqu0dxioN6yTOA': 'freewill19',
  'eme4nWCjrqf6oVoImCK7': 'insight17',
  'cLPIT51C3l5rTBlVsmRk': 'yhmedia11',
  'tMBANxfK7mRlbysc4ANN': 'iwell13',
  'fll3IJCDrEIxEL6jVMDs': 'yhmedia11',
  'ZeZ8IIYkqS44sw3PdECv': 'freewill19',
  'Xcp5Q0DwqfjXaMTDryTE': 'freewill19',
  '58HHcMC3fj6kLDMnjTt2': 'freewill19',
  '0vOi2oscEF6jPNEJVY8a': 'freewill19',
  'kvHMMqvaOmhbIi0iHtaQ': 'freewill19',
  'gHIU34AWPAHXt8IuYqJC': 'yhmedia11',
  'ZPYWx3tG0mRyAMdCADgb': 'yhmedia11',
  'Sdd2XWr2GySixFdVcDR7': 'freewill19',
  'azO8ybRrwNKWfTh1nHQP': 'yhmedia11',
  'EBurVXleO30SuZIFXTEy': 'freewill19',
  'oFaVaGbrYHoe5ggU0PXR': '1000gru15',
  'TzYTouegHV5cllCkphlO': 'yhmedia11',
  'XQLEF6PV8b9ALiqG0eoS': 'yhmedia11',
  'JSfqVOFV5NZSuODkTSfS': 'yhmedia11',
  'iEUh6DokeBhOQlToLZOf': 'yhmedia11',
  'iPiMP0n6pIpC1pUw7f5z': 'b612books14',
  'gFEq86uekTTn2aMJStW2': 'iwell13',
  'b4jzEY3bKW4Y4gH4dLCg': 'yhmedia11',
  'JUFcCGBTIdKPVZM5Gyt0': 'iwell13',
  'i3pSB8NKu3sfHNQfsM0l': 'uibooks16',
  'zso82GIb5rHp2THQ3ccv': 'yhmedia11',
  'VsrHbTgZUSoVCtFgXouu': 'uibooks16',
  'SC6uaUzj7kA2TmFWp8aB': 'iwell13',
  'XfEVDCzx0oN4cSSPgB3P': 'iwell13',
  '7pQKz9ud6ewUZf9PUnE5': 'yhmedia11',
  'uBZVt6npdXnZfyjThaL6': 'iwell13',
  'bxNICWEqm9omj5LFf2er': 'seokyo12',
  'da0SZIMnz5T4Sy3Jgmn4': 'yhmedia11',
  '0fqG9RYrmrGvoaDl04vm': 'yhmedia11',
  '9D6X30Nhy1f8Upa5Yg9B': 'insight17',
  'Feousxy8f3Shm1bJnaxx': 'freewill19',
  'dypYe2bcF1X3eivuKmwm': 'yhmedia11',
  'UdgqXPBn6VuNINblSsZx': 'yhmedia11',
  'Oedvuvu2V2FCDYSZldWk': 'yhmedia11',
  'wemPkYcxps3EqVIBYtME': 'freewill19',
  'jCr6CF8BJmx4yju9PLpz': 'yhmedia11',
  'SGbFnVDKNgS5R9tthsCq': 'yhmedia11',
  'm9HMUPNaXEJOcpB0jxOx': 'iwell13',
  '2AxMmO3kjxwghuJsF3Sk': 'yhmedia11',
  'wXQesh1CD5KNQ6t74FG4': 'yhmedia11',
  'BE25xi4fv2bfazil7D7P': 'iwell13',
  'PAHTS1FTqkoKXAvGweiT': 'yhmedia11',
  'gezx8dikAIvFpAJmHaEI': 'yhmedia11',
  'Bmw41vJIDye7KbxFHNYd': 'yhmedia11',
  'AkRY4yGaBy4aalID8HaB': 'yhmedia11',
  'pYsljsdaV0OjmpgJvKMO': 'seokyo12',
  'B0EvNeFYIrJCmhAm9HOq': 'b612books14',
  'Pl8PRFVZAkfXuVCUhTD5': 'seokyo12',
  'HI1Q3MDb6NsvLJpyim6c': 'iwell13',
  'NwfeTZPm3VxIkW4UeNtK': 'b612books14',
  'AhpG3sWZruJxivNQQZSL': 'insight17',
  'QuQKZGuhBaxBAbTqB1D4': 'yhmedia11',
  'pvNKQI9AF4caC4aGWBAC': 'yhmedia11',
  'ELnHf2YyxK8zjmA6yGtm': 'yhmedia11',
  'JgYFlQORy8HcoX86qP21': 'yhmedia11',
  'rLSV5LoG0xZsBYpjBYTa': 'yhmedia11',
  'B2VdMVqjQkXvHsFNcnZY': 'freewill19',
  'GMFcuuJ35N54qgAredNB': 'yhmedia11',
  'ip9eoPiQJDmGCUjCw6Jg': 'seokyo12',
  'vvU0esZjwNYiONnQ9DHr': 'uibooks16',
  'ceT5INmr5StPTrNbkxeq': 'freewill19',
  'mllVa6kiV9cm2RrwYRtb': 'iwell13',
  'MOMLWPyxp3tvW7Yp7t6g': 'iwell13',
  'YVw5oMVlwuf4N8F4su5E': 'iwell13',
  'xvPQSQkVInHgIdaXUiAR': 'yhmedia11',
  'KudMvphj3S1zNT5X1L9s': 'yhmedia11',
  'aSmj328QhobKjESRsNof': 'yhmedia11',
  'Bj67aWrBac6hBpaMFCzl': 'freewill19',
  'SZo8arkDvyhxweocpP8n': 'freewill19',
  'lasdXGrTPwZq6osly5UM': 'freewill19',
  'xBvK0ezhXF3MGlZD5L3B': 'yhmedia11',
  '02IEPKaGI0PrgxhfXbkz': 'iwell13',
  'K9vE9btuVuERTtA4mKfV': 'seokyo12',
  'qPyhmGLjSqO2Uagb7I8d': 'seokyo12',
  'iq9IY4kAUUkY46FeGhao': 'yhmedia11',
  'bPzs2pYSgrmCUolDx6WZ': 'iwell13',
  'AP50hkmqEev01tigkQDB': 'iwell13',
  'TqD4YLYjuygMnXWVBhb4': 'yhmedia11',
  'qS2KgRTu7qxiZuTmLkOc': 'yhmedia11',
  'h8qErNP4ia4BWEjVaHSU': 'freewill19',
  'eVMNpLlEsUSIOrUd9Y2w': 'freewill19',
  '11jbldNEewJhRXrGYlvX': 'iwell13',
  '3Vkt0TQ8rIKfBwtZXnkK': 'seokyo12',
  'Ws2bQV1Co7bcOmmzytP2': 'freewill19',
  '3wAThzkKhZtMi78870UX': 'seokyo12',
  'rX9a3gUVCoatSPm5VvFH': 'yhmedia11',
  'YfJPLtXCizvJ9wARs923': 'yhmedia11',
  'fNYImLerudbu9zn5guMh': 'yhmedia11',
  '3ha83bwVkMbulJJF6wjk': 'yhmedia11',
  'YjU28OIj8MQrkqr71zQ1': 'insight17',
  'rpNWzibM7ZpXUxI5xV1T': 'yhmedia11',
  'UdFpVBhLrrKarqd4nQo0': 'yhmedia11',
  'MZQLdCUmX4eq1AJS8Eke': 'yhmedia11',
  '9OCfJLB3mDs5QqUVTp7R': 'iwell13',
  'FVNLicKCKbVREyONFCfq': 'yhmedia11',
  'IQEXVsNh9lhuJvDByqG3': 'insight17',
  'KSE27Aj8QoWOa13X1Anj': 'seokyo12',
  'AO3vjbj9mAVACrN9Gnvy': 'yhmedia11',
  '33OeDqRHFejLMGVfAY1J': 'yhmedia11',
  'bP9SrNJqgZHTJxBOJGoz': 'iwell13',
  'x6G4lTcoL9ruyD14UDOT': 'yhmedia11',
  'VOLnEqk1PJmjMeSNRaEr': 'seokyo12',
  'wvLDCtei3htOZ9vrIXr0': 'yhmedia11',
  'POGkzssvQQRA1XRwPxtH': 'seokyo12',
  'KOHOl078vTq51svlX5ce': 'yhmedia11',
  'COwx6VWqJKaVz5EzYdBA': 'yhmedia11',
  'ZDRctWGwDslzeGEySoRg': 'iwell13',
  'YUisJM9CosfGnJTI8E33': 'yhmedia11',
  'eRKjqCBcmjG9WfNMYvt9': 'uibooks16',
  'otbSSjmTB9yeNQloBDjf': 'insight17',
  'urUZZdFqnqLlnjBN1Kf5': 'freewill19',
  'vHGdZIe8clXk0AdzH1Uu': 'freewill19',
  'bNPchW0t2Ne76saXwYCK': 'freewill19',
  'zqfH7ofpKalzR6EBjC9B': 'freewill19',
  'kyVfagSdC0bXlDmOma8Y': 'freewill19',
  'A5QvOUScGBMyrejLTRYK': 'yhmedia11',
  'EoaIx0a4aTcbdlwteSDi': 'yhmedia11',
  'ugqX6yd79MJKspWYVBD4': 'yhmedia11',
  'xuLZvyfPtN5UIRlKc4gE': 'freewill19',
  'gpR7mDqU4wJt2dUB1wFX': 'yhmedia11',
  'r8M8hNG0xIug9hpgMCM8': 'seokyo12',
  'i88UtnzhIDUbDEHGgZ2A': 'yhmedia11',
  'cRbpPSvqHi9isphvyErq': 'iwell13',
  'PKppoNR0H2NgO9vyJKAl': 'yhmedia11',
  'wjeh5qPRT2HhOYmp4lcI': 'yhmedia11',
  'GbEWOyeNkI4l7Z1m6Sep': 'yhmedia11',
  'BBRSsukar5nCDnFITCCO': 'yhmedia11',
  'NKXWlnXUviUnbHlLZ5gE': 'yhmedia11',
  'iKeiBV6DPSI3oofsBQmr': 'yhmedia11',
  'FsJUpEbzIeTSbhJzTTQM': 'uibooks16',
  '9h2gM2C0tpUlHxkPHIw1': 'yhmedia11',
  'ANRZBYmoCF8dAPfC7lMM': 'yhmedia11',
  'niL8KtyA6AIc8ZCHlN6H': 'yhmedia11',
  'cuxO6MRub8y0NbEkcz9N': 'yhmedia11',
  'DkqyxLypIjkENJwgCWoG': 'seokyo12',
  'zsrlqjQ5fqJzHfmbCgkg': 'yhmedia11',
  'ZuN5cOoZBbi8WuzQUdxt': 'yhmedia11',
  'giwLwHy78AIGVYDkFy5T': 'freewill19',
  'q8K7PQJyx94pJ2TwQtpF': 'seokyo12',
  'UvZjSGsTswJX5bhCMrrN': 'seokyo12',
  'GbExDtZzhy67GEasLmyB': 'seokyo12',
  'OgRY6mBOIOYiQjiMeDU5': 'yhmedia11',
  'Gfbwe3Z4k9DIPhwjkAB8': 'freewill19',
  'mtBAVHhXQfhonEFYURs5': 'yhmedia11',
  'aJ3Mss3of6nd7S0kLbcI': 'yhmedia11',
  'pC0C96knXGlOh4AZghhg': 'yhmedia11',
  'Nr3KDOngJwumIvzDaaVK': 'iwell13',
  'kuXF4Ou7wbm8kf6KFK35': 'yhmedia11',
  'mgvxMRIiIqpzv79zAGNc': 'bookoc119',  // 북오션
  // insight17 계열
  'VbJj0uesutu54fBr2q3h': 'insight17',
  'kFiELOx5uY3CvgsQChFU': 'insight17',
  'h0jlelIWOLnU2xXMsNUt': 'insight17',
  'ot0R1mmJ1f0pjuoRIus5': 'insight17',
  'TEK7o9f14Aymar818ngo': 'insight17',
  'Suy0VqDwpBjs9V7KIQTD': 'insight17',
  'OyDihN1qdLhhkSL7bIbZ': 'insight17',
  'H3ECdNovOoAqftsog42M': 'insight17',
  'PPDRF0uZ1O7Y22I95ztC': 'insight17',
  'x4meqY82YuIX1ky9n0Cj': 'seokyo12',
  'KnGh3mPgymWen8HJU39B': 'seokyo12',
  'VfUsSiXjPavSZxEabFi2': 'seokyo12',
  'NugFlc7WUbTnV11Qob1W': 'seokyo12',
  'o2yRkISresgi1ZXgazCm': 'seokyo12',
  'Fnes82bDKVLfP6GreGqP': 'seokyo12',
  'AA28NK7AI1G9Fgl6On0y': 'yhmedia11',
  'Sy2xeQW7iyGjfmXIUwE9': 'yhmedia11',
  'WlTzd4QQLEzGOnmyp8H0': 'yhmedia11',
  'Ub1mPv3z1y7WNjOUWbbf': 'yhmedia11',
  'rZMTVqOjMoDLxPqy9RSY': 'yhmedia11',
  'yD45oPyHHBKm3L2rLARM': 'yhmedia11',
  'cQlC1lbt6YxGrBRbgIlw': 'yhmedia11',
  'TXdPL6qgzcZ7UnBaKYfK': 'yhmedia11',
  'oWPknmwXX65XHEahi6GD': 'yhmedia11',
  'U47EqsEOyFK4XfkmEspg': 'yhmedia11',
  'pi2gBfl33Pu1svJsLPFx': 'yhmedia11',
  'LGDesW7HCRxr9FTAwR1s': 'yhmedia11',
  'N2gFNjLWc0XNAMXOQxVR': 'yhmedia11',
  '4or3xMN6WP5TM3N2reDZ': 'yhmedia11',
  'aoZLDxXOLGnQRK8541DY': 'yhmedia11',
};

const CODE_NAME = {
  yhmedia11: 'YH미디어',
  freewill19: '프리윌',
  seokyo12: '서교출판사',
  iwell13: '아이웰콘텐츠',
  b612books14: 'B612북스',
  insight17: '인사이트브리즈',
  uibooks16: '유아이북스',
  '1000gru15': '천그루숲',
  bookoc119: '북오션',
};

async function main() {
  const snap = await db.collection('books').get();

  const result = [];
  for (const d of snap.docs) {
    const data = d.data();
    const pub = data.publisher;
    const isEmptyPub = pub === undefined || pub === null || pub === '';
    if (!isEmptyPub) continue;
    if (data.hidden === true) continue;  // 비활성 제외

    const code = MAPPING[d.id];
    if (!code) continue;

    result.push({
      title: String(data.title || ''),
      bookId: d.id,
      pubName: CODE_NAME[code] || code,
      code,
    });
  }

  // 출판사별 정렬
  result.sort((a, b) => a.pubName.localeCompare(b.pubName, 'ko') || a.title.localeCompare(b.title, 'ko'));

  console.log(`활성 + publisher 빈 + 기존 출판사 연결 가능: ${result.length}건\n`);

  let curPub = '';
  for (const r of result) {
    if (r.pubName !== curPub) {
      curPub = r.pubName;
      console.log(`\n▶ ${r.pubName} (${r.code})`);
      console.log('  제목\tbookId');
    }
    console.log(`  ${r.title}\t${r.bookId}`);
  }

  console.log('\n\n=== 출판사별 건수 ===');
  const byPub = {};
  for (const r of result) {
    byPub[r.pubName] = (byPub[r.pubName] || 0) + 1;
  }
  for (const [pub, cnt] of Object.entries(byPub).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pub}: ${cnt}건`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
