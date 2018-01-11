#!/bin/bash

docker build -t yuvipanda/jupyterhub-stress:v0.4.5 .
docker push yuvipanda/jupyterhub-stress:v0.4.5

docker build -t yuvipanda/kubectl:v1.9.0 -f Dockerfile.kubectl .
docker push yuvipanda/kubectl:v1.9.0
