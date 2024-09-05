
### Build to app

1. ``git clone ... && cd ./release``
2. ``tsc ./index.ts && pkg ./index.js --targets node14-macos-arm64 --output release-app``

### Release
1. ``cd ./path-repo-want-to-release``

2. ``npx ts-node ./repo`` or ``./repo/release-app``
