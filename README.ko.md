# @time-file/browser-file-crypto

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/og-image-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/og-image.png" />
    <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/og-image.png" alt="browser-file-crypto" width="100%" />
  </picture>
</p>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/hero-dark.ko.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/hero.ko.png" />
    <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/hero.ko.png" alt="Hero" width="100%" />
  </picture>
</p>

<p align="center">
  Web Crypto API 기반의 브라우저 파일 암호화 라이브러리입니다.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@time-file/browser-file-crypto"><img src="https://img.shields.io/npm/v/@time-file/browser-file-crypto.svg" alt="npm version" /></a>
  <a href="https://bundlephobia.com/package/@time-file/browser-file-crypto"><img src="https://img.shields.io/bundlephobia/minzip/@time-file/browser-file-crypto" alt="bundle size" /></a>
  <a href="https://github.com/time-file/browser-file-crypto/stargazers"><img src="https://img.shields.io/github/stars/time-file/browser-file-crypto?style=flat" alt="stars" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
</p>

<p align="center">
  <a href="https://github.com/Time-File/browser-file-crypto/blob/main/README.md">English</a> | <strong>한국어</strong>
</p>

## 특징

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/features-grid-dark.ko.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/features-grid.ko.png" />
    <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/features-grid.ko.png" alt="Features" width="100%" />
  </picture>
</p>

- **Zero-Knowledge** - 클라이언트 측 암호화로 서버는 평문을 볼 수 없습니다.
- **Zero-Dependency** - 네이티브 Web Crypto API만 사용합니다.
- **AES-256-GCM** - 업계 표준 인증 암호화 방식입니다.
- **비밀번호 & 키파일** - 용도에 따라 두 가지 모드를 지원합니다.
- **스트리밍 지원** - 메모리 효율적인 대용량 파일 처리 (v1.1.0+)
- **진행률 콜백** - 암호화/복호화 진행 상황을 추적할 수 있습니다.
- **TypeScript** - 완전한 타입 정의가 포함되어 있습니다.
- **초경량** - gzip 압축 시 5KB 미만의 용량을 자랑합니다.

## 왜 사용해야 하나요?

Web Crypto API는 강력하지만 사용이 복잡합니다. 파일 하나를 암호화하는 데만 약 100줄의 보일러플레이트 코드가 필요하며, 치명적인 실수를 저지르기 쉽습니다.

- ❌ IV 재사용 (보안에 치명적)
- ❌ 낮은 PBKDF2 반복 횟수 (브루트포스 공격에 취약)
- ❌ salt/IV를 출력에 포함하지 않음 (복호화 불가)
- ❌ ArrayBuffer 슬라이싱 오류 (데이터 손상)

> 이 라이브러리가 모든 것을 처리합니다.

```typescript
// ❌ Before - Raw Web Crypto API
const encoder = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const keyMaterial = await crypto.subtle.importKey(
  'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
);
const arrayBuffer = await file.arrayBuffer();
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  arrayBuffer
);
const result = new Uint8Array(1 + salt.length + iv.length + ciphertext.byteLength);
result.set([0x01], 0);
result.set(salt, 1);
result.set(iv, 17);
result.set(new Uint8Array(ciphertext), 29);
// ... 복호화도 30줄 이상 필요합니다
```

```typescript
// ✅ After - With this library
const encrypted = await encryptFile(file, { password: 'secret' });
const decrypted = await decryptFile(encrypted, { password: 'secret' });
```

**끝입니다.**

## 비교

| 기능 | crypto-js | @aws-crypto | Web Crypto (직접) | **browser-file-crypto** |
|------|-----------|-------------|-------------------|------------------------|
| 유지보수 | ❌ 중단됨 | ✅ | - | ✅ |
| 번들 크기 | ~50KB | ~200KB+ | 0 | **< 4KB** |
| 의존성 | 많음 | 많음 | 없음 | **없음** |
| 파일 특화 API | ❌ | ⚠️ | ❌ | **✅** |
| 진행률 콜백 | ❌ | ❌ | ❌ | **✅** |
| 키파일 모드 | ❌ | ❌ | ❌ | **✅** |
| 타입 감지 | ❌ | ❌ | ❌ | **✅** |
| TypeScript | ❌ | ✅ | - | **✅** |

## 설치

```bash
# npm
npm install @time-file/browser-file-crypto

# pnpm
pnpm add @time-file/browser-file-crypto

# yarn
yarn add @time-file/browser-file-crypto
```

## 빠른 시작

```typescript
import { encryptFile, decryptFile } from '@time-file/browser-file-crypto';

// 암호화
const file = document.querySelector('input[type="file"]').files[0];
const encrypted = await encryptFile(file, {
  password: 'my-secret-password',
  onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
});

// 복호화
const decrypted = await decryptFile(encrypted, {
  password: 'my-secret-password'
});
```

## API

### `encryptFile(file, options)`

```typescript
const encrypted = await encryptFile(file, {
  password: 'secret',        // 또는
  keyData: keyFile.key,      // 키파일 사용
  onProgress: (p) => {}      // 선택 사항
});
```

### `decryptFile(encrypted, options)`

```typescript
const decrypted = await decryptFile(encrypted, {
  password: 'secret',        // 또는
  keyData: keyFile.key,
  onProgress: (p) => {}
});
```

### 스트리밍 암호화 (v1.1.0+)

메모리에 맞지 않는 대용량 파일을 처리할 때:

