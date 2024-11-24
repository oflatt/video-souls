tsc --watch &
PIDS[0]=$!

python -m http.server $(PORT) &
PIDS[1]=$!

trap "kill ${PIDS[*]}" SIGINT

wait