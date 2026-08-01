# 태오회권 무공 추출기 1.1 · Linux/Steam/Proton

이 추출기는 Wine에서 Windows BAT를 실행하지 않습니다. Linux 호스트에서 Steam과 Flatpak Steam의
라이브러리를 찾고, Proton이 사용하는 태오회권 설치 파일을 네이티브 Node.js·Python·.NET 도구로
읽습니다. 게임과 Proton prefix는 수정하지 않습니다.

## 실행

```bash
tar -xzf taiwu-martial-extractor-linux-v1.1.0.tar.gz
cd taiwu-martial-extractor-linux-v1.1.0
bash taiwu-martial-extractor.sh
```

자동 탐색에 실패하면 게임 경로를 직접 지정합니다.

```bash
bash taiwu-martial-extractor.sh "/mnt/games/SteamLibrary/steamapps/common/The Scroll Of Taiwu"
```

생성된 `output/태오회권_무공데이터.json`을 사이트의 `데이터 업로드` 버튼으로 불러오면 됩니다.

## 지원하는 Steam 위치

- `~/.steam/steam`
- `~/.local/share/Steam`
- Flatpak Steam: `~/.var/app/com.valvesoftware.Steam/.local/share/Steam`
- 각 `libraryfolders.vdf`에 등록된 추가 라이브러리
- `TAIWU_STEAM_ROOTS=/경로1:/경로2`로 직접 지정한 Steam 루트

Proton의 `compatdata` 폴더가 아니라 `steamapps/common/The Scroll Of Taiwu`를 읽습니다.

## 필수 프로그램

- Bash
- Node.js 22.13 이상
- Python 3.11 이상과 `venv`
- .NET 8 이상 SDK

`.NET Runtime`만 설치되어 있으면 ILSpy를 설치할 수 없습니다. `dotnet --list-sdks`에서 `8.0`
이상의 SDK가 보여야 합니다. 처음 실행할 때 사용자 폴더의 `.runtime`에 UnityPy와 ILSpy를 설치하며
추출기 자체는 `sudo`나 root 권한을 요구하지 않습니다.

Debian/Ubuntu 계열에서 venv가 없다는 오류가 나오면 배포판 패키지 `python3-venv`를 설치하세요.

## 개인정보

- 결과에 Steam 계정, 세이브, 로그, 전체 설치 경로를 넣지 않습니다.
- 게임 전체 에셋이 아니라 운공 화면에 필요한 공법 아이콘만 결과 JSON에 포함합니다.
- 사이트에 업로드한 데이터는 해당 브라우저의 IndexedDB에만 저장됩니다.
