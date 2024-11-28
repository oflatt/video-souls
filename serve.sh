tsc --watch &
PIDS[0]=$!


python -m http.server 8001 &
PIDS[1]=$!

trap "kill ${PIDS[*]}" SIGINT

wait