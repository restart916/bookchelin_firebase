'use strict';
/**
 * 286건(publisher 빈 책)과 사용자 제공 매핑을 bookId 기준으로 조인.
 * publisher 컬렉션을 실제 조회해 출판사명 → code 변환.
 */
const path = require('path');
const admin = require('firebase-admin');
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

// ── 사용자 제공 전체 매핑 (bookId → 출판사명) ─────────────────────────────
const MAPPING = {
  'xWk5c1oQPMD2ev3yg2qS': '서교출판사',
  'NqdheCJhvx9PYWIiXbSd': '프리윌',
  'vUSBUdinJl3m9WbdnhBn': '인사이트브리즈',
  '2n2WR4QmKmxCwLLG7fDj': '북슐랭',
  'Qz8t3SxTymdVijwWxXib': '서교출판사',
  '5aTWNdiG8Y4x7sg54hvF': 'B612북스',
  'RJhgp8PtSc3boa9A9lWN': '북슐랭',
  'G1lLx6iFomI3ee8diFmL': 'B612북스',
  'C6nsiMrjr1PM3IgVdQk5': '프리윌',
  'loM7Rwzm9dYCB3xhy8c0': '서교출판사',
  'yKX50Zv7HYZXWJReVss1': '천그루숲',
  '4DGWGH8N2ylPQeOcnNMU': '북슐랭',
  'xJEKFglGgU2rX14VuAZq': '프리윌',
  'SAzIwZ0K40He1SnlAg8R': '북슐랭',
  '5VvOAJxz9rjjPhVYTiFN': '천그루숲',
  '22BI9R2ozjpbokhDGELt': '천그루숲',
  'zz1k9iv85PXYfWvh1eF4': '서교출판사',
  'gYrqlVN4xhpXKLc9I7c9': '인사이트브리즈',
  'LFiIORoIoDTpr2h0YGS2': 'B612북스',
  'Acnum01eWB7pSQNxtQG0': '프리윌',
  'PxRBivBHDOGQEnmrPCTe': 'B612북스',
  'ccXEhn7BGSga4w1uXVrd': '북슐랭',
  'rxUHGhnr3rsdbDge1TzS': 'B612북스',
  '5zZEIciEGmkuOjvOH767': '서교출판사',
  'mqUiTb9rgnHcSOSXlGZI': '서교출판사',
  'OMVcrlfWzFhHBEQuOB8F': 'B612북스',
  'idktaAntvY4uPRWtyzBB': '프리윌',
  'HKUhbNwqu0dxioN6yTOA': '프리윌',
  'eme4nWCjrqf6oVoImCK7': '인사이트브리즈',
  'cLPIT51C3l5rTBlVsmRk': 'YH미디어',
  'tMBANxfK7mRlbysc4ANN': '아이웰콘텐츠',
  'YO25z4pHv8Ku8hmnzM0H': '휴먼컬처아리랑',
  'fll3IJCDrEIxEL6jVMDs': 'YH미디어',
  'ZeZ8IIYkqS44sw3PdECv': '프리윌',
  'Xcp5Q0DwqfjXaMTDryTE': '프리윌',
  '58HHcMC3fj6kLDMnjTt2': '프리윌',
  '0vOi2oscEF6jPNEJVY8a': '프리윌',
  'kvHMMqvaOmhbIi0iHtaQ': '프리윌',
  'I92bOt6AbUIMdE8UhQtN': '휴먼컬처아리랑',
  'gHIU34AWPAHXt8IuYqJC': 'YH미디어',
  'i8PlmvPEETIGKzitcZTG': '북슐랭',
  'ZPYWx3tG0mRyAMdCADgb': 'YH미디어',
  'Sdd2XWr2GySixFdVcDR7': '프리윌',
  'azO8ybRrwNKWfTh1nHQP': 'YH미디어',
  'EBurVXleO30SuZIFXTEy': '프리윌',
  'oFaVaGbrYHoe5ggU0PXR': '천그루숲',
  'TzYTouegHV5cllCkphlO': 'YH미디어',
  'XQLEF6PV8b9ALiqG0eoS': 'YH미디어',
  'nEZQvcZFO5UX2s5Hmlhl': '휴먼컬처아리랑',
  'EY5DKRGNxq1vw1EXYpbp': '휴먼컬처아리랑',
  'JSfqVOFV5NZSuODkTSfS': 'YH미디어',
  'L52bUdVaVIZDpC4UUPED': '롤링다이스',
  'iEUh6DokeBhOQlToLZOf': 'YH미디어',
  'iPiMP0n6pIpC1pUw7f5z': 'B612북스',
  'MYhFG0a6tgK4IwRn95ti': '롤링다이스',
  'gFEq86uekTTn2aMJStW2': '아이웰콘텐츠',
  'b4jzEY3bKW4Y4gH4dLCg': 'YH미디어',
  'JUFcCGBTIdKPVZM5Gyt0': '아이웰콘텐츠',
  'i3pSB8NKu3sfHNQfsM0l': '유아이북스',
  'zso82GIb5rHp2THQ3ccv': 'YH미디어',
  'VsrHbTgZUSoVCtFgXouu': '유아이북스',
  'SC6uaUzj7kA2TmFWp8aB': '아이웰콘텐츠',
  'XfEVDCzx0oN4cSSPgB3P': '아이웰콘텐츠',
  '7pQKz9ud6ewUZf9PUnE5': 'YH미디어',
  'uBZVt6npdXnZfyjThaL6': '아이웰콘텐츠',
  'bxNICWEqm9omj5LFf2er': '서교출판사',
  'da0SZIMnz5T4Sy3Jgmn4': 'YH미디어',
  '0fqG9RYrmrGvoaDl04vm': 'YH미디어',
  '9D6X30Nhy1f8Upa5Yg9B': '인사이트브리즈',
  'Feousxy8f3Shm1bJnaxx': '프리윌',
  'dypYe2bcF1X3eivuKmwm': 'YH미디어',
  'UdgqXPBn6VuNINblSsZx': 'YH미디어',
  'Oedvuvu2V2FCDYSZldWk': 'YH미디어',
  'wemPkYcxps3EqVIBYtME': '프리윌',
  'd0rYPex4lBgKillu8y9y': '휴먼컬처아리랑',
  'Dkvtkm9RQwux4MjlhSut': '롤링다이스',
  'lBGsZ7Dr0ShhJWKOdY2M': '휴먼컬처아리랑',
  'jCr6CF8BJmx4yju9PLpz': 'YH미디어',
  'SGbFnVDKNgS5R9tthsCq': 'YH미디어',
  'm9HMUPNaXEJOcpB0jxOx': '아이웰콘텐츠',
  '2AxMmO3kjxwghuJsF3Sk': 'YH미디어',
  'wXQesh1CD5KNQ6t74FG4': 'YH미디어',
  'BE25xi4fv2bfazil7D7P': '아이웰콘텐츠',
  'PAHTS1FTqkoKXAvGweiT': 'YH미디어',
  'gezx8dikAIvFpAJmHaEI': 'YH미디어',
  'Bmw41vJIDye7KbxFHNYd': 'YH미디어',
  'AkRY4yGaBy4aalID8HaB': 'YH미디어',
  'pYsljsdaV0OjmpgJvKMO': '서교출판사',
  'B0EvNeFYIrJCmhAm9HOq': 'B612북스',
  'tA3Z01rKySC8UuRCZ178': '롤링다이스',
  'Pl8PRFVZAkfXuVCUhTD5': '서교출판사',
  'HI1Q3MDb6NsvLJpyim6c': '아이웰콘텐츠',
  'NwfeTZPm3VxIkW4UeNtK': 'B612북스',
  'AhpG3sWZruJxivNQQZSL': '인사이트브리즈',
  'QuQKZGuhBaxBAbTqB1D4': 'YH미디어',
  'pvNKQI9AF4caC4aGWBAC': 'YH미디어',
  'ELnHf2YyxK8zjmA6yGtm': 'YH미디어',
  'JgYFlQORy8HcoX86qP21': 'YH미디어',
  'ElSOdjQa0lC8iBzgVimB': '휴먼컬처아리랑',
  '30VOusmeGVYUcZZUUwch': '롤링다이스',
  'XmgqQcos9VgWJhQvjPKd': '롤링다이스',
  'yZjjaIfk9gqrify8yVX7': '롤링다이스',
  'sVi9SV0bqKiRf6uvguMg': '롤링다이스',
  'rLSV5LoG0xZsBYpjBYTa': 'YH미디어',
  'B2VdMVqjQkXvHsFNcnZY': '프리윌',
  'GMFcuuJ35N54qgAredNB': 'YH미디어',
  'ip9eoPiQJDmGCUjCw6Jg': '서교출판사',
  'vvU0esZjwNYiONnQ9DHr': '유아이북스',
  'ceT5INmr5StPTrNbkxeq': '프리윌',
  'mllVa6kiV9cm2RrwYRtb': '아이웰콘텐츠',
  'MOMLWPyxp3tvW7Yp7t6g': '아이웰콘텐츠',
  'YVw5oMVlwuf4N8F4su5E': '아이웰콘텐츠',
  'xvPQSQkVInHgIdaXUiAR': 'YH미디어',
  'KudMvphj3S1zNT5X1L9s': 'YH미디어',
  'aSmj328QhobKjESRsNof': 'YH미디어',
  'Bj67aWrBac6hBpaMFCzl': '프리윌',
  'SZo8arkDvyhxweocpP8n': '프리윌',
  'lasdXGrTPwZq6osly5UM': '프리윌',
  'xBvK0ezhXF3MGlZD5L3B': 'YH미디어',
  '02IEPKaGI0PrgxhfXbkz': '아이웰콘텐츠',
  'K9vE9btuVuERTtA4mKfV': '서교출판사',
  'qPyhmGLjSqO2Uagb7I8d': '서교출판사',
  'iq9IY4kAUUkY46FeGhao': 'YH미디어',
  'bPzs2pYSgrmCUolDx6WZ': '아이웰콘텐츠',
  'AP50hkmqEev01tigkQDB': '아이웰콘텐츠',
  'TqD4YLYjuygMnXWVBhb4': 'YH미디어',
  'qS2KgRTu7qxiZuTmLkOc': 'YH미디어',
  'h8qErNP4ia4BWEjVaHSU': '프리윌',
  'eVMNpLlEsUSIOrUd9Y2w': '프리윌',
  '11jbldNEewJhRXrGYlvX': '아이웰콘텐츠',
  '3Vkt0TQ8rIKfBwtZXnkK': '서교출판사',
  'Ws2bQV1Co7bcOmmzytP2': '프리윌',
  '3wAThzkKhZtMi78870UX': '서교출판사',
  'rX9a3gUVCoatSPm5VvFH': 'YH미디어',
  'YfJPLtXCizvJ9wARs923': 'YH미디어',
  'fNYImLerudbu9zn5guMh': 'YH미디어',
  '3ha83bwVkMbulJJF6wjk': 'YH미디어',
  'YjU28OIj8MQrkqr71zQ1': '인사이트브리즈',
  'rpNWzibM7ZpXUxI5xV1T': 'YH미디어',
  'UdFpVBhLrrKarqd4nQo0': 'YH미디어',
  'MZQLdCUmX4eq1AJS8Eke': 'YH미디어',
  '9OCfJLB3mDs5QqUVTp7R': '아이웰콘텐츠',
  'FVNLicKCKbVREyONFCfq': 'YH미디어',
  'IQEXVsNh9lhuJvDByqG3': '인사이트브리즈',
  'KSE27Aj8QoWOa13X1Anj': '서교출판사',
  'AO3vjbj9mAVACrN9Gnvy': 'YH미디어',
  '33OeDqRHFejLMGVfAY1J': 'YH미디어',
  'bP9SrNJqgZHTJxBOJGoz': '아이웰콘텐츠',
  'x6G4lTcoL9ruyD14UDOT': 'YH미디어',
  'VOLnEqk1PJmjMeSNRaEr': '서교출판사',
  'wvLDCtei3htOZ9vrIXr0': 'YH미디어',
  'POGkzssvQQRA1XRwPxtH': '서교출판사',
  'KOHOl078vTq51svlX5ce': 'YH미디어',
  'COwx6VWqJKaVz5EzYdBA': 'YH미디어',
  'ZDRctWGwDslzeGEySoRg': '아이웰콘텐츠',
  'YUisJM9CosfGnJTI8E33': 'YH미디어',
  'eRKjqCBcmjG9WfNMYvt9': '유아이북스',
  'otbSSjmTB9yeNQloBDjf': '인사이트브리즈',
  'urUZZdFqnqLlnjBN1Kf5': '프리윌',
  'vHGdZIe8clXk0AdzH1Uu': '프리윌',
  'bNPchW0t2Ne76saXwYCK': '프리윌',
  'zqfH7ofpKalzR6EBjC9B': '프리윌',
  'kyVfagSdC0bXlDmOma8Y': '프리윌',
  'A5QvOUScGBMyrejLTRYK': 'YH미디어',
  'EoaIx0a4aTcbdlwteSDi': 'YH미디어',
  'ugqX6yd79MJKspWYVBD4': 'YH미디어',
  'xuLZvyfPtN5UIRlKc4gE': '프리윌',
  'gpR7mDqU4wJt2dUB1wFX': 'YH미디어',
  'Yn7WYfu75ugrkHoGqgEO': '롤링다이스',
  'r8M8hNG0xIug9hpgMCM8': '서교출판사',
  'i88UtnzhIDUbDEHGgZ2A': 'YH미디어',
  'cRbpPSvqHi9isphvyErq': '아이웰콘텐츠',
  'PKppoNR0H2NgO9vyJKAl': 'YH미디어',
  'wjeh5qPRT2HhOYmp4lcI': 'YH미디어',
  'GbEWOyeNkI4l7Z1m6Sep': 'YH미디어',
  'BBRSsukar5nCDnFITCCO': 'YH미디어',
  'NKXWlnXUviUnbHlLZ5gE': 'YH미디어',
  'iKeiBV6DPSI3oofsBQmr': 'YH미디어',
  'FsJUpEbzIeTSbhJzTTQM': '유아이북스',
  '9h2gM2C0tpUlHxkPHIw1': 'YH미디어',
  'ANRZBYmoCF8dAPfC7lMM': 'YH미디어',
  'niL8KtyA6AIc8ZCHlN6H': 'YH미디어',
  'cuxO6MRub8y0NbEkcz9N': 'YH미디어',
  'DkqyxLypIjkENJwgCWoG': '서교출판사',
  'zsrlqjQ5fqJzHfmbCgkg': 'YH미디어',
  'ZuN5cOoZBbi8WuzQUdxt': 'YH미디어',
  'giwLwHy78AIGVYDkFy5T': '프리윌',
  'q8K7PQJyx94pJ2TwQtpF': '서교출판사',
  'UvZjSGsTswJX5bhCMrrN': '서교출판사',
  'GbExDtZzhy67GEasLmyB': '서교출판사',
  'OgRY6mBOIOYiQjiMeDU5': 'YH미디어',
  'Gfbwe3Z4k9DIPhwjkAB8': '프리윌',
  'mtBAVHhXQfhonEFYURs5': 'YH미디어',
  'aJ3Mss3of6nd7S0kLbcI': 'YH미디어',
  'pC0C96knXGlOh4AZghhg': 'YH미디어',
  'sswcqYizttwzc7FACIts': '롤링다이스',
  'Nr3KDOngJwumIvzDaaVK': '아이웰콘텐츠',
  'kuXF4Ou7wbm8kf6KFK35': 'YH미디어',
  // insight17 계열 (이미 publisher 있는 책들 — 포함해도 조인 후 필터됨)
  'VbJj0uesutu54fBr2q3h': '인사이트브리즈',
  'kFiELOx5uY3CvgsQChFU': '인사이트브리즈',
  'h0jlelIWOLnU2xXMsNUt': '인사이트브리즈',
  'ot0R1mmJ1f0pjuoRIus5': '인사이트브리즈',
  'TEK7o9f14Aymar818ngo': '인사이트브리즈',
  'Suy0VqDwpBjs9V7KIQTD': '인사이트브리즈',
  'OyDihN1qdLhhkSL7bIbZ': '인사이트브리즈',
  'H3ECdNovOoAqftsog42M': '인사이트브리즈',
  'PPDRF0uZ1O7Y22I95ztC': '인사이트브리즈',
  'x4meqY82YuIX1ky9n0Cj': '서교출판사',
  'KnGh3mPgymWen8HJU39B': '서교출판사',
  'VfUsSiXjPavSZxEabFi2': '서교출판사',
  'NugFlc7WUbTnV11Qob1W': '서교출판사',
  'o2yRkISresgi1ZXgazCm': '서교출판사',
  'mgvxMRIiIqpzv79zAGNc': '북오션',
  'Fnes82bDKVLfP6GreGqP': '서교출판사',
  'AA28NK7AI1G9Fgl6On0y': 'YH미디어',
  'Sy2xeQW7iyGjfmXIUwE9': 'YH미디어',
  'WlTzd4QQLEzGOnmyp8H0': 'YH미디어',
  'Ub1mPv3z1y7WNjOUWbbf': 'YH미디어',
  'rZMTVqOjMoDLxPqy9RSY': 'YH미디어',
  'yD45oPyHHBKm3L2rLARM': 'YH미디어',
  'cQlC1lbt6YxGrBRbgIlw': 'YH미디어',
  'TXdPL6qgzcZ7UnBaKYfK': 'YH미디어',
  'oWPknmwXX65XHEahi6GD': 'YH미디어',
  'U47EqsEOyFK4XfkmEspg': 'YH미디어',
  'pi2gBfl33Pu1svJsLPFx': 'YH미디어',
  'LGDesW7HCRxr9FTAwR1s': 'YH미디어',
  'N2gFNjLWc0XNAMXOQxVR': 'YH미디어',
  '4or3xMN6WP5TM3N2reDZ': 'YH미디어',
  'aoZLDxXOLGnQRK8541DY': 'YH미디어',
};

