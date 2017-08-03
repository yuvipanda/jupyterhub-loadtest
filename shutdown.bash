#!/bin/bash

echo "stopping test runs..."
kubectl delete pod -l heritage=jupyterhub-loadtest;

echo "deleting jupyter servers..."
kubectl delete pod -l heritage=jupyterhub;
