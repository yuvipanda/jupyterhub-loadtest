#!/bin/bash
set -e
RUNS=${1}
COUNT=${2}
DELAY=${3}
CONNECT_IP=${4}
for i in $(seq 1 ${RUNS}); do
    cat pod.yaml | sed "s/CONNECT_IP/${CONNECT_IP}/" | sed "s/NUM/${i}/" | sed "s/RUN_COUNT/${COUNT}/" | kubectl apply -f -
    sleep ${DELAY}
done
