#!/bin/bash
RUNS=${1}
COUNT=${2}
DELAY=${3}
for i in $(seq 1 ${RUNS}); do
    cat job.yaml | sed "s/NUM/${i}" | sed "s/RUN_COUNT/${COUNT}/" | kubectl apply -f
    sleep ${DELAY}
done
