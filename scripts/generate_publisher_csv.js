'use strict';
/**
 * publisher 빈 책 286건 — bookId 정확 매칭 + 제목 기반 보강 비교 → CSV 출력
 * 출력: ~/Desktop/북슐랭_출판사적용/publisher_apply_candidates.csv
 * 컬럼: 제목, bookId, 상태, 현재출판사, 매핑출판사명, 적용코드, 분류, 매칭방식
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const admin = require('firebase-admin');

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'bookchelin-firebase-adminsdk-crofb-8c813abbcb.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

// ── 매핑 (bookId → 출판사명) ─────────────────────────────────────────────────
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
  // already-published books in mapping (filtered by DB join)
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

  // ── 2차 추가분 (마스터 시트 기준, 2026-06-24) ─────────────────────────────
  // 스토린랩 — 셜록홈즈 시리즈 9권
  'eLvZvvIqqR8ljLqQlwRO': '스토린랩',
  'LdKShfg48UpqbxeuH43Y': '스토린랩',
  'USeQfbV1zgCrHtl1neav': '스토린랩',
  'Tlzt3bRnKVPnS4tKOGKj': '스토린랩',
  'FxsbroJF7HQKzN6Zpgwh': '스토린랩',
  'vRFhG09CnQlhjwhwU2Cn': '스토린랩',
  'eGWWKiBjfspgFMBj4uI7': '스토린랩',
  'YsFHkVkTLAeFmPsfiunW': '스토린랩',
  'ooNPUiI4auhBxvg3JmQL': '스토린랩',

  // 잇북
  'BUCjvLwqrDDxQuqLqVef': '잇북',
  'MsL8r4uw4eIpfaTKeuWJ': '잇북',
  '6PUCCmn9GShljeMQFmbu': '잇북',
  'EUXZJc64EWi9MLilyD1r': '잇북',
  'XbJ1ffcQi8qDd08IMzF2': '잇북',
  '7py36xKv8oTkCZCr9t8T': '잇북',
  'kqmDoNpBmdUXv0hV1Bwq': '잇북',
  'jKiTjUlENPUUxfMmB6Qf': '잇북',
  'Exf4zhwQiw7DgsQqqagM': '잇북',
  'BQ1LhEUGkCqLowzNOjc1': '잇북',
  'MwjdNHeSnDctJ8bcAHcB': '잇북',
  '2RZm0XwbN6oATISgw2yh': '잇북',
  'JDFvyTKq4vU3J04GqGTs': '잇북',
  'XGbVkEqwJQMrstDTd5fM': '잇북',
  '7OS4Zuas2O6PsREDsDS9': '잇북',
  'EsR3yqAt6vqAVB9nKiQm': '잇북',
  'DO1OfWOsJVabptIoy4yL': '잇북',
  '5JgSX6azIiz4pnjhjan2': '잇북',
  'wpP2dIdcMCKfPVThQwFe': '잇북',
  'QWvwhHB7bahg8NnRSLFd': '잇북',
  'msBhfUpD3CkMmB01jGcy': '잇북',
  'UEBkk8VVuHoJESL7b44T': '잇북',
  'BKU4jhXBCLi2j5bsZ4Rp': '잇북',
  'Gbt3aOM4ZQRtTuyH7vtp': '잇북',
  '8zpeHtSM6laF6SjWLcEZ': '잇북',
  'fLHp4148Fy0BOTZTB41r': '잇북',
  'gx262uBYk9SrWXdrXlWR': '잇북',
  'fwgHJNfhsA5ZIYhqNzRS': '잇북',

  // 눈코잎 (publisher 컬렉션명: 눈코잎, code: redstone114)
  'KQnapalJQvuFyR8I7YZI': '눈코잎',
  'VwIlQqyJg8Pi8dHUo2yi': '눈코잎',
  'mRiwY91qbsmCxkZasBlR': '눈코잎',
  'H1XXobmfhjHI5FqNCnIz': '눈코잎',
  'OmhdmXTqghqUVi4kok17': '눈코잎',
  'UsynsVv9uOamOwetWnuc': '눈코잎',
  'pd69b3zhpLTc2Ro2rcAL': '눈코잎',
  'X0KatOOrv03fSbXD9SNF': '눈코잎',
  'Ps0w6DuiPLbqvLnlKWEt': '눈코잎',
  'oziLeQUDLN9aooLkE2Bh': '눈코잎',
  'UBjjM3DtdECUy8sReA7Q': '눈코잎',
  'Ts09wCw5V4XYj1ljJmcj': '눈코잎',
  'hgIUseapB14rQczNV1zI': '눈코잎',
  'ePJnnicVcaxt7HzXb4RV': '눈코잎',
  'I8W0kjwWcsDhsVQViusg': '눈코잎',
  '7LMYV9OPcoubI21TCmDU': '눈코잎',
  'wbGPcASbDpL2AZA5e9pi': '눈코잎',
  'UOOOxZnTahgKy2uhA6NO': '눈코잎',
  'K7O2CaqEjcT2ADJSvMTX': '눈코잎',
  'L4PvV0DA0AgKK0dFig7f': '눈코잎',
  '6yGehvIz6QRaKX3KnoPl': '눈코잎',
  'F5CGjyrPhH9NdJMOawje': '눈코잎',
  'jJ1ycoeIg7fY2sGJ1C7g': '눈코잎',
  'noUCZgxR5iyaF9zCVeQC': '눈코잎',
  'yugWXUcms3aORIadKaAV': '눈코잎',
  'oYVUJmc2kZCkGSNLIgfG': '눈코잎',
  'atE2EYs0SdovUNDdtKM2': '눈코잎',
  'jQPC93UTMYtrnMhlu8QP': '눈코잎',
  'uekTclmP60YGVvPhZEQL': '눈코잎',
  'aC4kCBY4zaJektcsaata': '눈코잎',
  'dIuTyig4UjwqJVFRnNwK': '눈코잎',
  'kfMmxtM3NTqeBs3IqOXW': '눈코잎',
  '4GbYdXG2fc7y3fePMRwJ': '눈코잎',
  'c3GuyYu0qcTpeClsxbeL': '눈코잎',
  'pfZyJ7U4Pk2tS1Ved6AF': '눈코잎',
  '5W4aOKaYDAxA4egYBOtP': '눈코잎',
  'i2r4ZVNt3yunN6f6SN3k': '눈코잎',
  'zPv7YHACOY7XptFzzIHz': '눈코잎',
  'YOCgxhmuNK8Y9qKoEfKm': '눈코잎',
  '9A8JYCKkxlri9aytZn9L': '눈코잎',
  'gPYMoKRmF2jEiqMyEVRI': '눈코잎',
  'iDpgw7Q2GxD98iAIni9w': '눈코잎',
  'HYavC2ER5cELe7HX37k9': '눈코잎',
  '2PR2we8eNQpqCPxsLY1L': '눈코잎',
  'oFEY922zTf1VdeTuPjH1': '눈코잎',
  'wayn4DvGJrAZrcIG99HZ': '눈코잎',
  '5hy5AWa4x4jS93Tq3g7Y': '눈코잎',
  '5vVSHOrRbi8KsH6JcIuX': '눈코잎',

  // 끌리는책
  'L6M2DCsDMJ9F2e8LdOIw': '끌리는책',
  'kvHOKuRmo0seWpsGbrzK': '끌리는책',
  '60lRxExvpiXw7Ycx2xRa': '끌리는책',
  '8VHxwfHoQ2ZP3tThZNRN': '끌리는책',
  '15PSCYJTANvoUnQiEPrT': '끌리는책',
  'wF9SlnB6OMPZOdeIM3Xa': '끌리는책',
  'gqwKNT6FKR6QZ7ZTD4OX': '끌리는책',
  'GWiZfsQrrmV9RjhHGnfa': '끌리는책',
  'WSM8RIl9iMH0jaxxz6eN': '끌리는책',
  'NrBIZg7GHEU34YDxDHkF': '끌리는책',
  '6g6iIiPooHKX5OKz8NrZ': '끌리는책',
  'NWI8uxjraAuOBGpNyQbn': '끌리는책',

  // BMK
  'jWyC2zz1ticc1D2tIP2G': 'BMK',
  's4Fxa4OL3osb5Lx7RL27': 'BMK',
  'l5fA6ZyXrC1ybslk6nL2': 'BMK',
  'ZkyDZYHk5lqHwnLEevGW': 'BMK',
  'hohmyymXwSfUujoHn9og': 'BMK',
  'l4DWrL2HncRRDL2oRagf': 'BMK',
  'lH1ElS8ds79Q7HF73uQy': 'BMK',
  '9z3vzXnwtgrzSvaotP9B': 'BMK',

  // 미래북
  'vnsXIWAPzyVC6LVO8ioN': '미래북',
  '57zOCzKibLggaHdE85MR': '미래북',
  'Kq3FUjxL2hpwmAYQBJGg': '미래북',
  'molbXVzHewR39Y3GhotU': '미래북',

  // 행공신
  '1UDSwEtE6ODkqvXL2TN4': '행공신',
  'lk7gw1ZA82NWhBkJJB8l': '행공신',
  'cqCGkEbfGI89HjWL1Low': '행공신',

  // 레몬북스
  'KqFDElY2jCFX4lrfLki6': '레몬북스',

  // 율도국
  'dBBI2mM1nk3eE40xAA7Q': '율도국',
  'fHyV21bIr6NK5zI5ZKUf': '율도국',
  'hMI4Tvr3Ycy4v7v3L0Sg': '율도국',
  '8qEuZsQA2McNJSJKg9YA': '율도국',
  'HcSTzLcoO73lNVbWX0wJ': '율도국',
  'EU4tZc6HGWtA7l1sdoKp': '율도국',
  'UKskwOr5GIGwEobsVWnI': '율도국',
  'UeFbiJfxHMWnmlwytcmc': '율도국',
  'NyQktx0XzRYSnGClxtJi': '율도국',
  'viMT8qPFQzCtTq9GYO8b': '율도국',
  'slNkb8QsgZkNHntMfgEs': '율도국',
  'oQri2bN0w4YmLOOjUb2K': '율도국',
  'zPffwiaxgXOBb0a7x08v': '율도국',
  '6R6iazyzMQcUxe6K4c15': '율도국',
  'o7tEqWXJIno7uLrG4NYA': '율도국',

  // B612북스 추가
  'LyUyrwzD4mXTjesZk1eF': 'B612북스',

  // ── 시트직접 매칭분 보완 (2026-06-24) ────────────────────────────────────────
  // 인사이트브리즈 (시트직접 채움 3건)
  'aeLDPnGF9dhbiQXG7e7C': '인사이트브리즈',
  'c1JXKMJoKu5xSRvYL5vp': '인사이트브리즈',
  'yC4g5Lz8ZKyA2oEj3xz5': '인사이트브리즈',
  // 서교출판사 (시트직접 채움 1건)
  'JDqxpbYu4BA93xC8DTf7': '서교출판사',
  // 프리윌 (시트직접 채움 3건)
  '7rVz8NRcaBm0nyAY1rZT': '프리윌',
  'hLKaUPzjFV2Zaj1rO7D6': '프리윌',
  'OoiFchsBMl5kvkXybK8p': '프리윌',
  // 북오션 (시트직접 채움 1건)
  'xbYvVn9LRy7ga6VCFyJY': '북오션',
  // 아이웰콘텐츠 (시트직접 채움 2건)
  'aJhpd0LhjZqGRmQkDLOW': '아이웰콘텐츠',
  'kAEwq4aq40JFkAiSmsEu': '아이웰콘텐츠',
  // 롤링다이스 (시트직접 생성필요 11건 — publisher 미존재, 생성필요로 유지)
  'ilmuWWBsRDAwISjna0dl': '롤링다이스',
  'bOFTjJXIFGPqa1PofYnR': '롤링다이스',
  '576IfeU7xKAY4E0z9bMN': '롤링다이스',
  'q3n2zFH7h0mAsr2xaqHd': '롤링다이스',
  'sBnQIq1YeLyCyNUboznm': '롤링다이스',
  'BSmwbSeQTG7b98chCoaN': '롤링다이스',
  'Rl8ZlHw9OFOwBphTWpPT': '롤링다이스',
  '9GtVbo0bIANfTEeXlRV9': '롤링다이스',
  'WeRQSSrLsZtUeeCM0Iew': '롤링다이스',
  'NHYXjFsvHg4dte2c8MqC': '롤링다이스',
  'PE6985JZz12f26k3RzJa': '롤링다이스',
  // 휴먼컬처아리랑 (시트직접 생성필요 1건 — publisher 미존재, 생성필요로 유지)
  'XkOiae6Ga3O4chAa3hlO': '휴먼컬처아리랑',
};

// ── 제목 정규화 ──────────────────────────────────────────────────────────────
function normTitle(title) {
  return title
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]\{\}【】〔〕『』「」《》<>''"""·•]/g, '')
    .replace(/[.,!?！？:：;；—–―-]/g, '')
    .trim()
    .toLowerCase();
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main() {
  // ── 1. publisher 컬렉션 로드 ──────────────────────────────────────────────
  const pubSnap = await db.collection('publisher').get();
  const nameToCode = {};
  const codeToName = {};
  for (const d of pubSnap.docs) {
    const data = d.data();
    const code = String(data.code || '');
    const name = String(data.name || data.publisher_name || '');
    if (code) { codeToName[code] = name; if (name) nameToCode[name] = code; }
  }
  // 출판사명 별칭: 마스터 시트에서 '눈코입'으로 표기되지만 컬렉션명은 '눈코잎'
  if (!nameToCode['눈코입'] && nameToCode['눈코잎']) nameToCode['눈코입'] = nameToCode['눈코잎'];
  const allPubCodes = new Set(Object.keys(codeToName));
  console.error(`publisher 컬렉션 ${pubSnap.docs.length}개 로드`);

  // ── 2. books 전수 로드 (publisher 있는 것 포함) ───────────────────────────
  const booksSnap = await db.collection('books').get();
  const allById = {};      // bookId → {title, publisher, hidden}
  const emptyPubMap = {};  // bookId → {title, status}  (publisher="")
  // normTitle → [{bookId, title, pubCode, pubName}]  (이미 publisher 있는 책)
  const dbPubByNorm = {};

  for (const d of booksSnap.docs) {
    const data = d.data();
    const title = String(data.title || '').trim();
    const pub = data.publisher;
    const hidden = data.hidden === true;
    allById[d.id] = { title, publisher: pub || '', hidden };

    if (pub === undefined || pub === null || pub === '') {
      emptyPubMap[d.id] = { title, status: hidden ? '숨김' : '활성' };
    } else {
      const norm = normTitle(title);
      if (!dbPubByNorm[norm]) dbPubByNorm[norm] = [];
      dbPubByNorm[norm].push({
        bookId: d.id, title,
        pubCode: String(pub),
        pubName: codeToName[String(pub)] || String(pub),
      });
    }
  }
  console.error(`전체 books ${booksSnap.docs.length}건 / publisher 빈 ${Object.keys(emptyPubMap).length}건`);

  // ── 3. MAPPING 각 bookId 상태 파악 + 제목 역색인 구성 ──────────────────────
  // mappingNormToInfo: normTitle → {pubName, code, mappingBookId, mappingStatus}
  const mappingNormToInfo = {};
  const mappingStatusCounts = { matched: 0, has_publisher: 0, stale: 0 };

  for (const [bookId, pubName] of Object.entries(MAPPING)) {
    if (!pubName) continue;
    const book = allById[bookId];
    let status;
    if (!book) {
      status = 'stale';
    } else if (book.publisher !== '') {
      status = 'has_publisher';
    } else {
      status = 'matched';
    }
    mappingStatusCounts[status]++;

    // matched 또는 stale(제목은 없음)인 경우 제목 색인 구성
    if (book) {
      const norm = normTitle(book.title);
      if (!mappingNormToInfo[norm]) {
        mappingNormToInfo[norm] = {
          pubName,
          code: nameToCode[pubName] || '',
          mappingBookId: bookId,
          mappingStatus: status,
        };
      }
    }
  }

  // ── 4. publisher-empty 책 처리: bookId 정확 매칭 ─────────────────────────
  const rows = [];
  const needCreate = new Set();
  const pubStats = {}; // pubName → count (채움+생성필요)
  const titleMatchedIds = new Set();

  for (const [bookId, book] of Object.entries(emptyPubMap)) {
    const mappedPubName = MAPPING[bookId] || null;
    if (!mappedPubName) continue; // 제목 매칭은 별도 처리

    const code = nameToCode[mappedPubName] || '';
    const category = code ? '채움' : '생성필요';
    const applyCode = code || '생성필요';
    if (!code) needCreate.add(mappedPubName);
    pubStats[mappedPubName] = (pubStats[mappedPubName] || 0) + 1;
    titleMatchedIds.add(bookId);

    rows.push({
      title: book.title, bookId, status: book.status,
      currentPublisher: '',
      mappedName: mappedPubName, applyCode, category,
      matchType: 'bookId정확',
    });
  }

  // ── 5. 제목 기반 보강: 유지 후보(91건) 대상 ─────────────────────────────
  const titleMatchRows = [];

  for (const [bookId, book] of Object.entries(emptyPubMap)) {
    if (titleMatchedIds.has(bookId)) continue; // 이미 bookId로 매칭됨

    const norm = normTitle(book.title);
    let found = null;

    // 5a. MAPPING 제목 정확 일치 (stale bookId 케이스 잡기)
    if (!found && mappingNormToInfo[norm]) {
      const info = mappingNormToInfo[norm];
      found = { pubName: info.pubName, code: info.code, matchType: '제목정확', src: 'mapping' };
    }

    // 5b. DB 내 publisher 있는 책과 제목 정확 일치
    if (!found && dbPubByNorm[norm]) {
      const match = dbPubByNorm[norm][0];
      found = { pubName: match.pubName, code: match.pubCode, matchType: '제목정확', src: 'db' };
    }

    // 5c. MAPPING 제목 유사 (정규화 후 일방 포함, 최소 6자)
    if (!found && norm.length >= 6) {
      for (const [mNorm, info] of Object.entries(mappingNormToInfo)) {
        if (mNorm.length >= 6 && (norm.includes(mNorm) || mNorm.includes(norm))) {
          found = { pubName: info.pubName, code: info.code, matchType: '제목유사', src: 'mapping' };
          break;
        }
      }
    }

    // 5d. DB publisher 있는 책과 제목 유사
    if (!found && norm.length >= 6) {
      for (const [mNorm, books] of Object.entries(dbPubByNorm)) {
        if (mNorm.length >= 6 && (norm.includes(mNorm) || mNorm.includes(norm))) {
          const match = books[0];
          found = { pubName: match.pubName, code: match.pubCode, matchType: '제목유사', src: 'db' };
          break;
        }
      }
    }

    if (found) {
      titleMatchRows.push({
        title: book.title, bookId, status: book.status,
        currentPublisher: '',
        mappedName: found.pubName,
        applyCode: found.code || '확인필요',
        category: '제목매칭후보',
        matchType: found.matchType,
        matchSrc: found.src,
      });
    } else {
      rows.push({
        title: book.title, bookId, status: book.status,
        currentPublisher: '',
        mappedName: '', applyCode: '매핑없음-유지',
        category: '유지', matchType: '없음',
      });
    }
  }

  // 제목매칭후보 rows 병합 (정확 → 유사 순)
  const TMATCH_ORDER = { '제목정확': 0, '제목유사': 1 };
  titleMatchRows.sort((a, b) =>
    (TMATCH_ORDER[a.matchType] - TMATCH_ORDER[b.matchType]) ||
    a.mappedName.localeCompare(b.mappedName, 'ko') ||
    a.title.localeCompare(b.title, 'ko')
  );
  rows.push(...titleMatchRows);

  // ── 6. CSV 생성 ──────────────────────────────────────────────────────────
  const outDir = path.join(os.homedir(), 'Desktop', '북슐랭_출판사적용');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'publisher_apply_candidates.csv');

  const header = ['제목', 'bookId', '상태', '현재출판사', '매핑출판사명', '적용코드', '분류', '매칭방식'];
  const lines = ['﻿' + header.map(csvEscape).join(',')];

  const ORDER = { '채움': 0, '생성필요': 1, '제목매칭후보': 2, '유지': 3 };
  const STATUS_ORDER = { '활성': 0, '숨김': 1 };
  rows.sort((a, b) =>
    (ORDER[a.category] - ORDER[b.category]) ||
    (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) ||
    a.title.localeCompare(b.title, 'ko')
  );

  for (const r of rows) {
    lines.push([
      r.title, r.bookId, r.status, r.currentPublisher,
      r.mappedName, r.applyCode, r.category, r.matchType,
    ].map(csvEscape).join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.error(`\nCSV 저장: ${outPath} (${rows.length}행)`);

  // ── 7. 진단 ──────────────────────────────────────────────────────────────
  const fill   = rows.filter(r => r.category === '채움');
  const create = rows.filter(r => r.category === '생성필요');
  const tmatch = rows.filter(r => r.category === '제목매칭후보');
  const keep   = rows.filter(r => r.category === '유지');

  console.log('\n══════════════════════════════════════════');
  console.log('① 셜록홈즈 케이스 진단');
  console.log('══════════════════════════════════════════');
  const sherlockAll = Object.entries(allById).filter(([, b]) =>
    b.title.includes('셜록') || b.title.toLowerCase().includes('sherlock')
  );
  if (sherlockAll.length === 0) {
    console.log('  DB에 셜록홈즈 관련 책 없음');
  } else {
    for (const [id, b] of sherlockAll) {
      const inMapping = id in MAPPING ? `MAPPING 있음(→${MAPPING[id]})` : 'MAPPING 없음';
      const pubStatus = b.publisher ? `publisher="${b.publisher}"` : 'publisher 빈값';
      const inTitleMatch = titleMatchRows.find(r => r.bookId === id);
      const matchNote = inTitleMatch ? `→ 제목매칭후보(${inTitleMatch.matchType})` : '';
      console.log(`  [${b.hidden ? '숨김' : '활성'}] ${b.title}`);
      console.log(`    bookId: ${id}`);
      console.log(`    ${pubStatus} / ${inMapping} ${matchNote}`);
    }
  }
  console.log('\n  storinlab111(스토린랩) publisher 컬렉션 존재:', allPubCodes.has('storinlab111') ? '✅ 있음' : '❌ 없음');
  const storinInMapping = Object.entries(MAPPING).filter(([, v]) => v === '스토린랩');
  console.log(`  MAPPING에 스토린랩 항목 수: ${storinInMapping.length}건`);

  console.log('\n══════════════════════════════════════════');
  console.log('② MAPPING bookId 상태');
  console.log('══════════════════════════════════════════');
  console.log(`  matched(정상):       ${mappingStatusCounts.matched}건`);
  console.log(`  has_publisher(이미적용): ${mappingStatusCounts.has_publisher}건`);
  console.log(`  stale(DB 없음):      ${mappingStatusCounts.stale}건`);

  console.log('\n══════════════════════════════════════════');
  console.log('③ 전체 요약');
  console.log('══════════════════════════════════════════');
  const totalActive = rows.filter(r => r.status === '활성').length;
  console.log(`총 publisher 빈 books: ${rows.length}건`);
  console.log(`  활성 ${totalActive}건 / 숨김 ${rows.length - totalActive}건`);
  console.log(`채움:          ${fill.length}건 (활성 ${fill.filter(r=>r.status==='활성').length} / 숨김 ${fill.filter(r=>r.status==='숨김').length})`);
  console.log(`생성필요:       ${create.length}건 (활성 ${create.filter(r=>r.status==='활성').length} / 숨김 ${create.filter(r=>r.status==='숨김').length})`);
  console.log(`제목매칭후보:   ${tmatch.length}건 (정확 ${tmatch.filter(r=>r.matchType==='제목정확').length} / 유사 ${tmatch.filter(r=>r.matchType==='제목유사').length})`);
  console.log(`  └ 활성 ${tmatch.filter(r=>r.status==='활성').length}건 / 숨김 ${tmatch.filter(r=>r.status==='숨김').length}건`);
  console.log(`유지:          ${keep.length}건 (활성 ${keep.filter(r=>r.status==='활성').length} / 숨김 ${keep.filter(r=>r.status==='숨김').length})`);

  if (needCreate.size > 0) {
    console.log(`\n신규 생성 필요 출판사 (${needCreate.size}종):`);
    for (const name of [...needCreate].sort()) console.log(`  - ${name}`);
  }

  console.log('\n══════════════════════════════════════════');
  console.log('④ 제목매칭후보 출판사별');
  console.log('══════════════════════════════════════════');
  const tmatchByPub = {};
  for (const r of tmatch) {
    if (!tmatchByPub[r.mappedName]) tmatchByPub[r.mappedName] = { exact: 0, similar: 0 };
    if (r.matchType === '제목정확') tmatchByPub[r.mappedName].exact++;
    else tmatchByPub[r.mappedName].similar++;
  }
  const tmatchSorted = Object.entries(tmatchByPub)
    .sort((a, b) => (b[1].exact + b[1].similar) - (a[1].exact + a[1].similar));
  if (tmatchSorted.length === 0) {
    console.log('  (제목매칭 결과 없음)');
  } else {
    for (const [pub, cnt] of tmatchSorted) {
      const code = nameToCode[pub] || '확인필요';
      console.log(`  ${pub} (${code}): 정확 ${cnt.exact}건 / 유사 ${cnt.similar}건`);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('⑤ publisher 컬렉션에 있으나 MAPPING에 없는 출판사 (통째 누락 후보)');
  console.log('══════════════════════════════════════════');
  const pubsInMapping = new Set(Object.values(MAPPING).filter(Boolean));
  const pubsNotInMapping = [...allPubCodes].filter(code => {
    const name = codeToName[code];
    return !pubsInMapping.has(name);
  });
  if (pubsNotInMapping.length === 0) {
    console.log('  없음 (모든 출판사 MAPPING에 포함)');
  } else {
    for (const code of pubsNotInMapping) {
      const name = codeToName[code];
      // publisher-empty인 책 중 이 출판사 제목 매칭 후보 수
      const tmatchCnt = tmatch.filter(r => r.mappedName === name).length;
      const keepCnt = keep.length; // 남은 유지 수 (참고용)
      console.log(`  ${code} → ${name}  (제목매칭후보 ${tmatchCnt}건)`);
    }
  }

  console.log(`\nCSV: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
