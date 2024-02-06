export VITE_GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null)
export VITE_RELEASE_VERSION=$(git describe --tags --exact-match 2>/dev/null)

cd ./service
nohup pnpm start > service.log &
echo "Start service complete!"


cd ..
echo "" > front.log
nohup pnpm dev > front.log &
echo "Start front complete!"
tail -f front.log
