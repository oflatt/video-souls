#tsc --watch --onSuccess "npx webpack" &
#PIDS[0]=$!
tsc-watch --onSuccess "npx webpack" &

echo "Starting server on http://localhost:8001"

# if python3 exists use that
if command -v python &> /dev/null
then
    python -m http.server 8001 &
else
    python3 -m http.server 8001 &
fi

PIDS[1]=$!

trap "kill ${PIDS[*]}" SIGINT

wait