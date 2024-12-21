tsc --watch &
PIDS[0]=$!

echo "Starting server on http://localhost:8001"

# if python3 exists use that
if command -v python3 &> /dev/null
then
    python3 -m http.server 8001 &
else
    python -m http.server 8001 &
fi
 
PIDS[1]=$!

trap "kill ${PIDS[*]}" SIGINT

wait