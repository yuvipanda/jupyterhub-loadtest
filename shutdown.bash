#!/bin/bash

echo "stopping test runs..."
for pod in `kubectl get pods | grep 'j-[a-z]-[0-9]-[a-z]' | cut -d " " -f 1`; 
do
  kubectl delete pod $pod;
done

echo "deleting jupyter servers..."
for pod in `kubectl get pods | grep "jupyter-j" | cut -d " " -f 1`;
do
  kubectl delete pod $pod;
done