async function main() {
  // ── 1. publisher 컬렉션 실제 조회 ──────────────────────────────────
  const pubSnap = await db.collection('publisher').get();
  // name → code 맵 (여러 name 변형 대응)
  const nameToCode = {};
  const codeToName = {};
  for (const d of pubSnap.docs) {
    const data = d.data();
    const code = String(data.code || '');
    const name = String(data.name || data.publisher_name || '');
    if (code) {
      codeToName[code] = name;
      if (name) nameToCode[name] = code;
    }
  }
  console.log(`publisher 컬렉션: ${pubSnap.docs.length}개`);
  console.log('등록된 출판사:');
  for (const [code, name] of Object.entries(codeToName)) {
    console.log(`  ${code} → ${name}`);
  }
  console.log();

  // ── 2. books 컬렉션 — publisher 빈 것만 ──────────────────────────
  const booksSnap = await db.collection('books').get();
  const emptyPubBooks = {};  // bookId → title
  for (const d of booksSnap.docs) {
    const pub = d.data().publisher;
    if (pub === undefined || pub === null || pub === '') {
      emptyPubBooks[d.id] = String(d.data().title || '');
    }
  }
  const emptyCount = Object.keys(emptyPubBooks).length;
  console.log(`publisher 빈 books: ${emptyCount}건\n`);

  // ── 3. 매핑과 조인 ────────────────────────────────────────────────
  const candidates = [];
  const needCreate = new Set();

  for (const [bookId, pubName] of Object.entries(MAPPING)) {
    if (!pubName) continue;
    if (!(bookId in emptyPubBooks)) continue;  // 이미 publisher 있거나 DB에 없음

    const code = nameToCode[pubName];
    if (!code) needCreate.add(pubName);

    candidates.push({
      title: emptyPubBooks[bookId],
      bookId,
      pubName,
      code: code || '⚠️ 생성 필요',
    });
  }

  // 나머지 (매핑에 없거나 매핑에 빈 출판사)
  const matchedIds = new Set(candidates.map(c => c.bookId));
  const noMatchCount = emptyCount - matchedIds.size;

  // ── 4. 출력 ────────────────────────────────────────────────────────
  console.log(`=== 출판사 채울 후보 (${candidates.length}건) ===\n`);

  // 출판사별로 그룹핑해서 출력
  const byPub = {};
  for (const c of candidates) {
    if (!byPub[c.pubName]) byPub[c.pubName] = [];
    byPub[c.pubName].push(c);
  }

  // 헤더
  console.log('제목\tbookId\t매핑 출판사명\tcode');
  for (const c of candidates) {
    console.log(`${c.title}\t${c.bookId}\t${c.pubName}\t${c.code}`);
  }

  console.log(`\n=== 신규 출판사 생성 필요 (${needCreate.size}종) ===`);
  for (const name of [...needCreate].sort()) {
    console.log(`  - ${name}`);
  }

  console.log(`\n=== 요약 ===`);
  console.log(`총 publisher 빈 책: ${emptyCount}건`);
  console.log(`매핑 적용 후보: ${candidates.length}건`);
  console.log(`매핑에 없거나 빈 출판사 → 그대로 유지: ${noMatchCount}건`);
  console.log(`신규 출판사 생성 필요: ${needCreate.size}종`);

  console.log('\n=== 출판사별 후보 수 ===');
  for (const [pub, list] of Object.entries(byPub).sort((a, b) => b[1].length - a[1].length)) {
    const code = list[0].code;
    console.log(`  ${pub} (${code}): ${list.length}건`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
