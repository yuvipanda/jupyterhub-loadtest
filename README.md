# jupyterhub-loadtest
Load Testing helper scripts for JupyterHubs

## Usage
1. Make sure you have `kubectl` set up and pointing to the cluster and namespace you want to test.
2. Make sure your cluster has "dummy" auth configuration set with
   password "wat" (look in `stress.js` to see wat I mean)
2. `./runjob.bash NUM_RUNS RUN_COUNT DELAY CONNECT_IP`
    1. `NUM_RUNS`: How many times you want to run the load test.
    2. `RUN_COUNT`: How many simultaneous users you want to test in each run.
    3. `DELAY`: Delay between runs.
    4. `CONNECT_IP`: Global Hub IP to connect to?


## Checking results
Upon running the above, you'll see output like this (varying upon your config).

```
[christian@christian-thinkpad jupyterhub-loadtest]$ ./runjob.bash 1 3 3 35.188.241.177
pod "j-b-1-c" configured
```

Then, you can run (subbing in the name of your pods)
```
kubectl logs j-b-1-c
```
 to get JSON logs back from the server. Parse these at your pleasure.

## Interesting metrics (incl. parsing recipes)
This section is in-progress.


## Running more tests
Make sure to clear out the old pods..

```
kubectl delete pods j-b-1-c
```
