tsc --watch &
PIDS[0]=$!


python3 -m http.server 8001 &
PIDS[1]=$!

trap "kill ${PIDS[*]}" SIGINT

wait