```typescript
import { encryptFileStream, decryptFileStream } from '@time-file/browser-file-crypto';

// 대용량 파일 암호화 (메모리 효율적)
const encryptedStream = await encryptFileStream(largeFile, {
  password: 'secret',
  chunkSize: 1024 * 1024,  // 1MB 청크 (기본값: 64KB)
  onProgress: ({ processedBytes, totalBytes }) => {
    console.log(`${Math.round(processedBytes / totalBytes * 100)}%`);
  }
});

// 스트림을 Blob으로 변환
const response = new Response(encryptedStream);
const encryptedBlob = await response.blob();

// 복호화
const decryptedStream = decryptFileStream(encryptedBlob, { password: 'secret' });
const decryptResponse = new Response(decryptedStream);
const decryptedBlob = await decryptResponse.blob();
```

### 키파일 모드

비밀번호를 기억할 필요가 없습니다:

```typescript
import { generateKeyFile, downloadKeyFile, parseKeyFile } from '@time-file/browser-file-crypto';

const keyFile = generateKeyFile();
downloadKeyFile(keyFile.key, 'my-secret-key');           // .key 파일로 저장 (기본값)

// 커스텀 확장자
downloadKeyFile(keyFile.key, 'my-secret-key', 'tfkey');  // .tfkey 파일로 저장

const encrypted = await encryptFile(file, { keyData: keyFile.key });

// 나중에 불러와서 사용
const content = await uploadedFile.text();
const loaded = parseKeyFile(content);
if (loaded) {
  const decrypted = await decryptFile(encrypted, { keyData: loaded.key });
}
```

### 유틸리티

```typescript
import { getEncryptionType, isEncryptedFile, generateRandomPassword } from '@time-file/browser-file-crypto';

await getEncryptionType(blob);  // 'password' | 'keyfile' | 'password-stream' | 'keyfile-stream' | 'unknown'
await isEncryptedFile(blob);    // true | false
generateRandomPassword(24);     // 'Kx9#mP2$vL5@nQ8!...'
```

### 다운로드 & 복호화

```typescript
import { downloadAndDecrypt } from '@time-file/browser-file-crypto';

await downloadAndDecrypt('https://example.com/secret.enc', {
  password: 'secret',
  fileName: 'document.pdf',
  onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
});
```

### 에러 처리

```typescript
import { isCryptoError } from '@time-file/browser-file-crypto';

try {
  await decryptFile(encrypted, { password: 'wrong' });
} catch (error) {
  if (isCryptoError(error)) {
    // error.code: 'INVALID_PASSWORD' | 'INVALID_KEYFILE' | 'INVALID_ENCRYPTED_DATA'
  }
}
```

## 보안

### 스펙

| 구성 요소 | 값 |
|-----------|------|
| 알고리즘 | AES-256-GCM |
| 키 유도 | PBKDF2 (SHA-256, 100,000회 반복) |
| Salt | 16바이트 (암호화마다 랜덤 생성) |
| IV | 12바이트 (암호화마다 랜덤 생성) |
| Auth Tag | 16바이트 |

### 파일 포맷

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/file-format-dark.ko.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/file-format.ko.png" />
    <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/file-format.ko.png" alt="File Format" width="100%" />
  </picture>
</p>

```
비밀번호 암호화:
=> [0x01] + [salt:16] + [iv:12] + [ciphertext + auth_tag:16]

키파일 암호화:
=> [0x02] + [iv:12] + [ciphertext + auth_tag:16]

비밀번호 암호화 (스트리밍):
=> [0x11] + [version:1] + [chunkSize:4] + [salt:16] + [baseIV:12] + [chunks...]

키파일 암호화 (스트리밍):
=> [0x12] + [version:1] + [chunkSize:4] + [baseIV:12] + [chunks...]

각 스트리밍 청크:
=> [chunkLength:4] + [ciphertext + auth_tag:16]
```

### 참고 사항

- 키는 추출이 불가능합니다 (`extractable: false`)
- 매번 랜덤 IV/salt를 사용하므로 동일한 암호문이 생성되지 않습니다
- AES-GCM은 인증 암호화 방식입니다 (변조 감지 가능)
- 100,000회 PBKDF2 반복으로 브루트포스 공격에 강합니다

## 브라우저 지원

| 브라우저 | 버전 |
|---------|------|
| Chrome | 80+ |
| Firefox | 74+ |
| Safari | 14+ |
| Edge | 80+ |

Node.js 18+, Deno, Cloudflare Workers에서도 동작합니다.

## TypeScript

```typescript
import type {
  EncryptOptions,
  DecryptOptions,
  Progress,
  KeyFile,
  EncryptionType,
  CryptoErrorCode,
  // 스트리밍 타입 (v1.1.0+)
  StreamEncryptOptions,
  StreamDecryptOptions,
  StreamProgress
} from '@time-file/browser-file-crypto';
```

## 링크

- [변경 이력](./CHANGELOG.md)
- [라이선스](./LICENSE)
- [npm](https://www.npmjs.com/package/@time-file/browser-file-crypto)
- [GitHub](https://github.com/time-file/browser-file-crypto)

## 라이선스

[MIT](./LICENSE)

---

<p align="center">
  <a href="https://timefile.co/ko">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/timefile-footer-dark.ko.png" />
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/timefile-footer.ko.png" />
      <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/timefile-footer.ko.png" alt="Made by timefile.co" />
    </picture>
  </a>
</p>
